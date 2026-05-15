import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import DocumentReader from "../pages/DocumentReader";
import api from "../api";

vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {} }));
vi.mock("tesseract.js", () => ({ createWorker: vi.fn() }));
vi.mock("../api");

test("renders Document Reader heading and back button", async () => {
  api.get = vi.fn().mockResolvedValue({ data: [] });
  render(<MemoryRouter><DocumentReader /></MemoryRouter>);
  expect(screen.getByText("Document Reader")).toBeTruthy();
  expect(screen.getByRole("button", { name: /← Library/i })).toBeTruthy();
});

test("save URL input calls API", async () => {
  api.get = vi.fn().mockResolvedValue({ data: [] });
  api.post = vi.fn().mockResolvedValue({ data: { id: "2", status: "processing" } });
  render(<MemoryRouter><DocumentReader /></MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText(/paste url/i), {
    target: { value: "https://example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: /save/i }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/documents", { url: "https://example.com" }));
});

test("upload PDF button triggers file input and calls API", async () => {
  api.get = vi.fn().mockResolvedValue({ data: [] });
  api.post = vi.fn().mockResolvedValue({ data: { id: "3", status: "processing" } });
  render(<MemoryRouter><DocumentReader /></MemoryRouter>);
  const file = new File(["%PDF-1.4 fake"], "report.pdf", { type: "application/pdf" });
  const fileInput = document.querySelector('input[type="file"]');
  fireEvent.change(fileInput, { target: { files: [file] } });
  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith("/documents/upload", expect.any(FormData));
  });
});

test("Edit button toggles edit mode; Done replaces Edit", async () => {
  api.get = vi.fn().mockResolvedValue({ data: [] });
  render(<MemoryRouter><DocumentReader /></MemoryRouter>);
  await waitFor(() => screen.getByRole("button", { name: /^edit$/i }));
  expect(screen.queryByRole("button", { name: /done/i })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
  expect(screen.getByRole("button", { name: /done/i })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /done/i }));
  expect(screen.getByRole("button", { name: /^edit$/i })).toBeTruthy();
});

test("delete button is hidden when not in edit mode", async () => {
  api.get = vi.fn().mockResolvedValue({
    data: [{ id: "1", title: "My Book", type: "epub", status: "unread", saved_at: "2026-01-01" }],
  });
  render(<MemoryRouter><DocumentReader /></MemoryRouter>);
  await waitFor(() => screen.getByText("My Book"));
  expect(screen.queryByRole("button", { name: /delete my book/i })).toBeNull();
});

test("delete button appears in edit mode and clicking it shows confirmation", async () => {
  api.get = vi.fn().mockResolvedValue({
    data: [{ id: "1", title: "My Book", type: "epub", status: "unread", saved_at: "2026-01-01" }],
  });
  render(<MemoryRouter><DocumentReader /></MemoryRouter>);
  await waitFor(() => screen.getByText("My Book"));
  fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
  const deleteBtn = screen.getByRole("button", { name: /delete my book/i });
  expect(deleteBtn).toBeTruthy();
  fireEvent.click(deleteBtn);
  expect(screen.getByRole("button", { name: /confirm delete/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
});

test("confirming delete calls API and removes card", async () => {
  api.get = vi.fn().mockResolvedValue({
    data: [{ id: "1", title: "My Book", type: "epub", status: "unread", saved_at: "2026-01-01" }],
  });
  api.delete = vi.fn().mockResolvedValue({});
  render(<MemoryRouter><DocumentReader /></MemoryRouter>);
  await waitFor(() => screen.getByText("My Book"));
  fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
  fireEvent.click(screen.getByRole("button", { name: /delete my book/i }));
  fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/documents/1"));
  expect(screen.queryByText("My Book")).toBeNull();
});

test("failed delete shows error and keeps card", async () => {
  api.get = vi.fn().mockResolvedValue({
    data: [{ id: "1", title: "My Book", type: "epub", status: "unread", saved_at: "2026-01-01" }],
  });
  api.delete = vi.fn().mockRejectedValue(new Error("Server error"));
  render(<MemoryRouter><DocumentReader /></MemoryRouter>);
  await waitFor(() => screen.getByText("My Book"));
  fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
  fireEvent.click(screen.getByRole("button", { name: /delete my book/i }));
  fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));
  await waitFor(() => screen.getByText(/failed to delete/i));
  expect(screen.getByText("My Book")).toBeTruthy();
});

test("cancel restores normal card view", async () => {
  api.get = vi.fn().mockResolvedValue({
    data: [{ id: "1", title: "My Book", type: "epub", status: "unread", saved_at: "2026-01-01" }],
  });
  render(<MemoryRouter><DocumentReader /></MemoryRouter>);
  await waitFor(() => screen.getByText("My Book"));
  fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
  fireEvent.click(screen.getByRole("button", { name: /delete my book/i }));
  expect(screen.getByRole("button", { name: /confirm delete/i })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
  expect(screen.queryByRole("button", { name: /confirm delete/i })).toBeNull();
  expect(screen.getByRole("button", { name: /delete my book/i })).toBeTruthy();
});
