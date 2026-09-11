import { supabase } from "@/integrations/supabase/client";

export interface QuizOption {
  value: string;
  label: string;
  is_correct: boolean;
}

export interface QuizQuestion {
  key: string;
  question_text: string;
  explanation: string;
  options: QuizOption[];
}

/** Shape of one raw question object returned by the generate_questions edge
 * function action, before it's normalised into a QuizQuestion. */
interface RawAiQuestion {
  question_text?: string;
  explanation?: string;
  options?: unknown;
}

function normaliseOptions(raw: unknown): QuizOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o: unknown, i: number) => {
    const opt = (o ?? {}) as Record<string, unknown>;
    return {
      value: String(opt.value ?? String.fromCharCode(97 + i)),
      label: String(opt.label ?? o ?? ""),
      is_correct: !!opt.is_correct,
    };
  });
}

/** Pull the real message out of a Supabase Functions error instead of "non-2xx status code". */
async function extractEdgeError(err: unknown, fallback: string): Promise<string> {
  const e = (err ?? {}) as { context?: { clone?: () => { json: () => Promise<unknown>; text: () => Promise<string> } }; message?: string };
  const res = e.context;
  if (res && typeof res.clone === "function") {
    try {
      const body = (await res.clone().json()) as Record<string, unknown>;
      const msg = body?.error || body?.message || body?.reason;
      if (msg) return String(msg);
    } catch {
      try {
        const text = await res.clone().text();
        if (text?.trim()) return text.trim().slice(0, 500);
      } catch { /* ignore */ }
    }
  }
  return e.message || fallback;
}

export interface GenerateQuizResult {
  ok: boolean;
  questions: QuizQuestion[] | null;
  error: string | null;
}

/**
 * Calls the academy-ai-generate Edge Function's generate_questions action
 * and normalizes the response into QuizQuestion[]. Verbatim behavior
 * preserved from AcademyAddCoursePage.tsx's inline handleGenerateQuiz,
 * including the `q-<timestamp>-<index>` key generation and the
 * data.questions-or-bare-array response shape tolerance.
 */
export async function generateQuiz(
  title: string,
  targetAudience: string[],
  transcript: string,
): Promise<GenerateQuizResult> {
  try {
    const { data, error } = await supabase.functions.invoke("academy-ai-generate", {
      body: {
        action: "generate_questions",
        title,
        target_audience: targetAudience,
        context_text: transcript,
      },
    });
    if (error) throw new Error(await extractEdgeError(error, "Failed to generate questions"));
    const raw = Array.isArray(data?.questions) ? data.questions : Array.isArray(data) ? data : [];
    const questions = raw.map((q: RawAiQuestion, i: number) => ({
      key: `q-${Date.now()}-${i}`,
      question_text: String(q?.question_text ?? ""),
      explanation: String(q?.explanation ?? ""),
      options: normaliseOptions(q?.options),
    }));
    return { ok: true, questions, error: null };
  } catch (e: unknown) {
    return { ok: false, questions: null, error: e instanceof Error ? e.message : "Failed to generate questions" };
  }
}
