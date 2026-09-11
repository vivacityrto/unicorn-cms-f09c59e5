import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

import { generateQuiz } from "@/features/academy/generateQuiz";

describe("generateQuiz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls academy-ai-generate with the generate_questions action and given fields", async () => {
    mocks.invoke.mockResolvedValue({ data: { questions: [] }, error: null });
    await generateQuiz("Intro to Compliance", ["Staff"], "some transcript");
    expect(mocks.invoke).toHaveBeenCalledWith("academy-ai-generate", {
      body: {
        action: "generate_questions",
        title: "Intro to Compliance",
        target_audience: ["Staff"],
        context_text: "some transcript",
      },
    });
  });

  it("normalizes a data.questions response into QuizQuestion[]", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        questions: [
          { question_text: "What is RTO?", explanation: "Registered Training Organisation", options: [{ value: "a", label: "Correct", is_correct: true }] },
        ],
      },
      error: null,
    });
    const result = await generateQuiz("T", [], "");
    expect(result.ok).toBe(true);
    expect(result.questions).toHaveLength(1);
    expect(result.questions?.[0].question_text).toBe("What is RTO?");
    expect(result.questions?.[0].explanation).toBe("Registered Training Organisation");
    expect(result.questions?.[0].options).toEqual([{ value: "a", label: "Correct", is_correct: true }]);
    expect(result.questions?.[0].key).toMatch(/^q-\d+-0$/);
  });

  it("accepts a bare-array response shape (no .questions wrapper)", async () => {
    mocks.invoke.mockResolvedValue({
      data: [{ question_text: "Q1" }, { question_text: "Q2" }],
      error: null,
    });
    const result = await generateQuiz("T", [], "");
    expect(result.questions).toHaveLength(2);
    expect(result.questions?.map((q) => q.question_text)).toEqual(["Q1", "Q2"]);
  });

  it("defaults missing question_text/explanation to empty strings and normalizes missing options to []", async () => {
    mocks.invoke.mockResolvedValue({ data: { questions: [{}] }, error: null });
    const result = await generateQuiz("T", [], "");
    expect(result.questions?.[0]).toMatchObject({ question_text: "", explanation: "", options: [] });
  });

  it("normalizes an option's missing value by position and is_correct by default (false)", async () => {
    // label falls back to String(the whole raw option) when opt.label is
    // missing, per normaliseOptions's existing `opt.label ?? o ?? ""` --
    // preserved verbatim, not something this extraction should "fix".
    mocks.invoke.mockResolvedValue({
      data: { questions: [{ question_text: "Q", options: [{}, { is_correct: true }] }] },
      error: null,
    });
    const result = await generateQuiz("T", [], "");
    expect(result.questions?.[0].options).toEqual([
      { value: "a", label: "[object Object]", is_correct: false },
      { value: "b", label: "[object Object]", is_correct: true },
    ]);
  });

  it("falls back an option's label to empty string only when the raw option itself is falsy", async () => {
    mocks.invoke.mockResolvedValue({
      data: { questions: [{ question_text: "Q", options: [null, undefined, ""] }] },
      error: null,
    });
    const result = await generateQuiz("T", [], "");
    expect(result.questions?.[0].options).toEqual([
      { value: "a", label: "", is_correct: false },
      { value: "b", label: "", is_correct: false },
      { value: "c", label: "", is_correct: false },
    ]);
  });

  it("surfaces a structured Edge error message", async () => {
    const context = { clone: () => ({ json: async () => ({ error: "Quota exceeded" }), text: async () => "" }) };
    mocks.invoke.mockResolvedValue({ data: null, error: Object.assign(new Error("edge failed"), { context }) });
    const result = await generateQuiz("T", [], "");
    expect(result).toEqual({ ok: false, questions: null, error: "Quota exceeded" });
  });

  it("falls back to a generic message when the thrown error has no message", async () => {
    mocks.invoke.mockImplementationOnce(() => {
      throw "not an Error instance";
    });
    const result = await generateQuiz("T", [], "");
    expect(result).toEqual({ ok: false, questions: null, error: "Failed to generate questions" });
  });
});
