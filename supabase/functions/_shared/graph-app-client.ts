/**
 * Centralised Microsoft Graph app-level client using client_credentials grant.
 *
 * All document-management SharePoint operations import from here so that
 * token acquisition, retry logic and upload helpers live in one place.
 *
 * Required Supabase secrets:
 *   MICROSOFT_CLIENT_ID
 *   MICROSOFT_CLIENT_SECRET
 *   MICROSOFT_TENANT_ID
 *
 * Azure AD app permissions (application, not delegated):
 *   Sites.ReadWrite.All
 *   Files.ReadWrite.All
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ── Token cache (per-isolate) ───────────────────────────────────────────────
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

/**
 * Acquire an app-level access token via the client_credentials OAuth grant.
 * Tokens are cached in-memory until 60 s before expiry.
 */
export async function getAppToken(): Promise<string> {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiry) return _cachedToken;

  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  const tenantId = Deno.env.get("MICROSOFT_TENANT_ID");

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error(
      "Missing Microsoft credentials: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID",
    );
  }

  const resp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("[graph-app-client] Token request failed:", resp.status, errText);
    throw new Error(`Failed to obtain app token: ${resp.status}`);
  }

  const json = await resp.json();
  _cachedToken = json.access_token as string;
  // Cache until 60 s before expiry (tokens are typically 3600 s)
  _tokenExpiry = now + (json.expires_in as number) * 1000 - 60_000;
  return _cachedToken;
}

// ── Generic request helpers ─────────────────────────────────────────────────

export interface GraphResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  raw: Response;
}

async function graphRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<GraphResponse<T>> {
  const token = await getAppToken();
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...extraHeaders,
  };
  if (body && typeof body !== "string" && !(body instanceof ArrayBuffer) && !(body instanceof Uint8Array)) {
    headers["Content-Type"] = "application/json";
  }

  const init: RequestInit = { method, headers };
  if (body) {
    init.body =
      typeof body === "string" || body instanceof ArrayBuffer || body instanceof Uint8Array
        ? body
        : JSON.stringify(body);
  }

  const resp = await fetch(url, init);
  let data: T;
  const ct = resp.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    data = await resp.json();
  } else {
    // For binary / empty responses, consume and return status only
    await resp.arrayBuffer().catch(() => {});
    data = {} as T;
  }

  return { ok: resp.ok, status: resp.status, data, raw: resp };
}

/** GET helper */
export function graphGet<T = unknown>(path: string): Promise<GraphResponse<T>> {
  return graphRequest<T>("GET", path);
}

/** POST helper */
export function graphPost<T = unknown>(path: string, body?: unknown): Promise<GraphResponse<T>> {
  return graphRequest<T>("POST", path, body);
}

/** PUT helper */
export function graphPut<T = unknown>(
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<GraphResponse<T>> {
  return graphRequest<T>("PUT", path, body, extraHeaders);
}

/** PATCH helper */
export function graphPatch<T = unknown>(path: string, body?: unknown): Promise<GraphResponse<T>> {
  return graphRequest<T>("PATCH", path, body);
}

/** DELETE helper */
export function graphDelete<T = unknown>(path: string): Promise<GraphResponse<T>> {
  return graphRequest<T>("DELETE", path);
}

// ── File operations ─────────────────────────────────────────────────────────

export interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
  file?: { mimeType: string };
  folder?: { childCount: number };
  [key: string]: unknown;
}

/**
 * Upload a small file (< 4 MB) using a single PUT.
 */
export async function graphUploadSmall(
  driveId: string,
  parentItemId: string,
  fileName: string,
  content: Uint8Array | ArrayBuffer,
): Promise<DriveItem> {
  const path = `/drives/${driveId}/items/${parentItemId}:/${encodeURIComponent(fileName)}:/content`;
  const token = await getAppToken();

  const resp = await fetch(`${GRAPH_BASE}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: content,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Upload failed for "${fileName}": ${resp.status} ${errText}`);
  }

  return await resp.json() as DriveItem;
}

/**
 * Upload a large file (≥ 4 MB) using an upload session.
 * Chunks are 3.75 MB (must be a multiple of 320 KiB).
 */
export async function graphUploadSession(
  driveId: string,
  parentItemId: string,
  fileName: string,
  content: Uint8Array,
): Promise<DriveItem> {
  const sessionPath = `/drives/${driveId}/items/${parentItemId}:/${encodeURIComponent(fileName)}:/createUploadSession`;
  const session = await graphPost<{ uploadUrl: string }>(sessionPath, {
    item: { "@microsoft.graph.conflictBehavior": "replace", name: fileName },
  });

  if (!session.ok || !session.data.uploadUrl) {
    throw new Error(`Failed to create upload session for "${fileName}": ${session.status}`);
  }

  const uploadUrl = session.data.uploadUrl;
  const chunkSize = 3_932_160; // 3.75 MB (320 KiB * 12)
  const totalSize = content.byteLength;
  let offset = 0;
  let result: DriveItem | null = null;

  while (offset < totalSize) {
    const end = Math.min(offset + chunkSize, totalSize);
    const chunk = content.slice(offset, end);

    const resp = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${offset}-${end - 1}/${totalSize}`,
      },
      body: chunk,
    });

    if (resp.status === 200 || resp.status === 201) {
      result = await resp.json() as DriveItem;
    } else if (resp.status === 202) {
      // More chunks expected
      await resp.json();
    } else {
      const errText = await resp.text();
      throw new Error(`Upload chunk failed at ${offset}: ${resp.status} ${errText}`);
    }

    offset = end;
  }

  if (!result) {
    throw new Error(`Upload session completed but no final response for "${fileName}"`);
  }
  return result;
}

/**
 * Download a file's content by drive item ID.
 */
export async function graphDownload(driveId: string, itemId: string): Promise<Uint8Array> {
  const token = await getAppToken();
  const resp = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "follow",
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Download failed for item ${itemId}: ${resp.status} ${errText}`);
  }

  return new Uint8Array(await resp.arrayBuffer());
}

/**
 * Search for items within a drive.
 */
export async function graphSearchDrive<T = { value: DriveItem[] }>(
  driveId: string,
  query: string,
): Promise<GraphResponse<T>> {
  return graphGet<T>(`/drives/${driveId}/root/search(q='${encodeURIComponent(query)}')`);
}

/**
 * Ensure a folder exists, creating it if necessary. Returns the folder's item details.
 */
export async function ensureFolder(
  driveId: string,
  parentPath: string,
  folderName: string,
): Promise<{ itemId: string; webUrl: string }> {
  const encodedParent = parentPath.replace(/^\//, "");
  const createUrl = `/drives/${driveId}/root:/${encodeURIComponent(encodedParent)}:/children`;

  const resp = await graphPost<DriveItem>(createUrl, {
    name: folderName,
    folder: {},
    "@microsoft.graph.conflictBehavior": "fail",
  });

  if (resp.status === 409) {
    // Already exists — fetch it
    const getPath = `/drives/${driveId}/root:/${encodeURIComponent(encodedParent)}/${encodeURIComponent(folderName)}`;
    const existing = await graphGet<DriveItem>(getPath);
    if (!existing.ok) {
      throw new Error(`Folder exists but could not retrieve: ${folderName}`);
    }
    return { itemId: existing.data.id, webUrl: existing.data.webUrl };
  }

  if (!resp.ok) {
    throw new Error(`Failed to create folder "${folderName}": ${resp.status}`);
  }

  return { itemId: resp.data.id, webUrl: resp.data.webUrl };
}

/** Convenience re-export so consumers don't need a separate import. */
export { GRAPH_BASE };
