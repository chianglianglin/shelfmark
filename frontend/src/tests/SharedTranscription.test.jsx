import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import SharedTranscription from "../pages/SharedTranscription";
import axios from "axios";

vi.mock("axios");

const mockShared = {
  id: "t1",
  title: "Public Talk",
  status: "done",
  full_text: "Hello world",
  words: [
    { word: "Hello", start: 0.0, end: 0.5 },
    { word: "world", start: 0.5, end: 1.0 },
  ],
  duration_seconds: 2,
  chapters: null,
  share_expires_at: "2026-04-15T00:00:00Z",
};

function renderShared(token = "abc123") {
  return render(
    <MemoryRouter initialEntries={[`/shared/${token}`]}>
      <Routes>
        <Route path="/shared/:token" element={<SharedTranscription />} />
      </Routes>
    </MemoryRouter>
  );
}

test("renders shared transcript title", async () => {
  axios.get = vi.fn((url) => {
    if (url.includes("/audio")) return Promise.resolve({ data: new Blob() });
    return Promise.resolve({ data: mockShared });
  });
  renderShared();
  await waitFor(() => screen.getByText("Public Talk"));
  expect(screen.getByText("Hello")).toBeTruthy();
});

test("shows expires banner", async () => {
  axios.get = vi.fn((url) => {
    if (url.includes("/audio")) return Promise.resolve({ data: new Blob() });
    return Promise.resolve({ data: mockShared });
  });
  renderShared();
  await waitFor(() => screen.getByText(/shared transcript/i));
  expect(screen.getByText(/expires/i)).toBeTruthy();
});

test("shows error on 404", async () => {
  axios.get = vi.fn(() => Promise.reject({ response: { status: 404 } }));
  renderShared("badtoken");
  await waitFor(() => screen.getByText(/not found/i));
});
