import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// Import the pure functions we want to test
import {
  classifyArtifact,
  extractSharePointLinks,
} from "./index.ts";

// ── classifyArtifact tests ───────────────────────────────────────────

Deno.test("classifyArtifact: mp4 by mimeType → recording", () => {
  assertEquals(classifyArtifact("meeting.mp4", "video/mp4"), "recording");
});

Deno.test("classifyArtifact: webm by mimeType → recording", () => {
  assertEquals(classifyArtifact("call.webm", "video/webm"), "recording");
});

Deno.test("classifyArtifact: audio/mpeg → recording", () => {
  assertEquals(classifyArtifact("audio.mp3", "audio/mpeg"), "recording");
});

Deno.test("classifyArtifact: vtt by mimeType → transcript", () => {
  assertEquals(classifyArtifact("captions.vtt", "text/vtt"), "transcript");
});

Deno.test("classifyArtifact: text/plain → transcript", () => {
  assertEquals(classifyArtifact("notes.txt", "text/plain"), "transcript");
});

Deno.test("classifyArtifact: docx without 'transcript' in name → shared_file", () => {
  assertEquals(
    classifyArtifact(
      "meeting-notes.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ),
    "shared_file"
  );
});

Deno.test("classifyArtifact: docx WITH 'transcript' in name → transcript", () => {
  assertEquals(
    classifyArtifact(
      "Meeting Transcript.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ),
    "transcript"
  );
});

Deno.test("classifyArtifact: mp4 extension fallback (no mimeType) → recording", () => {
  assertEquals(classifyArtifact("recording_2025.mp4"), "recording");
});

Deno.test("classifyArtifact: .vtt extension fallback → transcript", () => {
  assertEquals(classifyArtifact("subtitles.vtt"), "transcript");
});

Deno.test("classifyArtifact: .srt extension → transcript", () => {
  assertEquals(classifyArtifact("captions.srt"), "transcript");
});

Deno.test("classifyArtifact: .mov extension → recording", () => {
  assertEquals(classifyArtifact("video.mov"), "recording");
});

Deno.test("classifyArtifact: name heuristic 'transcript' → transcript", () => {
  assertEquals(classifyArtifact("meeting_transcript_final.pdf"), "transcript");
});

Deno.test("classifyArtifact: name heuristic 'recording' → recording", () => {
  assertEquals(classifyArtifact("meeting_recording_20250210"), "recording");
});

Deno.test("classifyArtifact: unknown file → shared_file", () => {
  assertEquals(classifyArtifact("budget.xlsx"), "shared_file");
});

Deno.test("classifyArtifact: unknown mimeType → falls through to extension", () => {
  assertEquals(classifyArtifact("clip.mp4", "application/octet-stream"), "recording");
});

Deno.test("classifyArtifact: empty name → shared_file", () => {
  assertEquals(classifyArtifact(""), "shared_file");
});

// ── extractSharePointLinks tests ─────────────────────────────────────

Deno.test("extractSharePointLinks: extracts standard SharePoint URL", () => {
  const html = `<p>See file at <a href="https://contoso.sharepoint.com/sites/team/Shared%20Documents/report.pdf">link</a></p>`;
  const links = extractSharePointLinks(html);
  assertEquals(links.length, 1);
  assertEquals(links[0], "https://contoso.sharepoint.com/sites/team/Shared%20Documents/report.pdf");
});

Deno.test("extractSharePointLinks: extracts OneDrive personal URL", () => {
  const html = `Check <a href="https://contoso-my.sharepoint.com/personal/user_contoso_com/Documents/recording.mp4">here</a>`;
  const links = extractSharePointLinks(html);
  assertEquals(links.length, 1);
  assertEquals(links[0].includes("contoso-my.sharepoint.com"), true);
});

Deno.test("extractSharePointLinks: extracts multiple URLs", () => {
  const html = `
    <p><a href="https://a.sharepoint.com/sites/t/doc1.pdf">doc1</a></p>
    <p><a href="https://b.sharepoint.com/sites/t/doc2.xlsx">doc2</a></p>
    <p><a href="https://c-my.sharepoint.com/personal/u/recording.mp4">rec</a></p>
  `;
  const links = extractSharePointLinks(html);
  assertEquals(links.length, 3);
});

Deno.test("extractSharePointLinks: deduplicates identical URLs", () => {
  const html = `
    <a href="https://contoso.sharepoint.com/doc.pdf">link1</a>
    <a href="https://contoso.sharepoint.com/doc.pdf">link2</a>
  `;
  const links = extractSharePointLinks(html);
  assertEquals(links.length, 1);
});

Deno.test("extractSharePointLinks: decodes &amp; entities", () => {
  const html = `<a href="https://contoso.sharepoint.com/sites/team?param=1&amp;other=2">link</a>`;
  const links = extractSharePointLinks(html);
  assertEquals(links.length, 1);
  assertEquals(links[0].includes("&amp;"), false);
  assertEquals(links[0].includes("&other=2"), true);
});

Deno.test("extractSharePointLinks: ignores non-SharePoint URLs", () => {
  const html = `
    <a href="https://google.com/doc">g</a>
    <a href="https://teams.microsoft.com/meet/abc">teams</a>
    <a href="https://contoso.sharepoint.com/sites/t/file.docx">sp</a>
  `;
  const links = extractSharePointLinks(html);
  assertEquals(links.length, 1);
  assertEquals(links[0].includes("sharepoint.com"), true);
});

Deno.test("extractSharePointLinks: returns empty for no links", () => {
  const html = `<p>No links here, just text about a meeting.</p>`;
  const links = extractSharePointLinks(html);
  assertEquals(links.length, 0);
});

Deno.test("extractSharePointLinks: handles empty string", () => {
  assertEquals(extractSharePointLinks("").length, 0);
});

Deno.test("extractSharePointLinks: extracts onedrive.live.com URLs", () => {
  const html = `<a href="https://onedrive.live.com/view.aspx?id=abc123">file</a>`;
  const links = extractSharePointLinks(html);
  assertEquals(links.length, 1);
  assertEquals(links[0].includes("onedrive.live.com"), true);
});

// ── Recording/Transcript warning scenario ────────────────────────────

Deno.test("classifyArtifact: mixed recording+transcript from Recordings folder", () => {
  // Simulate what discoverRecordings would classify
  const items = [
    { name: "Meeting-20250210.mp4", mimeType: "video/mp4" },
    { name: "Meeting-20250210.vtt", mimeType: "text/vtt" },
    { name: "Shared Agenda.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  ];

  const classified = items.map(i => classifyArtifact(i.name, i.mimeType));
  assertEquals(classified, ["recording", "transcript", "shared_file"]);

  const hasRecording = classified.includes("recording");
  const hasTranscript = classified.includes("transcript");
  assertEquals(hasRecording, true);
  assertEquals(hasTranscript, true);
});

Deno.test("classifyArtifact: recording only (no transcript) triggers warning condition", () => {
  const items = [
    { name: "Meeting-20250210.mp4", mimeType: "video/mp4" },
  ];

  const classified = items.map(i => classifyArtifact(i.name, i.mimeType));
  const hasRecording = classified.includes("recording");
  const hasTranscript = classified.includes("transcript");

  assertEquals(hasRecording, true);
  assertEquals(hasTranscript, false);
  // This would set ms_sync_status = 'warning'
});
