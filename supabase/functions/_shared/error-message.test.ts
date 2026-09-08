import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getErrorMessage } from "./error-message.ts";

describe("getErrorMessage", () => {
  it("preserves native Error messages", () => {
    assert.equal(getErrorMessage(new Error("invalid recurrence")), "invalid recurrence");
  });

  it("preserves message-bearing PostgREST result errors", () => {
    const postgrestError = {
      message: "database insert failed",
      details: "duplicate key",
      hint: null,
      code: "23505",
    };
    assert.equal(getErrorMessage(postgrestError), "database insert failed");
  });

  it("uses the supplied fallback for values without a string message", () => {
    assert.equal(getErrorMessage({ message: 500 }, "request failed"), "request failed");
    assert.equal(getErrorMessage("failure", "request failed"), "request failed");
    assert.equal(getErrorMessage(null, "request failed"), "request failed");
  });
});
