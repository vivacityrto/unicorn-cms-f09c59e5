import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import WebinarSeriesSubtitle from "./WebinarSeriesSubtitle";

describe("WebinarSeriesSubtitle", () => {
  it("renders the series name when set", () => {
    render(<WebinarSeriesSubtitle series="Inside VET" />);
    expect(screen.getByText("Inside VET")).toBeInTheDocument();
  });

  it("renders nothing when series is null", () => {
    const { container } = render(<WebinarSeriesSubtitle series={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when series is undefined", () => {
    const { container } = render(<WebinarSeriesSubtitle series={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when series is empty or whitespace", () => {
    const empty = render(<WebinarSeriesSubtitle series="" />);
    expect(empty.container).toBeEmptyDOMElement();
    empty.unmount();

    const blank = render(<WebinarSeriesSubtitle series="   " />);
    expect(blank.container).toBeEmptyDOMElement();
  });
});
