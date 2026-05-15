import { render, screen, waitFor } from "@testing-library/react";
import { vi, beforeAll } from "vitest";

// jsdom doesn't implement canvas getContext — provide a stub so PDF.js render() works
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = () => ({});
});

// Must be at module scope — Vitest hoists vi.mock calls
vi.mock("tesseract.js", () => ({
  createWorker: vi.fn(() =>
    Promise.resolve({
      load: vi.fn(),
      loadLanguage: vi.fn(),
      initialize: vi.fn(),
      recognize: vi.fn(() => Promise.resolve({ data: { text: "" } })),
      terminate: vi.fn(),
    })
  ),
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: () =>
        Promise.resolve({
          getViewport: () => ({ width: 600, height: 800, scale: 1 }),
          render: () => ({ promise: Promise.resolve() }),
          getTextContent: () => Promise.resolve({ items: [] }),
          getAnnotations: () => Promise.resolve([]),
        }),
    }),
  }),
  TextLayer: class {
    constructor() {}
    render() { return Promise.resolve(); }
  },
}));

vi.mock("../api", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: new ArrayBuffer(8) }),
  },
}));

import PdfViewer from "../components/PdfViewer";

test("renders a canvas element for each page", async () => {
  render(
    <PdfViewer
      docId="doc-1"
      highlights={[]}
      scale={1.0}
      onSelection={vi.fn()}
    />
  );
  await waitFor(() => {
    const canvases = document.querySelectorAll("canvas");
    expect(canvases.length).toBe(2);
  });
});

test("renders no canvases before PDF loads", () => {
  render(
    <PdfViewer
      docId="doc-1"
      highlights={[]}
      scale={1.0}
      onSelection={vi.fn()}
    />
  );
  expect(document.querySelectorAll("canvas").length).toBe(0);
});

// Regression: highlights that arrive before PDF pages exist must still be drawn
// after loadPdf() finishes — simulates "leave page and come back" where the
// highlights API response resolves before the async page-render loop completes.
test("populates highlight-layer after PDF renders when highlights arrive before pages exist", async () => {
  const hl = {
    id: "hl-persisted",
    color: "yellow",
    text: "some text",
    position: { type: "pdf_range", page: 1, rects: [{ x: 10, y: 20, w: 100, h: 15 }] },
  };

  // Highlights are passed in from the very first render, before any PDF page DOM exists.
  render(
    <PdfViewer
      docId="doc-persist"
      highlights={[hl]}
      scale={1.0}
      onSelection={vi.fn()}
    />
  );

  // Wait for both PDF pages to finish rendering.
  await waitFor(() => {
    expect(document.querySelectorAll("canvas").length).toBe(2);
  });

  // Page 1's highlight-layer must contain a rect div even though highlights
  // arrived before the .highlight-layer node existed in the DOM.
  const page1 = document.querySelector('[data-page="1"]');
  const hlLayer = page1?.querySelector(".highlight-layer");
  expect(hlLayer).not.toBeNull();
  expect(hlLayer.querySelector('[data-hl-id="hl-persisted"]')).not.toBeNull();
});
