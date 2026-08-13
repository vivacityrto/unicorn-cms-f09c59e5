/**
 * Behaviour tests for showcase title / album-id parsing.
 *
 * Run: node --experimental-strip-types --test supabase/functions/academy-import-vimeo-showcase/parse.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyVideos,
  extractAlbumId,
  extractVimeoVideoId,
  findExistingModule,
  parseShowcaseTitle,
} from "./parse.ts";

describe("extractAlbumId", () => {
  it("extracts the numeric id from a showcase URL, ignoring share query params", () => {
    assert.equal(
      extractAlbumId("https://vimeo.com/showcase/12364831?share=copy&fl=1&fe=1"),
      "12364831",
    );
    assert.equal(extractAlbumId("https://vimeo.com/showcase/12364831"), "12364831");
    assert.equal(extractAlbumId("https://www.vimeo.com/showcase/99"), "99");
  });

  it("accepts a raw numeric album id", () => {
    assert.equal(extractAlbumId(null, "12364831"), "12364831");
    assert.equal(extractAlbumId("12364831"), "12364831");
    assert.equal(extractAlbumId(undefined, 12364831), "12364831");
  });

  it("returns null when the input is not a showcase URL or id", () => {
    assert.equal(extractAlbumId("https://vimeo.com/1234567890"), null);
    assert.equal(extractAlbumId("not a url"), null);
    assert.equal(extractAlbumId(""), null);
    assert.equal(extractAlbumId(null, null), null);
  });
});

describe("parseShowcaseTitle", () => {
  it("parses the confirmed Cultural Safety titles", () => {
    assert.deepEqual(
      parseShowcaseTitle("M1 - Lesson 1 Understanding Cultural Safety"),
      { moduleNumber: 1, lessonNumber: 1, title: "Understanding Cultural Safety" },
    );
    assert.deepEqual(
      parseShowcaseTitle("M2 - Lesson 3 Managing Unconscious Bias"),
      { moduleNumber: 2, lessonNumber: 3, title: "Managing Unconscious Bias" },
    );
    assert.deepEqual(
      parseShowcaseTitle("M3 - Lesson 1 Features of a Safe Learning Environment"),
      { moduleNumber: 3, lessonNumber: 1, title: "Features of a Safe Learning Environment" },
    );
  });

  it("is tolerant of spacing, dash, and colon variants", () => {
    assert.deepEqual(
      parseShowcaseTitle("m1-lesson 1  Understanding Cultural Safety"),
      { moduleNumber: 1, lessonNumber: 1, title: "Understanding Cultural Safety" },
    );
    assert.deepEqual(
      parseShowcaseTitle("M1 – Lesson 1: Understanding Cultural Safety"),
      { moduleNumber: 1, lessonNumber: 1, title: "Understanding Cultural Safety" },
    );
    assert.deepEqual(
      parseShowcaseTitle("M10 - Lesson 2 - Nested Title"),
      { moduleNumber: 10, lessonNumber: 2, title: "Nested Title" },
    );
  });

  it("does not guess unmatched titles", () => {
    assert.equal(parseShowcaseTitle("Introduction to the course"), null);
    assert.equal(parseShowcaseTitle("Module 1 Lesson 1 Understanding Cultural Safety"), null);
    assert.equal(parseShowcaseTitle("M1 Lesson 1 Understanding Cultural Safety"), null);
    assert.equal(parseShowcaseTitle(""), null);
  });
});

describe("classifyVideos", () => {
  it("groups parsed videos by module then lesson number and collects unmatched", () => {
    const { parsed, unmatched } = classifyVideos([
      { uri: "/videos/30", name: "M2 - Lesson 3 Managing Unconscious Bias", link: "https://vimeo.com/30" },
      { uri: "/videos/10", name: "Welcome / trailer", link: "https://vimeo.com/10" },
      { uri: "/videos/20", name: "M1 - Lesson 2 Second lesson", link: "https://vimeo.com/20" },
      { uri: "/videos/11", name: "M1 - Lesson 1 First lesson", link: "https://vimeo.com/11" },
    ]);

    assert.deepEqual(
      parsed.map((item) => `${item.moduleNumber}.${item.lessonNumber}:${item.title}`),
      ["1.1:First lesson", "1.2:Second lesson", "2.3:Managing Unconscious Bias"],
    );
    assert.equal(unmatched.length, 1);
    assert.equal(unmatched[0].title, "Welcome / trailer");
    assert.equal(unmatched[0].vimeo_id, "10");
  });
});

describe("extractVimeoVideoId", () => {
  it("reads ids from URIs and canonical vimeo.com URLs", () => {
    assert.equal(extractVimeoVideoId("/videos/429877109"), "429877109");
    assert.equal(extractVimeoVideoId("https://vimeo.com/429877109"), "429877109");
    assert.equal(extractVimeoVideoId("https://player.vimeo.com/video/429877109"), "429877109");
    assert.equal(extractVimeoVideoId("https://example.com/watch"), null);
  });
});

describe("findExistingModule", () => {
  it("matches existing Module N titles without renaming", () => {
    const modules = [
      { id: 4, title: "Introduction" },
      { id: 5, title: "Module 1 - Choose Your Training Product" },
      { id: 6, title: "Module 2" },
    ];
    assert.equal(findExistingModule(modules, 1)?.id, 5);
    assert.equal(findExistingModule(modules, 2)?.id, 6);
    assert.equal(findExistingModule(modules, 3), null);
  });
});
