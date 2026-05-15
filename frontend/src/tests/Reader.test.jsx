import { vi } from "vitest";
import { injectPulseStyle, cleanupTempHighlight, wrapSelectionInTempMark, insertPdfTempHighlight, findReadingOffset, findElementAtOffset, findCurrentPdfPage } from "../pages/Reader";
import { COLOR_BG } from "../constants/highlight";

// Silence React-router / api imports that Reader.jsx brings in
vi.mock("../api");
vi.mock("../components/PdfViewer",        () => ({ default: () => null }));
vi.mock("../components/AnnotationSidebar",() => ({ default: () => null }));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useParams: () => ({ id: "doc1" }),
  useNavigate: () => vi.fn(),
}));

// ── Task 1 tests ──────────────────────────────────────────────
describe("injectPulseStyle", () => {
  afterEach(() => { document.getElementById("hl-pending-pulse")?.remove(); });

  test("injects a <style> tag with hl-pulse keyframe", () => {
    injectPulseStyle();
    const el = document.getElementById("hl-pending-pulse");
    expect(el).not.toBeNull();
    expect(el.textContent).toContain("hl-pulse");
  });

  test("is idempotent — calling twice adds exactly one tag", () => {
    injectPulseStyle();
    injectPulseStyle();
    expect(document.querySelectorAll("#hl-pending-pulse")).toHaveLength(1);
  });
});

// ── Task 2 tests ──────────────────────────────────────────────
describe("cleanupTempHighlight", () => {
  test("unwraps marks and restores plain text", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>hello <mark>world</mark></p>";
    document.body.appendChild(container);

    cleanupTempHighlight([container.querySelector("mark")], []);

    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("hello world");
    container.remove();
  });

  test("removes highlight divs from the DOM", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);

    cleanupTempHighlight([], [div]);

    expect(document.body.contains(div)).toBe(false);
  });

  test("handles detached marks without throwing", () => {
    const mark = document.createElement("mark");
    mark.textContent = "orphan";
    expect(() => cleanupTempHighlight([mark], [])).not.toThrow();
  });

  test("handles empty arrays without throwing", () => {
    expect(() => cleanupTempHighlight([], [])).not.toThrow();
  });
});

// ── Task 3 tests ──────────────────────────────────────────────
describe("wrapSelectionInTempMark", () => {
  let editorEl;

  beforeEach(() => {
    editorEl = document.createElement("div");
    editorEl.innerHTML = "<p>hello world</p>";
    document.body.appendChild(editorEl);
  });

  afterEach(() => {
    editorEl.remove();
    vi.restoreAllMocks();
  });

  function mockSelection(textNode, start, end) {
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
    });
    return range;
  }

  test("wraps selected text in a pulsing <mark>", () => {
    const textNode = editorEl.querySelector("p").firstChild; // "hello world"
    mockSelection(textNode, 6, 11); // "world"

    const marks = wrapSelectionInTempMark(editorEl, "yellow");

    expect(marks).toHaveLength(1);
    expect(marks[0].tagName).toBe("MARK");
    expect(marks[0].textContent).toBe("world");
    expect(marks[0].style.background).toBe(COLOR_BG.yellow);
    expect(marks[0].style.animation).toContain("hl-pulse");
    expect(marks[0].dataset.tempHl).toBe("true");
    expect(editorEl.querySelector("mark")).toBe(marks[0]);
  });

  test("returns [] when selection is outside the editor", () => {
    const outside = document.createElement("p");
    outside.textContent = "outside";
    document.body.appendChild(outside);
    mockSelection(outside.firstChild, 0, 4);

    const marks = wrapSelectionInTempMark(editorEl, "yellow");

    expect(marks).toHaveLength(0);
    expect(editorEl.querySelector("mark")).toBeNull();
    outside.remove();
  });

  test("returns [] when getSelection is null", () => {
    vi.spyOn(window, "getSelection").mockReturnValue(null);
    expect(wrapSelectionInTempMark(editorEl, "yellow")).toHaveLength(0);
  });

  test("returns [] when selection is collapsed", () => {
    vi.spyOn(window, "getSelection").mockReturnValue({ isCollapsed: true });
    expect(wrapSelectionInTempMark(editorEl, "yellow")).toHaveLength(0);
  });

  test("falls back to per-node wrapping for cross-element selections", () => {
    // Two paragraphs — selection spans both
    editorEl.innerHTML = "<p>first para</p><p>second para</p>";
    const p1Text = editorEl.querySelectorAll("p")[0].firstChild; // "first para"
    const p2Text = editorEl.querySelectorAll("p")[1].firstChild; // "second para"

    const range = document.createRange();
    range.setStart(p1Text, 6);  // "para" from first
    range.setEnd(p2Text, 6);    // "second" from second
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
    });

    const marks = wrapSelectionInTempMark(editorEl, "green");

    // surroundContents throws (cross-element); fallback wraps each text node
    expect(marks.length).toBeGreaterThanOrEqual(1);
    marks.forEach((m) => {
      expect(m.tagName).toBe("MARK");
      expect(m.style.animation).toContain("hl-pulse");
    });
  });
});

// ── Task 4 tests ──────────────────────────────────────────────
describe("insertPdfTempHighlight", () => {
  let pageWrapper, hlLayer;

  beforeEach(() => {
    pageWrapper = document.createElement("div");
    pageWrapper.dataset.page = "3";
    hlLayer = document.createElement("div");
    hlLayer.className = "highlight-layer";
    pageWrapper.appendChild(hlLayer);
    document.body.appendChild(pageWrapper);
  });

  afterEach(() => { pageWrapper.remove(); });

  test("appends a pulsing div per rect to the highlight layer", () => {
    const rects = [
      { x: 10, y: 20, w: 100, h: 25 },
      { x: 10, y: 50, w: 80,  h: 25 },
    ];
    const divs = insertPdfTempHighlight(3, rects, "blue", 1.5);

    expect(divs).toHaveLength(2);
    expect(hlLayer.children).toHaveLength(2);

    // First div: rect coords * scale
    expect(divs[0].style.left).toBe("15px");   // 10 * 1.5
    expect(divs[0].style.top).toBe("30px");    // 20 * 1.5
    expect(divs[0].style.width).toBe("150px"); // 100 * 1.5
    expect(divs[0].style.height).toBe("37.5px");
    expect(divs[0].style.animation).toContain("hl-pulse");
    expect(divs[0].dataset.tempHl).toBe("true");
  });

  test("returns [] when the page has no highlight layer", () => {
    const divs = insertPdfTempHighlight(99, [{ x: 0, y: 0, w: 10, h: 10 }], "yellow", 1);
    expect(divs).toHaveLength(0);
  });

  test("returns [] when rects array is empty", () => {
    const divs = insertPdfTempHighlight(3, [], "yellow", 1);
    expect(divs).toHaveLength(0);
    expect(hlLayer.children).toHaveLength(0);
  });
});

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Reader from "../pages/Reader";

// ── Task 5 integration test ───────────────────────────────────
describe("Reader — temp mark appears after clicking Note", () => {
  const epubDoc = {
    id: "doc1", title: "T", type: "epub",
    content_html: "<p>hello world</p>", content_text: "hello world",
  };

  async function setupAndClickNote() {
    const api = (await import("../api")).default;
    api.get = vi.fn()
      .mockResolvedValueOnce({ data: epubDoc })
      .mockResolvedValueOnce({ data: [] });

    vi.useFakeTimers({ shouldAdvanceTime: false });
    const result = render(<MemoryRouter><Reader /></MemoryRouter>);

    // Flush the api.get promises
    await act(async () => { await Promise.resolve(); });

    const editorEl = result.container.querySelector("[data-testid='text-editor']");
    expect(editorEl).not.toBeNull();

    // Set up a fake selection over "hello world"
    // getRangeAt returns a fresh range each call so jsdom re-renders don't invalidate it
    function makeFreshRange() {
      const tn = editorEl.querySelector("p").firstChild;
      const r = document.createRange();
      r.setStart(tn, 0);
      r.setEnd(tn, 11);
      // jsdom doesn't implement layout methods; stub them so getRangeUnionRect works
      r.getClientRects = () => [];
      r.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 });
      return r;
    }
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      toString: () => "hello world",
      rangeCount: 1,
      getRangeAt: () => makeFreshRange(),
      removeAllRanges: vi.fn(),
    });

    // Fire mouseUp → debounce → toolbar appears
    fireEvent.mouseUp(editorEl);
    await act(async () => { vi.advanceTimersByTime(200); });

    vi.useRealTimers();
    const noteBtn = await screen.findByText("Note");
    fireEvent.click(noteBtn);

    return { editorEl, ...result };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.getElementById("hl-pending-pulse")?.remove();
    document.querySelectorAll("mark[data-temp-hl]")
      .forEach((m) => m.replaceWith(...m.childNodes));
  });

  test("pulsing <mark> appears in the editor", async () => {
    const { editorEl } = await setupAndClickNote();

    const mark = editorEl.querySelector("mark[data-temp-hl]");
    expect(mark).not.toBeNull();
    expect(mark.style.animation).toContain("hl-pulse");
  });

  test("pulse keyframe style tag is injected", async () => {
    await setupAndClickNote();
    expect(document.getElementById("hl-pending-pulse")).not.toBeNull();
  });
});

// ── Task 6 integration test ───────────────────────────────────
describe("Reader — saving attaches data-hl-id and stops pulse", () => {
  const epubDoc = {
    id: "doc1", title: "T", type: "epub",
    content_html: "<p>hello world</p>", content_text: "hello world",
  };
  const savedHl = {
    id: "hl-abc", color: "yellow", text: "hello world",
    position: { type: "text_range", view: "epub", start_offset: 0, end_offset: 11 },
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.getElementById("hl-pending-pulse")?.remove();
    document.querySelectorAll("mark[data-temp-hl]")
      .forEach((m) => m.replaceWith(...m.childNodes));
  });

  test("first temp mark gets data-hl-id and stops pulsing after Save", async () => {
    const api = (await import("../api")).default;
    api.get = vi.fn()
      .mockResolvedValueOnce({ data: epubDoc })
      .mockResolvedValueOnce({ data: [] });
    api.post = vi.fn().mockResolvedValue({ data: savedHl });

    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { container } = render(<MemoryRouter><Reader /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });

    const editorEl = container.querySelector("[data-testid='text-editor']");
    function makeFreshRange() {
      const tn = editorEl.querySelector("p").firstChild;
      const r = document.createRange();
      r.setStart(tn, 0);
      r.setEnd(tn, 11);
      r.getClientRects = () => [];
      r.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 });
      return r;
    }
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      toString: () => "hello world",
      rangeCount: 1,
      getRangeAt: () => makeFreshRange(),
      removeAllRanges: vi.fn(),
    });

    // Open note panel
    fireEvent.mouseUp(editorEl);
    await act(async () => { vi.advanceTimersByTime(200); });
    vi.useRealTimers();
    fireEvent.click(await screen.findByText("Note"));

    const mark = editorEl.querySelector("mark[data-temp-hl]");
    expect(mark).not.toBeNull();

    // Click Save Note
    fireEvent.click(screen.getByText("Save Note"));
    await act(async () => { await Promise.resolve(); }); // flush post

    expect(mark.dataset.hlId).toBe("hl-abc");
    expect(mark.style.animation).toBe("none");
  });
});

// ── Task 7 integration test ───────────────────────────────────
describe("Reader — Cancel removes temp mark", () => {
  const epubDoc = {
    id: "doc1", title: "T", type: "epub",
    content_html: "<p>hello world</p>", content_text: "hello world",
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.getElementById("hl-pending-pulse")?.remove();
    document.querySelectorAll("mark[data-temp-hl]")
      .forEach((m) => m.replaceWith(...m.childNodes));
  });

  test("temp mark is unwrapped after clicking Cancel", async () => {
    const api = (await import("../api")).default;
    api.get = vi.fn()
      .mockResolvedValueOnce({ data: epubDoc })
      .mockResolvedValueOnce({ data: [] });

    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { container } = render(<MemoryRouter><Reader /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });

    const editorEl = container.querySelector("[data-testid='text-editor']");
    function makeFreshRange() {
      const tn = editorEl.querySelector("p").firstChild;
      const r = document.createRange();
      r.setStart(tn, 0);
      r.setEnd(tn, 11);
      r.getClientRects = () => [];
      r.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 });
      return r;
    }
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      toString: () => "hello world",
      rangeCount: 1,
      getRangeAt: () => makeFreshRange(),
      removeAllRanges: vi.fn(),
    });

    // Open note panel
    fireEvent.mouseUp(editorEl);
    await act(async () => { vi.advanceTimersByTime(200); });
    vi.useRealTimers();
    fireEvent.click(await screen.findByText("Note"));

    expect(editorEl.querySelector("mark[data-temp-hl]")).not.toBeNull();

    // Cancel
    fireEvent.click(screen.getByText("Cancel"));

    expect(editorEl.querySelector("mark[data-temp-hl]")).toBeNull();
    expect(editorEl.textContent).toContain("hello world");
  });
});

// ── Save-failure edge case ─────────────────────────────────────
describe("Reader — save API failure removes temp mark", () => {
  const epubDoc = {
    id: "doc1", title: "T", type: "epub",
    content_html: "<p>hello world</p>", content_text: "hello world",
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.getElementById("hl-pending-pulse")?.remove();
    document.querySelectorAll("mark[data-temp-hl]")
      .forEach((m) => m.replaceWith(...m.childNodes));
  });

  test("temp mark is removed when api.post rejects", async () => {
    const api = (await import("../api")).default;
    api.get = vi.fn()
      .mockResolvedValueOnce({ data: epubDoc })
      .mockResolvedValueOnce({ data: [] });
    api.post = vi.fn().mockRejectedValue(new Error("network error"));

    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { container } = render(<MemoryRouter><Reader /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });

    const editorEl = container.querySelector("[data-testid='text-editor']");
    function makeFreshRange() {
      const tn = editorEl.querySelector("p").firstChild;
      const r = document.createRange();
      r.setStart(tn, 0);
      r.setEnd(tn, 11);
      r.getClientRects = () => [];
      r.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 });
      return r;
    }
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      toString: () => "hello world",
      rangeCount: 1,
      getRangeAt: () => makeFreshRange(),
      removeAllRanges: vi.fn(),
    });

    // Open note panel
    fireEvent.mouseUp(editorEl);
    await act(async () => { vi.advanceTimersByTime(200); });
    vi.useRealTimers();
    fireEvent.click(await screen.findByText("Note"));

    expect(editorEl.querySelector("mark[data-temp-hl]")).not.toBeNull();

    // Attempt save — API rejects
    fireEvent.click(screen.getByText("Save Note"));
    await act(async () => { await Promise.resolve(); });

    expect(editorEl.querySelector("mark[data-temp-hl]")).toBeNull();
    expect(editorEl.textContent).toContain("hello world");
  });
});

// ── EPUB document view mode tests ─────────────────────────────────────────────
describe("Reader — EPUB document view mode", () => {
  const epubDoc = {
    id: "doc1", title: "My Book", type: "epub",
    content_html: "<p>epub content</p>", content_text: "epub content",
  };

  afterEach(() => { vi.restoreAllMocks(); });

  test("shows EPUB and Text tabs for an epub document", async () => {
    const api = (await import("../api")).default;
    api.get = vi.fn()
      .mockResolvedValueOnce({ data: epubDoc })
      .mockResolvedValueOnce({ data: [] });

    render(<MemoryRouter><Reader /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByRole("button", { name: "EPUB" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Text" })).not.toBeNull();
  });

  test("does not show PDF tab for an epub document", async () => {
    const api = (await import("../api")).default;
    api.get = vi.fn()
      .mockResolvedValueOnce({ data: epubDoc })
      .mockResolvedValueOnce({ data: [] });

    render(<MemoryRouter><Reader /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });

    expect(screen.queryByRole("button", { name: "PDF" })).toBeNull();
  });

  test("EPUB tab is active on initial load of an epub document", async () => {
    const api = (await import("../api")).default;
    api.get = vi.fn()
      .mockResolvedValueOnce({ data: epubDoc })
      .mockResolvedValueOnce({ data: [] });

    render(<MemoryRouter><Reader /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });

    const epubBtn = screen.getByRole("button", { name: "EPUB" });
    expect(epubBtn.style.fontWeight).toBe("600");
  });
});

// ── findReadingOffset ─────────────────────────────────────────────────────────
describe("findReadingOffset", () => {
  let editor, contentArea;

  beforeEach(() => {
    editor      = document.createElement("div");
    contentArea = document.createElement("div");
    document.body.appendChild(editor);
    document.body.appendChild(contentArea);
  });

  afterEach(() => {
    editor.remove();
    contentArea.remove();
    vi.restoreAllMocks();
  });

  test("returns char count before the topmost visible block element", () => {
    editor.innerHTML = "<p>first</p><p>second</p>";
    const secondP = editor.querySelectorAll("p")[1];
    // Simulate scrolled so that secondP is the first visible block:
    // contentArea.scrollTop = 50, secondP.offsetTop = 50 (firstP.offsetTop = 0 < 50)
    Object.defineProperty(secondP, "offsetTop", { configurable: true, value: 50 });
    Object.defineProperty(contentArea, "scrollTop", { configurable: true, get: () => 50 });
    expect(findReadingOffset(editor, contentArea)).toBe(5); // "first" = 5 chars
  });

  test("returns 0 when the first paragraph is topmost", () => {
    editor.innerHTML = "<p>hello</p><p>world</p>";
    // scrollTop = 0 (default), all offsetTops = 0 → first block matches immediately
    expect(findReadingOffset(editor, contentArea)).toBe(0);
  });

  test("returns null when editorEl is null", () => {
    expect(findReadingOffset(null, contentArea)).toBeNull();
  });

  test("returns null when contentAreaEl is null", () => {
    expect(findReadingOffset(editor, null)).toBeNull();
  });

  test("returns null when editor has no block elements", () => {
    editor.innerHTML = "plain text with no block tags";
    expect(findReadingOffset(editor, contentArea)).toBeNull();
  });
});

// ── findElementAtOffset ───────────────────────────────────────────────────────
describe("findElementAtOffset", () => {
  let editor;

  beforeEach(() => {
    editor = document.createElement("div");
    editor.innerHTML = "<p>hello</p><p>world</p>";
    document.body.appendChild(editor);
  });

  afterEach(() => { editor.remove(); });

  test("returns block element containing offset 0 (first paragraph)", () => {
    const el = findElementAtOffset(editor, 0);
    expect(el.tagName).toBe("P");
    expect(el.textContent).toBe("hello");
  });

  test("returns second paragraph when offset falls inside it", () => {
    // "hello" = 5 chars; offset 6 → inside "world"
    const el = findElementAtOffset(editor, 6);
    expect(el.tagName).toBe("P");
    expect(el.textContent).toBe("world");
  });

  test("returns first paragraph when offset equals its last char index", () => {
    // 0 + 5 = 5 >= 4 → first paragraph is returned
    const el = findElementAtOffset(editor, 4);
    expect(el.textContent).toBe("hello");
  });

  test("returns null when offset exceeds total content length", () => {
    expect(findElementAtOffset(editor, 999)).toBeNull();
  });

  test("returns null when editorEl is null", () => {
    expect(findElementAtOffset(null, 0)).toBeNull();
  });

  test("returns null when offset is null", () => {
    expect(findElementAtOffset(editor, null)).toBeNull();
  });
});

// ── findCurrentPdfPage ────────────────────────────────────────────────────────
describe("findCurrentPdfPage", () => {
  let contentArea, pageDiv;

  beforeEach(() => {
    contentArea = document.createElement("div");
    pageDiv     = document.createElement("div");
    pageDiv.dataset.page = "3";
    document.body.appendChild(contentArea);
    document.body.appendChild(pageDiv);
  });

  afterEach(() => {
    contentArea.remove();
    pageDiv.remove();
    delete document.elementFromPoint;
    vi.restoreAllMocks();
  });

  test("returns the page number from the nearest [data-page] ancestor", () => {
    const child = document.createElement("span");
    pageDiv.appendChild(child);
    vi.spyOn(contentArea, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 });
    Object.defineProperty(contentArea, "offsetWidth", { value: 800, configurable: true });
    document.elementFromPoint = vi.fn().mockReturnValue(child);
    expect(findCurrentPdfPage(contentArea)).toBe(3);
  });

  test("returns null when no [data-page] ancestor is found", () => {
    const unrelated = document.createElement("span");
    document.body.appendChild(unrelated);
    vi.spyOn(contentArea, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 });
    Object.defineProperty(contentArea, "offsetWidth", { value: 800, configurable: true });
    document.elementFromPoint = vi.fn().mockReturnValue(unrelated);
    expect(findCurrentPdfPage(contentArea)).toBeNull();
    unrelated.remove();
  });

  test("returns null when contentAreaEl is null", () => {
    expect(findCurrentPdfPage(null)).toBeNull();
  });
});

// ── Reading position restore ───────────────────────────────────────────────────
describe("Reader — reading position restore", () => {
  const epubDoc = {
    id: "doc1", title: "My Book", type: "epub",
    content_html: "<p>hello</p><p>world</p>",
    content_text: "helloworld",
    last_read_offset: null,
    last_read_page:   null,
  };

  let origScrollIntoView;

  beforeEach(() => {
    localStorage.clear();
    origScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    localStorage.clear();
    HTMLElement.prototype.scrollIntoView = origScrollIntoView;
    vi.restoreAllMocks();
  });

  async function renderWithDoc(overrides = {}) {
    const api = (await import("../api")).default;
    api.get = vi.fn()
      .mockResolvedValueOnce({ data: { ...epubDoc, ...overrides } })
      .mockResolvedValueOnce({ data: [] });
    render(<MemoryRouter><Reader /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); }); // flush api.get
    await act(async () => { await Promise.resolve(); }); // flush rAF in restore
  }

  test("scrolls to saved localStorage offset on load", async () => {
    localStorage.setItem(
      "reader_position_doc1",
      JSON.stringify({ offset: 6, savedAt: "2026-03-30T00:00:00Z" }),
    );
    await renderWithDoc();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith(
      { behavior: "instant", block: "start" },
    );
  });

  test("falls back to doc.last_read_offset when localStorage is empty", async () => {
    await renderWithDoc({ last_read_offset: 6 });
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith(
      { behavior: "instant", block: "start" },
    );
  });

  test("localStorage offset takes priority over doc.last_read_offset", async () => {
    // localStorage → offset 6 (second <p> "world"); doc → offset 0 (first <p>)
    localStorage.setItem(
      "reader_position_doc1",
      JSON.stringify({ offset: 6, savedAt: "2026-03-30T00:00:00Z" }),
    );
    await renderWithDoc({ last_read_offset: 0 });
    const scrolledEl = HTMLElement.prototype.scrollIntoView.mock.instances[0];
    expect(scrolledEl.textContent).toBe("world");
  });

  test("does not scroll when no position is saved anywhere", async () => {
    await renderWithDoc();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  test("shows toast when position is restored from localStorage", async () => {
    localStorage.setItem(
      "reader_position_doc1",
      JSON.stringify({ offset: 0, savedAt: "2026-03-30T00:00:00Z" }),
    );
    await renderWithDoc();
    expect(screen.queryByText("Resumed from where you left off")).not.toBeNull();
  });

  test("does not show toast when no position is restored", async () => {
    await renderWithDoc();
    expect(screen.queryByText("Resumed from where you left off")).toBeNull();
  });
});
