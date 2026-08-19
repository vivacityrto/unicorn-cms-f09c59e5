import { describe, expect, it } from "vitest";
import { ACADEMY_WEBINAR_SERIES } from "./aiAssist";

describe("ACADEMY_WEBINAR_SERIES", () => {
  it("lists the eight recording series in the expected order", () => {
    expect(ACADEMY_WEBINAR_SERIES.map((s) => s.value)).toEqual([
      "AI in Your RTO",
      "Inside VET",
      "Trainers Edge",
      "8 Critical Drivers to RTO Success",
      "Superhero Tools Unleashed",
      "The Compliance Lab",
      "CRICOS",
      "Courses",
    ]);
  });

  it("treats CRICOS and Courses as standard webinars", () => {
    expect(ACADEMY_WEBINAR_SERIES.find((s) => s.value === "CRICOS")?.session_type).toBe("webinar");
    expect(ACADEMY_WEBINAR_SERIES.find((s) => s.value === "Courses")?.session_type).toBe("webinar");
    expect(ACADEMY_WEBINAR_SERIES.find((s) => s.value === "The Compliance Lab")?.session_type).toBe("workshop");
  });
});
