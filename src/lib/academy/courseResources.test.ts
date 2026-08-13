import { describe, expect, it } from "vitest";
import {
  bucketForUpload,
  canManageAcademyResources,
  fileExtension,
  isAllowedUploadFile,
  isHttpsUrl,
  mimeForUpload,
  resourceKind,
  storagePathForResource,
  titleFromFilename,
} from "./courseResources";

describe("course resource helpers", () => {
  it("accepts only pdf and word extensions", () => {
    expect(isAllowedUploadFile({ name: "guide.pdf" })).toBe(true);
    expect(isAllowedUploadFile({ name: "template.DOCX" })).toBe(true);
    expect(isAllowedUploadFile({ name: "legacy.doc" })).toBe(true);
    expect(isAllowedUploadFile({ name: "notes.txt" })).toBe(false);
    expect(isAllowedUploadFile({ name: "slide.pptx" })).toBe(false);
    expect(isAllowedUploadFile({ name: "archive.zip" })).toBe(false);
  });

  it("routes pdfs and word docs to the correct buckets", () => {
    expect(bucketForUpload({ name: "a.pdf" })).toBe("resource-pdfs");
    expect(bucketForUpload({ name: "a.docx" })).toBe("resource-templates");
    expect(bucketForUpload({ name: "a.doc" })).toBe("resource-templates");
  });

  it("builds {resource_id}/{filename} storage paths", () => {
    expect(storagePathForResource("abc-123", "Handout.pdf")).toBe("abc-123/Handout.pdf");
    expect(storagePathForResource("abc-123", "nested/path.docx")).toBe("abc-123/nested_path.docx");
  });

  it("validates https URLs only", () => {
    expect(isHttpsUrl("https://example.com/doc")).toBe(true);
    expect(isHttpsUrl("  https://example.com/doc  ")).toBe(true);
    expect(isHttpsUrl("http://example.com/doc")).toBe(false);
    expect(isHttpsUrl("example.com")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("")).toBe(false);
  });

  it("classifies pdf, word, and link resources", () => {
    expect(resourceKind({ resource_type: "link", file_url: "https://example.com" })).toBe("link");
    expect(resourceKind({ resource_type: "file", storage_bucket: "resource-pdfs", storage_path: "id/a.pdf" })).toBe("pdf");
    expect(resourceKind({ resource_type: "file", storage_bucket: "resource-templates", storage_path: "id/a.docx" })).toBe("word");
    expect(resourceKind({ resource_type: "file", storage_path: "id/notes.doc" })).toBe("word");
    expect(resourceKind({ file_url: "https://example.com", storage_path: null })).toBe("link");
  });

  it("matches can_manage_academy_resources(), not academy.builder.edit", () => {
    expect(canManageAcademyResources("Super Admin", true)).toBe(true);
    expect(canManageAcademyResources("Team Leader", false)).toBe(true);
    expect(canManageAcademyResources("Team Member", false)).toBe(true);
    expect(canManageAcademyResources("BGT", false)).toBe(false);
    expect(canManageAcademyResources("Integrator", false)).toBe(false);
    expect(canManageAcademyResources("CSC", false)).toBe(false);
    expect(canManageAcademyResources(null, false)).toBe(false);
    expect(canManageAcademyResources("BGT", true)).toBe(true);
  });

  it("derives a title from the filename", () => {
    expect(titleFromFilename("Session Handout.pdf")).toBe("Session Handout");
    expect(fileExtension("Session Handout.PDF")).toBe(".pdf");
    expect(mimeForUpload({ name: "a.docx" })).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });
});
