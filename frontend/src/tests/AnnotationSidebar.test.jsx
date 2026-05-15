import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import AnnotationSidebar from "../components/AnnotationSidebar";

const highlights = [
  {
    id: "h1",
    text: "First highlight",
    note: "my note",
    color: "yellow",
    position: { type: "text_range", start_offset: 0, end_offset: 15 },
  },
  {
    id: "h2",
    text: "Second highlight",
    note: "",
    color: "blue",
    position: { type: "pdf_range", page: 2, rects: [] },
  },
];

test("renders all annotation cards", () => {
  render(<AnnotationSidebar highlights={highlights} onDelete={vi.fn()} onJumpTo={vi.fn()} />);
  expect(screen.getByText("First highlight")).toBeInTheDocument();
  expect(screen.getByText("Second highlight")).toBeInTheDocument();
});

test("delete button calls onDelete with highlight id", () => {
  const onDelete = vi.fn();
  render(<AnnotationSidebar highlights={highlights} onDelete={onDelete} onJumpTo={vi.fn()} />);
  const deleteButtons = screen.getAllByTitle("Delete");
  fireEvent.click(deleteButtons[0]);
  expect(onDelete).toHaveBeenCalledWith("h1");
});

test("Notes tab shows only highlights with notes", () => {
  render(<AnnotationSidebar highlights={highlights} onDelete={vi.fn()} onJumpTo={vi.fn()} />);
  fireEvent.click(screen.getByText("Notes"));
  expect(screen.getByText("First highlight")).toBeInTheDocument();
  expect(screen.queryByText("Second highlight")).not.toBeInTheDocument();
});

test("shows page number for pdf_range, source label for text_range", () => {
  render(<AnnotationSidebar highlights={highlights} onDelete={vi.fn()} onJumpTo={vi.fn()} />);
  expect(screen.getByText("PDF · p.2")).toBeInTheDocument();
  // "EPUB" appears in both the source-filter tab and the card label
  expect(screen.getAllByText("EPUB").length).toBeGreaterThanOrEqual(1);
});
