/**
 * Additive / idempotent write checks for academy-import-vimeo-showcase.
 *
 * Re-running against an already-imported showcase must not duplicate lessons
 * or mutate existing Academy rows.
 *
 * Run: node --test supabase/functions/academy-import-vimeo-showcase/idempotency.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "index.ts"),
  "utf8",
);

function stripComments(input) {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("academy-import-vimeo-showcase idempotency", () => {
  it("skips training_videos that already exist for the Vimeo video id", () => {
    assert.match(src, /videoByVimeoId/);
    assert.match(src, /already imported/);
    assert.match(src, /videosSkipped/);
    assert.match(src, /extractVimeoVideoId/);
  });

  it("skips academy_lessons that already link that video_id on the target course", () => {
    assert.match(src, /lessonVideoIds/);
    assert.match(src, /lessonVideoIds\.has\(videoId\)/);
    assert.match(src, /\.eq\(\s*["']course_id["']\s*,\s*courseId\s*\)/);
  });

  it("reuses an existing module whose title matches Module {n} instead of inserting another", () => {
    assert.match(src, /findExistingModule/);
    assert.match(src, /moduleIdByNumber/);
  });

  it("does not update or delete academy_modules, academy_lessons, or training_videos", () => {
    const body = stripComments(src);
    assert.doesNotMatch(body, /\.update\s*\(/);
    assert.doesNotMatch(body, /\.delete\s*\(/);
    assert.doesNotMatch(body, /\.upsert\s*\(/);
  });
});
