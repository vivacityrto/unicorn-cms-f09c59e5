import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { ElementType } from "react";

// Question option shape. `_scoring_enabled` is a sentinel object appended to
// (and filtered back out of) the options array to persist the scoring toggle
// through the `options` Json column, rather than adding a dedicated column.
export interface QuestionOption {
  id?: string;
  label?: string;
  color?: string;
  _scoring_enabled?: boolean;
}

export interface CanvasQuestion {
  id: string;
  tempId?: string;
  question_type: string;
  label: string;
  order_index: number;
  options?: QuestionOption[];
  category: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  notes?: string;
  scoring_enabled?: boolean;
  media_files?: { name: string; url: string }[];
}

export interface ResponseSet {
  id: string;
  name: string;
  options: { label: string; color?: string }[];
}

export interface QuestionType {
  id: string;
  label: string;
  icon: ElementType;
  color: string;
  category: "title_page" | "other_responses";
}

/**
 * Reorders canvasQuestions by drag event and re-sequences order_index to
 * match array order. Verbatim behavior preserved from
 * AuditTemplateBuilder.tsx's inline handleDragEnd. Returns null when the
 * drop target is missing or unchanged (the original's no-op guard).
 */
export function reorderCanvasQuestions(
  questions: CanvasQuestion[],
  event: DragEndEvent,
): CanvasQuestion[] | null {
  const { active, over } = event;
  if (!over || active.id === over.id) return null;
  const oldIndex = questions.findIndex((i) => i.id === active.id);
  const newIndex = questions.findIndex((i) => i.id === over.id);
  return arrayMove(questions, oldIndex, newIndex).map((item, index) => ({
    ...item,
    order_index: index,
  }));
}

/**
 * Builds a new canvas question for a question-type or response-set pick.
 * Verbatim behavior preserved from addQuestionToCanvas, including calling
 * Date.now() separately for `id` and `tempId` (as the original did) rather
 * than sharing one value -- they will almost always match in practice, but
 * this isn't the place to quietly change that.
 */
export function buildCanvasQuestion(
  type: QuestionType,
  currentLength: number,
  responseSet?: ResponseSet,
): CanvasQuestion {
  return {
    id: `temp-${Date.now()}`,
    tempId: `temp-${Date.now()}`,
    question_type: responseSet ? "multiple_choice" : type.id,
    label: "",
    order_index: currentLength,
    options: responseSet ? responseSet.options : [],
    category: type.category,
  };
}

export function deleteCanvasQuestion(questions: CanvasQuestion[], id: string): CanvasQuestion[] {
  return questions.filter((q) => q.id !== id);
}

export function updateCanvasQuestion(
  questions: CanvasQuestion[],
  id: string,
  updates: Partial<CanvasQuestion>,
): CanvasQuestion[] {
  return questions.map((q) => (q.id === id ? { ...q, ...updates } : q));
}
