/**
 * Anthropic API Client (shared)
 *
 * Direct integration with Anthropic's Messages API for Ask Viv Assistant.
 * The Lovable AI Gateway does not support Anthropic/Claude models at all
 * (confirmed against Lovable's own docs) — this bypasses the gateway
 * entirely, the same way _shared/openai-embeddings.ts already bypasses it
 * for embeddings (a different gap in gateway support). This is a new,
 * standalone integration pattern; nothing else in this codebase calls
 * Anthropic directly.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Main conversational model for Ask Viv Assistant. */
export const CLAUDE_SONNET_MODEL = "claude-sonnet-5";
/** Cheap tier for mechanical sub-tasks (e.g. conversation summarization) — not the main response. */
export const CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001";

export interface AnthropicCacheControl {
  type: "ephemeral";
}

export interface AnthropicTextBlock {
  type: "text";
  text: string;
  cache_control?: AnthropicCacheControl;
}

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock;

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface AnthropicResponse {
  id: string;
  content: AnthropicContentBlock[];
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  usage: AnthropicUsage;
}

function getApiKey(): string {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not configured in edge function secrets");
  }
  return key;
}

/**
 * Call Anthropic's Messages API directly.
 *
 * `system` accepts either a plain string or an array of text blocks — use
 * the array form with `cache_control: { type: "ephemeral" }` on the static
 * parts (system prompt, tool definitions are cached separately by Anthropic
 * automatically when tools are present) to get prompt-caching discounts on
 * repeated calls within an agentic tool-use loop.
 */
export async function callAnthropic(args: {
  model: string;
  system: string | AnthropicTextBlock[];
  messages: AnthropicMessage[];
  tools?: AnthropicToolDefinition[];
  max_tokens?: number;
  temperature?: number;
}): Promise<AnthropicResponse> {
  const apiKey = getApiKey();

  const body: Record<string, unknown> = {
    model: args.model,
    max_tokens: args.max_tokens ?? 2048,
    system: args.system,
    messages: args.messages,
  };
  if (args.temperature !== undefined) {
    body.temperature = args.temperature;
  }
  if (args.tools && args.tools.length > 0) {
    body.tools = args.tools;
  }

  const resp = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic API error: ${resp.status} ${errText}`);
  }

  return (await resp.json()) as AnthropicResponse;
}

/** Cheap-tier call for mechanical sub-tasks (e.g. conversation summarization) — Haiku, not Sonnet. */
export async function callAnthropicHaiku(args: {
  system: string;
  messages: AnthropicMessage[];
  max_tokens?: number;
}): Promise<AnthropicResponse> {
  return callAnthropic({
    model: CLAUDE_HAIKU_MODEL,
    system: args.system,
    messages: args.messages,
    max_tokens: args.max_tokens ?? 1024,
  });
}

/** Extract plain text from a response's content blocks (ignores tool_use blocks). */
export function extractText(response: AnthropicResponse): string {
  return response.content
    .filter((b): b is AnthropicTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/** Extract all tool_use blocks from a response, in order. */
export function extractToolUses(response: AnthropicResponse): AnthropicToolUseBlock[] {
  return response.content.filter((b): b is AnthropicToolUseBlock => b.type === "tool_use");
}

/** Sum usage across multiple responses — e.g. every round trip in one agentic loop. */
export function sumUsage(responses: AnthropicResponse[]): { input_tokens: number; output_tokens: number } {
  return responses.reduce(
    (acc, r) => ({
      input_tokens: acc.input_tokens + (r.usage?.input_tokens ?? 0),
      output_tokens: acc.output_tokens + (r.usage?.output_tokens ?? 0),
    }),
    { input_tokens: 0, output_tokens: 0 }
  );
}
