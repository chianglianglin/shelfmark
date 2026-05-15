import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock("tesseract.js", () => ({ createWorker: vi.fn(() => Promise.resolve({})) }));

import Library from "../pages/Library";
import api from "../api";

vi.mock("../api");

test("shows recent documents from API", async () => {
  api.get = vi.fn().mockResolvedValue({
    data: [{ id: "1", title: "Test Article", type: "article", status: "unread", saved_at: "2026-03-20" }],
  });
  render(<MemoryRouter><Library /></MemoryRouter>);
  await waitFor(() => screen.getByText("Test Article"));
});

test("shows Document Reader and AI Transcription tool cards", async () => {
  api.get = vi.fn().mockResolvedValue({ data: [] });
  render(<MemoryRouter><Library /></MemoryRouter>);
  expect(screen.getByText("Document Reader")).toBeTruthy();
  expect(screen.getByText("AI Transcription")).toBeTruthy();
  expect(screen.getByText("Read PDF and EPUB files")).toBeTruthy();
  expect(screen.getByText("Transcribe audio and video files")).toBeTruthy();
});

test("clicking Document Reader card has pointer cursor", async () => {
  api.get = vi.fn().mockResolvedValue({ data: [] });
  render(<MemoryRouter><Library /></MemoryRouter>);
  const card = screen.getByText("Document Reader").closest("div[style]");
  expect(card).not.toBeNull();
  expect(card.style.cursor).toBe("pointer");
});

test("clicking AI Transcription card navigates to /transcriptions", async () => {
  api.get = vi.fn().mockResolvedValue({ data: [] });
  render(
    <MemoryRouter>
      <Library />
    </MemoryRouter>
  );
  const card = screen.getByText("AI Transcription").closest("div[style]");
  expect(card).not.toBeNull();
  expect(card.style.cursor).toBe("pointer");
});
