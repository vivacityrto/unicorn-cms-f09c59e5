import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CourseResourcesSection from "./CourseResourcesSection";

const mocks = vi.hoisted(() => ({
  addFile: vi.fn(),
  addLink: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
}));

vi.mock("@/hooks/academy/useAcademyCourseResources", () => ({
  COURSE_RESOURCES_KEY: "academy-course-resources",
  useAcademyCourseResources: () => ({ data: [], isLoading: false }),
  useAddCourseFileResource: () => ({ mutate: mocks.addFile, isPending: false }),
  useAddCourseLinkResource: () => ({ mutate: mocks.addLink, isPending: false }),
  useRemoveCourseResource: () => ({ mutate: mocks.remove, isPending: false }),
  useReorderCourseResources: () => ({ mutate: mocks.reorder, isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function renderSection() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <CourseResourcesSection courseId={42} canManage />
    </QueryClientProvider>,
  );
}

describe("CourseResourcesSection file dropzone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a valid dropped file and derives its title", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Add Resource" }));

    const dropzone = screen.getByTestId("course-resource-dropzone");
    const file = new File(["course content"], "Training Guide.pdf", { type: "application/pdf" });

    fireEvent.dragOver(dropzone);
    expect(dropzone).toHaveTextContent("Drop file to upload");

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(dropzone).toHaveTextContent("Drag and drop a file here");
    expect(screen.getByText("Training Guide.pdf")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Training Guide");
  });

  it("rejects a dropped file with an unsupported extension", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Add Resource" }));

    const dropzone = screen.getByTestId("course-resource-dropzone");
    const file = new File(["not supported"], "Training Guide.exe", { type: "application/octet-stream" });

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(screen.getByText(/Only PDF, Word, Excel, and Markdown documents/)).toBeInTheDocument();
    expect(screen.queryByText("Training Guide.exe")).not.toBeInTheDocument();
  });
});
