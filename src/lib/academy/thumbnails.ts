export type CourseBannerFields = {
  thumbnail_url: string | null;
  banner_thumbnail_url?: string | null;
  banner_thumbnail_position?: string | null;
  banner_thumbnail_fit?: string | null;
  banner_thumbnail_zoom?: number | null;
};

export type ResolvedCourseImage = {
  url: string;
  fit: "cover" | "contain";
  position: string;
  zoom: number;
};

/**
 * Resolves the 16:9 hero/banner image for a course: prefers a dedicated
 * banner image with its own framing, else falls back to the course card's
 * thumbnail_url centred/cover/1x — deliberately not the card's own
 * position/fit/zoom, since that framing is tuned for a square crop and
 * doesn't suit a 16:9 banner.
 */
export function resolveCourseBannerImage(course: CourseBannerFields): ResolvedCourseImage | null {
  if (course.banner_thumbnail_url) {
    return {
      url: course.banner_thumbnail_url,
      fit: (course.banner_thumbnail_fit as "cover" | "contain") || "cover",
      position: course.banner_thumbnail_position || "50% 50%",
      zoom: course.banner_thumbnail_zoom || 1,
    };
  }
  if (course.thumbnail_url) {
    return { url: course.thumbnail_url, fit: "cover", position: "50% 50%", zoom: 1 };
  }
  return null;
}
