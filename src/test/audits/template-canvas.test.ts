import { describe, expect, it } from "vitest";
import {
  buildCanvasQuestion,
  deleteCanvasQuestion,
  reorderCanvasQuestions,
  updateCanvasQuestion,
  type CanvasQuestion,
  type QuestionType,
  type ResponseSet,
} from "@/features/audits/templateCanvas";

function question(overrides: Partial<CanvasQuestion> & { id: string }): CanvasQuestion {
  return {
    question_type: "text_answer",
    label: overrides.id,
    order_index: 0,
    category: "other_responses",
    ...overrides,
  };
}

describe("reorderCanvasQuestions", () => {
  const items = [question({ id: "a", order_index: 0 }), question({ id: "b", order_index: 1 }), question({ id: "c", order_index: 2 })];

  it("reorders by drag event and re-sequences order_index to match", () => {
    const result = reorderCanvasQuestions(items, { active: { id: "a" }, over: { id: "c" } } as never);
    expect(result?.map((q) => q.id)).toEqual(["b", "c", "a"]);
    expect(result?.map((q) => q.order_index)).toEqual([0, 1, 2]);
  });

  it("returns null when over is missing", () => {
    expect(reorderCanvasQuestions(items, { active: { id: "a" }, over: null } as never)).toBeNull();
  });

  it("returns null when active and over are the same", () => {
    expect(reorderCanvasQuestions(items, { active: { id: "a" }, over: { id: "a" } } as never)).toBeNull();
  });
});

describe("buildCanvasQuestion", () => {
  const type: QuestionType = { id: "text_answer", label: "Text answer", icon: (() => null) as never, color: "text-red-500", category: "other_responses" };
  const responseSet: ResponseSet = { id: "rs-1", name: "Compliance", options: [{ label: "Compliant" }, { label: "Non-Compliant" }] };

  it("builds a plain question from a question type, with the current length as order_index", () => {
    const q = buildCanvasQuestion(type, 3);
    expect(q.question_type).toBe("text_answer");
    expect(q.category).toBe("other_responses");
    expect(q.order_index).toBe(3);
    expect(q.options).toEqual([]);
    expect(q.label).toBe("");
    expect(q.id).toMatch(/^temp-\d+$/);
    expect(q.tempId).toMatch(/^temp-\d+$/);
  });

  it("builds a multiple_choice question from a response-set pick, carrying its options", () => {
    const q = buildCanvasQuestion(type, 0, responseSet);
    expect(q.question_type).toBe("multiple_choice");
    expect(q.options).toEqual(responseSet.options);
    // category still comes from the question type, not the response set
    expect(q.category).toBe("other_responses");
  });
});

describe("deleteCanvasQuestion", () => {
  it("removes only the matching id", () => {
    const items = [question({ id: "a" }), question({ id: "b" })];
    expect(deleteCanvasQuestion(items, "a").map((q) => q.id)).toEqual(["b"]);
  });

  it("is a no-op when the id isn't present", () => {
    const items = [question({ id: "a" })];
    expect(deleteCanvasQuestion(items, "missing")).toEqual(items);
  });
});

describe("updateCanvasQuestion", () => {
  it("merges updates into only the matching question", () => {
    const items = [question({ id: "a", label: "Old" }), question({ id: "b", label: "Other" })];
    const result = updateCanvasQuestion(items, "a", { label: "New", required: true });
    expect(result.find((q) => q.id === "a")).toMatchObject({ label: "New", required: true });
    expect(result.find((q) => q.id === "b")).toMatchObject({ label: "Other" });
  });
});
