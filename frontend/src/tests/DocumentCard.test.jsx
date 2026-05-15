import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import DocumentCard from "../components/DocumentCard";

const baseDoc = { id: "1", title: "My Book", type: "epub", status: "unread", saved_at: "2026-01-01" };

test("renders document title", () => {
  render(<DocumentCard doc={baseDoc} onClick={() => {}} />);
  expect(screen.getByText("My Book")).toBeTruthy();
});

test("calls onClick when not in edit mode", () => {
  const onClick = vi.fn();
  render(<DocumentCard doc={baseDoc} onClick={onClick} />);
  fireEvent.click(screen.getByText("My Book"));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test("does not call onClick when in edit mode", () => {
  const onClick = vi.fn();
  render(<DocumentCard doc={baseDoc} onClick={onClick} editMode={true} onDeleteClick={() => {}} />);
  fireEvent.click(screen.getByText("My Book"));
  expect(onClick).not.toHaveBeenCalled();
});

test("shows delete button in edit mode and confirmation UI when isConfirming", () => {
  const onDeleteClick = vi.fn();
  const onConfirmDelete = vi.fn();
  const onCancelDelete = vi.fn();
  const { rerender } = render(
    <DocumentCard
      doc={baseDoc}
      onClick={() => {}}
      editMode={true}
      onDeleteClick={onDeleteClick}
      isConfirming={false}
      onConfirmDelete={onConfirmDelete}
      onCancelDelete={onCancelDelete}
    />
  );
  const deleteBtn = screen.getByRole("button", { name: /delete my book/i });
  expect(deleteBtn).toBeTruthy();
  rerender(
    <DocumentCard
      doc={baseDoc}
      onClick={() => {}}
      editMode={true}
      onDeleteClick={onDeleteClick}
      isConfirming={true}
      onConfirmDelete={onConfirmDelete}
      onCancelDelete={onCancelDelete}
    />
  );
  expect(screen.getByRole("button", { name: /confirm delete/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
});

test("does not show confirmation UI when isConfirming is true but editMode is false", () => {
  render(
    <DocumentCard
      doc={baseDoc}
      onClick={() => {}}
      editMode={false}
      isConfirming={true}
      onConfirmDelete={() => {}}
      onCancelDelete={() => {}}
    />
  );
  expect(screen.queryByRole("button", { name: /confirm delete/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();
});
