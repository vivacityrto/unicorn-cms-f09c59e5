import { describe, expect, it } from "vitest";
import {
  applyShowcaseOrder,
  autoOrganiseShowcase,
  hasShowcaseMetadataToRemove,
  hasShowcaseMetadataToRestore,
  moveShowcaseByDirection,
  moveShowcaseItemToModule,
  removeShowcaseMetadata,
  reorderShowcaseByDragEvent,
  reorderShowcaseItemsByDragEvent,
  resequenceParsed,
  restoreShowcaseMetadata,
  type ShowcaseParsedItem,
} from "@/features/academy/showcaseOrdering";

function parsedItem(overrides: Partial<ShowcaseParsedItem> & { vimeo_id: string }): ShowcaseParsedItem {
  return {
    module_number: 1,
    lesson_number: 1,
    title: overrides.vimeo_id,
    vimeo_id: overrides.vimeo_id,
    link: `https://vimeo.com/${overrides.vimeo_id}`,
    duration_seconds: 120,
    thumbnail_url: null,
    already_imported: false,
    existing_courses: [],
    ...overrides,
  };
}

interface TestDraft {
  key: string;
  vimeoId: string;
  lessonNumber: number;
  title: string;
  metadataFreeTitle: string;
  originalTitle: string;
}

function draft(overrides: Partial<TestDraft> & { vimeoId: string }): TestDraft {
  return {
    key: overrides.vimeoId,
    lessonNumber: 1,
    title: overrides.vimeoId,
    metadataFreeTitle: overrides.vimeoId,
    originalTitle: overrides.vimeoId,
    ...overrides,
  };
}

describe("resequenceParsed", () => {
  it("renumbers lesson_number within each module group, starting at 1, in array order", () => {
    const items = [
      parsedItem({ vimeo_id: "a", module_number: 1, lesson_number: 9 }),
      parsedItem({ vimeo_id: "b", module_number: 2, lesson_number: 9 }),
      parsedItem({ vimeo_id: "c", module_number: 1, lesson_number: 9 }),
      parsedItem({ vimeo_id: "d", module_number: 2, lesson_number: 9 }),
    ];
    const result = resequenceParsed(items);
    expect(result.map((i) => [i.module_number, i.lesson_number])).toEqual([
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ]);
  });
});

describe("applyShowcaseOrder", () => {
  it("resequences parsed and re-maps items to new lesson numbers by vimeo_id", () => {
    const parsed = [parsedItem({ vimeo_id: "a" }), parsedItem({ vimeo_id: "b" })];
    const items = [draft({ vimeoId: "a", lessonNumber: 5 }), draft({ vimeoId: "b", lessonNumber: 5 })];
    const ordered = [parsedItem({ vimeo_id: "b" }), parsedItem({ vimeo_id: "a" })];
    const result = applyShowcaseOrder(parsed, items, ordered);
    expect(result.parsed.map((i) => i.vimeo_id)).toEqual(["b", "a"]);
    expect(result.parsed.map((i) => i.lesson_number)).toEqual([1, 2]);
    expect(result.items.find((i) => i.vimeoId === "b")?.lessonNumber).toBe(1);
    expect(result.items.find((i) => i.vimeoId === "a")?.lessonNumber).toBe(2);
  });

  it("silently drops a drafted item whose vimeo_id is no longer present in parsed", () => {
    const parsed = [parsedItem({ vimeo_id: "a" })];
    const items = [draft({ vimeoId: "a" }), draft({ vimeoId: "orphan" })];
    const result = applyShowcaseOrder(parsed, items, parsed);
    expect(result.items.map((i) => i.vimeoId)).toEqual(["a"]);
  });

  it("leaves items empty when there were none to begin with", () => {
    const parsed = [parsedItem({ vimeo_id: "a" })];
    const result = applyShowcaseOrder(parsed, [], parsed);
    expect(result.items).toEqual([]);
  });
});

describe("reorderShowcaseByDragEvent", () => {
  const parsed = [parsedItem({ vimeo_id: "a" }), parsedItem({ vimeo_id: "b" }), parsedItem({ vimeo_id: "c" })];

  it("reorders by drag event active/over ids", () => {
    const result = reorderShowcaseByDragEvent(parsed, {
      active: { id: "a" },
      over: { id: "c" },
    } as never);
    expect(result?.map((i) => i.vimeo_id)).toEqual(["b", "c", "a"]);
  });

  it("returns null when over is missing", () => {
    expect(reorderShowcaseByDragEvent(parsed, { active: { id: "a" }, over: null } as never)).toBeNull();
  });

  it("returns null when active and over are the same", () => {
    expect(
      reorderShowcaseByDragEvent(parsed, { active: { id: "a" }, over: { id: "a" } } as never),
    ).toBeNull();
  });

  it("returns null when an id is not found", () => {
    expect(
      reorderShowcaseByDragEvent(parsed, { active: { id: "missing" }, over: { id: "a" } } as never),
    ).toBeNull();
  });
});

describe("moveShowcaseByDirection", () => {
  const parsed = [parsedItem({ vimeo_id: "a" }), parsedItem({ vimeo_id: "b" }), parsedItem({ vimeo_id: "c" })];

  it("swaps with the next item when moving down", () => {
    const result = moveShowcaseByDirection(parsed, 0, 1);
    expect(result?.map((i) => i.vimeo_id)).toEqual(["b", "a", "c"]);
  });

  it("returns null when moving out of bounds (top)", () => {
    expect(moveShowcaseByDirection(parsed, 0, -1)).toBeNull();
  });

  it("returns null when moving out of bounds (bottom)", () => {
    expect(moveShowcaseByDirection(parsed, 2, 1)).toBeNull();
  });
});

describe("autoOrganiseShowcase", () => {
  it("sorts by module_number then lesson_number", () => {
    const parsed = [
      parsedItem({ vimeo_id: "a", module_number: 2, lesson_number: 1 }),
      parsedItem({ vimeo_id: "b", module_number: 1, lesson_number: 2 }),
      parsedItem({ vimeo_id: "c", module_number: 1, lesson_number: 1 }),
    ];
    const result = autoOrganiseShowcase(parsed);
    expect(result.map((i) => i.vimeo_id)).toEqual(["c", "b", "a"]);
  });
});

describe("showcase metadata remove/restore", () => {
  const parsed = [parsedItem({ vimeo_id: "a", title: "1.1 Intro", lesson_title: "Intro", original_title: "1.1 Intro" })];
  const items = [draft({ vimeoId: "a", title: "1.1 Intro", metadataFreeTitle: "Intro", originalTitle: "1.1 Intro" })];

  it("detects when there is metadata to remove", () => {
    expect(hasShowcaseMetadataToRemove(parsed, items)).toBe(true);
  });

  it("removes numbering from both parsed and items titles", () => {
    const result = removeShowcaseMetadata(parsed, items);
    expect(result.parsed[0].title).toBe("Intro");
    expect(result.items[0].title).toBe("Intro");
  });

  it("reports no metadata to remove once already clean", () => {
    const clean = removeShowcaseMetadata(parsed, items);
    expect(hasShowcaseMetadataToRemove(clean.parsed, clean.items)).toBe(false);
  });

  it("detects when there is nothing to restore on already-original titles", () => {
    expect(hasShowcaseMetadataToRestore(parsed, items)).toBe(false);
  });

  it("restores original titles after they were removed", () => {
    const removed = removeShowcaseMetadata(parsed, items);
    expect(hasShowcaseMetadataToRestore(removed.parsed, removed.items)).toBe(true);
    const restored = restoreShowcaseMetadata(removed.parsed, removed.items);
    expect(restored.parsed[0].title).toBe("1.1 Intro");
    expect(restored.items[0].title).toBe("1.1 Intro");
  });
});

describe("moveShowcaseItemToModule", () => {
  const parsed = [
    parsedItem({ vimeo_id: "a", module_number: 1, title: "A" }),
    parsedItem({ vimeo_id: "b", module_number: 2, title: "B" }),
    parsedItem({ vimeo_id: "c", module_number: 2, title: "C" }),
  ];

  it("relocates the item to the end of the target module's existing items", () => {
    const result = moveShowcaseItemToModule(parsed, "a", 2);
    expect(result?.ordered.map((i) => i.vimeo_id)).toEqual(["b", "c", "a"]);
    expect(result?.ordered.find((i) => i.vimeo_id === "a")?.module_number).toBe(2);
    expect(result?.movedTitle).toBe("A");
  });

  it("returns null when the item is not found", () => {
    expect(moveShowcaseItemToModule(parsed, "missing", 2)).toBeNull();
  });

  it("returns null when the item is already in the target module", () => {
    expect(moveShowcaseItemToModule(parsed, "b", 2)).toBeNull();
  });
});

describe("reorderShowcaseItemsByDragEvent", () => {
  const parsed = [parsedItem({ vimeo_id: "a" }), parsedItem({ vimeo_id: "b" })];
  const items = [draft({ vimeoId: "a", key: "a" }), draft({ vimeoId: "b", key: "b" })];

  it("returns null when over is missing", () => {
    expect(
      reorderShowcaseItemsByDragEvent(parsed, items, true, { active: { id: "a" }, over: null } as never, 0),
    ).toBeNull();
  });

  it("applies and resyncs parsed when a preview exists", () => {
    const result = reorderShowcaseItemsByDragEvent(
      parsed,
      items,
      true,
      { active: { id: "a" }, over: { id: "b" } } as never,
      0,
    );
    expect(result?.changed).toBe("applied");
    if (result?.changed === "applied") {
      expect(result.parsed.map((i) => i.vimeo_id)).toEqual(["b", "a"]);
    }
  });

  it("only reorders items, leaving parsed untouched, when there is no preview", () => {
    const result = reorderShowcaseItemsByDragEvent(
      parsed,
      items,
      false,
      { active: { id: "a" }, over: { id: "b" } } as never,
      0,
    );
    expect(result?.changed).toBe("items-only");
    if (result?.changed === "items-only") {
      expect(result.items.map((i) => i.vimeoId)).toEqual(["b", "a"]);
    }
  });

  it("moves the selected index along with the dragged item", () => {
    const result = reorderShowcaseItemsByDragEvent(
      parsed,
      items,
      true,
      { active: { id: "a" }, over: { id: "b" } } as never,
      0,
    );
    expect(result?.nextSelectedIndex).toBe(1);
  });

  it("leaves the selected index unchanged when a different item was dragged", () => {
    const result = reorderShowcaseItemsByDragEvent(
      parsed,
      items,
      true,
      { active: { id: "a" }, over: { id: "b" } } as never,
      1,
    );
    expect(result?.nextSelectedIndex).toBe(1);
  });
});
