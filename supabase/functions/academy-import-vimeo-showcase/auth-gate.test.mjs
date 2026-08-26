/**
 * Regression checks for academy-import-vimeo-showcase caller authorization.
 *
 * Ensures the edge function gates on check_permission(academy.builder.edit / full)
 * — the same permission the course-builder UI uses — before any Vimeo fetch
 * or table insert.
 *
 * Run: node --test supabase/functions/academy-import-vimeo-showcase/auth-gate.test.mjs
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

describe("academy-import-vimeo-showcase authorization gate", () => {
  it("calls check_permission with academy.builder.edit / full", () => {
    assert.match(src, /rpc\(\s*["']check_permission["']/);
    assert.match(src, /p_feature_key:\s*["']academy\.builder\.edit["']/);
    assert.match(src, /p_min_level:\s*["']full["']/);
  });

  it("returns 401 when Authorization is missing or the token is invalid", () => {
    assert.match(src, /return json\(\s*req,\s*\{\s*error:\s*["']Unauthorized["']\s*\},\s*401\)/);
    assert.match(src, /authHeader\?\.startsWith\(\s*["']Bearer /);
    assert.match(src, /auth\.getUser\(/);
  });

  it("returns 403 when check_permission is false", () => {
    const permIdx = src.indexOf("check_permission");
    const forbiddenIdx = src.indexOf("403");
    assert.ok(permIdx >= 0, "check_permission call present");
    assert.ok(forbiddenIdx > permIdx, "403 follows the permission check");
    assert.match(src, /if\s*\(\s*!allowed\s*\)/);
  });

  it("applies the permission check before any Vimeo fetch or insert", () => {
    const permIdx = src.indexOf("check_permission");
    const vimeoIdx = src.indexOf("api.vimeo.com/albums/");
    const insertIdx = src.indexOf('.from("academy_modules")');
    const videoInsertIdx = src.indexOf('.from("training_videos")');
    const lessonInsertIdx = src.indexOf('.from("academy_lessons")');

    assert.ok(permIdx >= 0, "check_permission call present");
    assert.ok(vimeoIdx > permIdx, "Vimeo fetch after permission gate");
    assert.ok(insertIdx > permIdx, "academy_modules access after permission gate");
    assert.ok(videoInsertIdx > permIdx, "training_videos access after permission gate");
    assert.ok(lessonInsertIdx > permIdx, "academy_lessons access after permission gate");
  });
});
