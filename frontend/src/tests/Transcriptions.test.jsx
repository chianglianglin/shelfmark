import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import Transcriptions from "../pages/Transcriptions";
import api from "../api";

vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {} }));
vi.mock("tesseract.js", () => ({ createWorker: vi.fn() }));
vi.mock("../api");

test("renders AI Transcription heading and Upload button", async () => {
  api.get = vi.fn().mockResolvedValue({ data: [] });
  render(<MemoryRouter><Transcriptions /></MemoryRouter>);
  expect(screen.getByText("AI Transcription")).toBeTruthy();
  expect(screen.getByRole("button", { name: /upload/i })).toBeTruthy();
});

test("shows transcription cards from API", async () => {
  api.get = vi.fn().mockResolvedValue({
    data: [
      {
        id: "t1",
        title: "Team Meeting",
        filename: "meeting.mp3",
        status: "done",
        language: "en",
        duration_seconds: 120,
        created_at: "2026-04-06T10:00:00Z",
      },
    ],
  });
  render(<MemoryRouter><Transcriptions /></MemoryRouter>);
  await waitFor(() => screen.getByText("Team Meeting"));
  expect(screen.getByText("Team Meeting")).toBeTruthy();
});

test("status badge shows processing for in-progress transcriptions", async () => {
  api.get = vi.fn().mockResolvedValue({
    data: [
      {
        id: "t2",
        title: "Interview",
        filename: "interview.m4a",
        status: "processing",
        language: null,
        duration_seconds: null,
        created_at: "2026-04-06T11:00:00Z",
      },
    ],
  });
  render(<MemoryRouter><Transcriptions /></MemoryRouter>);
  await waitFor(() => screen.getByText("Interview"));
  expect(screen.getByText(/processing/i)).toBeTruthy();
});

test("upload button triggers file input for audio files", async () => {
  api.get = vi.fn().mockResolvedValue({ data: [] });
  api.post = vi.fn().mockResolvedValue({
    data: { id: "t3", title: "talk", status: "processing", created_at: "2026-04-06T12:00:00Z" },
  });
  render(<MemoryRouter><Transcriptions /></MemoryRouter>);
  const file = new File([new ArrayBuffer(8)], "talk.mp3", { type: "audio/mpeg" });
  const fileInput = document.querySelector('input[type="file"]');
  fireEvent.change(fileInput, { target: { files: [file] } });
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith(
      "/transcriptions/upload",
      expect.any(FormData)
    )
  );
});

test("delete button calls API and removes card", async () => {
  api.get = vi.fn().mockResolvedValue({
    data: [
      {
        id: "t1",
        title: "Team Meeting",
        filename: "meeting.mp3",
        status: "done",
        language: "en",
        duration_seconds: 120,
        created_at: "2026-04-06T10:00:00Z",
      },
    ],
  });
  api.delete = vi.fn().mockResolvedValue({});
  render(<MemoryRouter><Transcriptions /></MemoryRouter>);
  await waitFor(() => screen.getByText("Team Meeting"));
  fireEvent.click(screen.getByRole("button", { name: /delete team meeting/i }));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/transcriptions/t1"));
  expect(screen.queryByText("Team Meeting")).toBeNull();
});
