import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import TranscriptionReader from "../pages/TranscriptionReader";
import api from "../api";

vi.mock("../api");
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {} }));
vi.mock("tesseract.js", () => ({ createWorker: vi.fn() }));

// Mock URL.createObjectURL since jsdom doesn't implement it
global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
global.URL.revokeObjectURL = vi.fn();

const mockTranscription = {
  id: "t1",
  title: "Team Meeting",
  filename: "meeting.mp3",
  status: "done",
  language: "en",
  duration_seconds: 10,
  full_text: "Hello world how are you",
  words: [
    { word: "Hello", start: 0.0, end: 0.5 },
    { word: "world", start: 0.5, end: 1.0 },
    { word: "how", start: 1.0, end: 1.3 },
    { word: "are", start: 1.3, end: 1.6 },
    { word: "you", start: 1.6, end: 2.0 },
  ],
  created_at: "2026-04-06T10:00:00Z",
};

function renderWithRoute(id = "t1") {
  return render(
    <MemoryRouter initialEntries={[`/transcription/${id}`]}>
      <Routes>
        <Route path="/transcription/:id" element={<TranscriptionReader />} />
      </Routes>
    </MemoryRouter>
  );
}

test("renders transcript words from API", async () => {
  api.get = vi.fn((url) => {
    if (url.endsWith("/audio")) return Promise.resolve({ data: new Blob() });
    if (url.includes("transcription-annotations")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: mockTranscription });
  });
  renderWithRoute();
  await waitFor(() => screen.getByText("Hello"));
  expect(screen.getByText("world")).toBeTruthy();
  expect(screen.getByText("how")).toBeTruthy();
});

test("renders title and back button", async () => {
  api.get = vi.fn((url) => {
    if (url.endsWith("/audio")) return Promise.resolve({ data: new Blob() });
    if (url.includes("transcription-annotations")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: mockTranscription });
  });
  renderWithRoute();
  await waitFor(() => screen.getByText("Team Meeting"));
  expect(screen.getByRole("button", { name: /back/i })).toBeTruthy();
});

test("export TXT button triggers download", async () => {
  api.get = vi.fn((url) => {
    if (url.endsWith("/audio")) return Promise.resolve({ data: new Blob() });
    if (url.includes("transcription-annotations")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: mockTranscription });
  });
  const clickSpy = vi.fn();
  const createElementOrig = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag) => {
    const el = createElementOrig(tag);
    if (tag === "a") el.click = clickSpy;
    return el;
  });
  try {
    renderWithRoute();
    await waitFor(() => screen.getByText("Hello"));
    // Open export dropdown then click Download TXT
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    await waitFor(() => screen.getByText("Download TXT"));
    fireEvent.click(screen.getByText("Download TXT"));
    expect(clickSpy).toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
  }
});

test("export SRT button triggers download", async () => {
  api.get = vi.fn((url) => {
    if (url.endsWith("/audio")) return Promise.resolve({ data: new Blob() });
    if (url.includes("transcription-annotations")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: mockTranscription });
  });
  const clickSpy = vi.fn();
  const createElementOrig = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag) => {
    const el = createElementOrig(tag);
    if (tag === "a") el.click = clickSpy;
    return el;
  });
  try {
    renderWithRoute();
    await waitFor(() => screen.getByText("Hello"));
    // Open export dropdown then click Download SRT
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    await waitFor(() => screen.getByText("Download SRT"));
    fireEvent.click(screen.getByText("Download SRT"));
    expect(clickSpy).toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
  }
});

test("clicking a word sets data-word attribute interaction", async () => {
  api.get = vi.fn((url) => {
    if (url.endsWith("/audio")) return Promise.resolve({ data: new Blob() });
    if (url.includes("transcription-annotations")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: mockTranscription });
  });
  renderWithRoute();
  await waitFor(() => screen.getByText("Hello"));
  // Words are rendered as clickable spans
  const helloSpan = screen.getByText("Hello");
  expect(helloSpan.tagName).toBe("SPAN");
  expect(helloSpan.style.cursor).toBe("pointer");
});

test("search icon button toggles search bar", async () => {
  api.get = vi.fn((url) => {
    if (url.endsWith("/audio")) return Promise.resolve({ data: new Blob() });
    if (url.includes("transcription-annotations")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: mockTranscription });
  });
  renderWithRoute();
  await waitFor(() => screen.getByText("Hello"));
  expect(screen.queryByPlaceholderText("Search transcript...")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  expect(screen.getByPlaceholderText("Search transcript...")).toBeTruthy();
});

test("search finds matching words", async () => {
  api.get = vi.fn((url) => {
    if (url.endsWith("/audio")) return Promise.resolve({ data: new Blob() });
    if (url.includes("transcription-annotations")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: mockTranscription });
  });
  renderWithRoute();
  await waitFor(() => screen.getByText("Hello"));
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  const input = screen.getByPlaceholderText("Search transcript...");
  fireEvent.change(input, { target: { value: "hello" } });
  expect(screen.getByText(/1.*result/i)).toBeTruthy();
});

test("clear button clears search query", async () => {
  api.get = vi.fn((url) => {
    if (url.endsWith("/audio")) return Promise.resolve({ data: new Blob() });
    if (url.includes("transcription-annotations")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: mockTranscription });
  });
  renderWithRoute();
  await waitFor(() => screen.getByText("Hello"));
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  const input = screen.getByPlaceholderText("Search transcript...");
  fireEvent.change(input, { target: { value: "hello" } });
  fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
  expect(input.value).toBe("");
});

test("annotations sidebar toggle button shows and hides sidebar", async () => {
  api.get = vi.fn((url) => {
    if (url.endsWith("/audio")) return Promise.resolve({ data: new Blob() });
    if (url.includes("transcription-annotations")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: mockTranscription });
  });
  renderWithRoute();
  await waitFor(() => screen.getByText("Hello"));
  expect(screen.getByText("Annotations").closest("[style*='width: 0']")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /annotations/i }));
  expect(screen.getByText("Annotations").closest("[style*='width: 280']")).toBeTruthy();
});

const mockTranscriptionWithChapters = {
  ...mockTranscription,
  chapters: [
    { id: "c1", title: "Chapter 1", start_time: 0.0, word_index: 0 },
    { id: "c2", title: "Chapter 2", start_time: 1.0, word_index: 2 },
  ],
};

test("chapters sidebar shows chapter titles", async () => {
  api.get = vi.fn((url) => {
    if (url.endsWith("/audio")) return Promise.resolve({ data: new Blob() });
    if (url.includes("transcription-annotations")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: mockTranscriptionWithChapters });
  });
  renderWithRoute();
  await waitFor(() => screen.getByText("Hello"));
  fireEvent.click(screen.getByRole("button", { name: /chapters/i }));
  expect(screen.getByText("Chapter 1")).toBeTruthy();
  expect(screen.getByText("Chapter 2")).toBeTruthy();
});

test("Share button shows share popup", async () => {
  api.get = vi.fn((url) => {
    if (url.endsWith("/audio")) return Promise.resolve({ data: new Blob() });
    if (url.includes("transcription-annotations")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: mockTranscription });
  });
  api.post = vi.fn(() => Promise.resolve({ data: { share_url: "/shared/abc123", expires_at: "2026-04-15T00:00:00Z" } }));
  renderWithRoute();
  await waitFor(() => screen.getByText("Hello"));
  fireEvent.click(screen.getByRole("button", { name: /share/i }));
  await waitFor(() => screen.getByText(/copy link/i));
  expect(screen.getByText(/copy link/i)).toBeTruthy();
});
