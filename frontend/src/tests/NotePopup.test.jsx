import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi } from "vitest";
import NotePopup from "../components/NotePopup";

const defaultProps = {
  visible: true,
  selectionRect: { top: 100, left: 200, height: 20, right: 300 },
  selectedText: "Hello world",
  activeColor: "yellow",
  docId: "test-doc",
  onSave: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("shows selected text preview", () => {
  render(<NotePopup {...defaultProps} />);
  expect(screen.getByText("Hello world")).toBeInTheDocument();
});

test("Highlight Only calls onSave with activeColor and empty note", () => {
  render(<NotePopup {...defaultProps} />);
  fireEvent.click(screen.getByText("Highlight Only"));
  expect(defaultProps.onSave).toHaveBeenCalledWith("yellow", "");
});

test("Save Note calls onSave with typed note text", () => {
  render(<NotePopup {...defaultProps} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "My note" } });
  fireEvent.click(screen.getByText("Save Note"));
  expect(defaultProps.onSave).toHaveBeenCalledWith("yellow", "My note");
});

test("Cancel calls onClose when textarea is empty", () => {
  render(<NotePopup {...defaultProps} />);
  fireEvent.click(screen.getByText("Cancel"));
  expect(defaultProps.onClose).toHaveBeenCalled();
});

test("returns null when not visible", () => {
  const { container } = render(<NotePopup {...defaultProps} visible={false} />);
  expect(container.firstChild).toBeNull();
});

// --- Draft auto-save ---

test("saves draft to localStorage while typing (debounced 500ms)", () => {
  render(<NotePopup {...defaultProps} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "draft text" } });
  // Not saved yet
  expect(localStorage.getItem("draft_note_test-doc_new")).toBeNull();
  // Advance past debounce
  act(() => { vi.advanceTimersByTime(500); });
  const saved = JSON.parse(localStorage.getItem("draft_note_test-doc_new"));
  expect(saved.text).toBe("draft text");
  expect(saved.color).toBe("yellow");
  expect(saved.savedAt).toBeTruthy();
});

test("loads draft text and color from localStorage on open", () => {
  localStorage.setItem("draft_note_test-doc_new", JSON.stringify({
    text: "restored text",
    color: "blue",
    savedAt: new Date().toISOString(),
  }));
  render(<NotePopup {...defaultProps} />);
  expect(screen.getByRole("textbox").value).toBe("restored text");
});

test("Save Note clears the draft from localStorage", () => {
  localStorage.setItem("draft_note_test-doc_new", JSON.stringify({
    text: "some draft",
    color: "yellow",
    savedAt: new Date().toISOString(),
  }));
  render(<NotePopup {...defaultProps} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "final" } });
  fireEvent.click(screen.getByText("Save Note"));
  expect(localStorage.getItem("draft_note_test-doc_new")).toBeNull();
});

test("Highlight Only clears the draft from localStorage", () => {
  localStorage.setItem("draft_note_test-doc_new", JSON.stringify({
    text: "some draft",
    color: "yellow",
    savedAt: new Date().toISOString(),
  }));
  render(<NotePopup {...defaultProps} />);
  fireEvent.click(screen.getByText("Highlight Only"));
  expect(localStorage.getItem("draft_note_test-doc_new")).toBeNull();
});

// --- Cancel warning ---

test("Cancel with non-empty textarea shows unsaved-changes warning", () => {
  render(<NotePopup {...defaultProps} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "some text" } });
  fireEvent.click(screen.getByText("Cancel"));
  expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();
  expect(defaultProps.onClose).not.toHaveBeenCalled();
});

test("Discard closes without clearing localStorage draft", () => {
  localStorage.setItem("draft_note_test-doc_new", JSON.stringify({
    text: "kept draft",
    color: "yellow",
    savedAt: new Date().toISOString(),
  }));
  render(<NotePopup {...defaultProps} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "kept draft" } });
  fireEvent.click(screen.getByText("Cancel"));
  fireEvent.click(screen.getByText("Discard"));
  expect(defaultProps.onClose).toHaveBeenCalled();
  // Draft should still be in localStorage (not cleared on discard)
  expect(localStorage.getItem("draft_note_test-doc_new")).not.toBeNull();
});

test("Keep editing dismisses warning and keeps panel open", () => {
  render(<NotePopup {...defaultProps} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "some text" } });
  fireEvent.click(screen.getByText("Cancel"));
  expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Keep editing"));
  expect(screen.queryByText("You have unsaved changes")).not.toBeInTheDocument();
  expect(defaultProps.onClose).not.toHaveBeenCalled();
});
