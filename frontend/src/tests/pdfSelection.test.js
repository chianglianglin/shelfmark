import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { computeUnionRect, normalizePdfRects, snapWordOffsets, getWordHugRects, WORD_FALLBACK_LIMIT } from "../utils/pdfSelection";

// ---------------------------------------------------------------------------
// computeUnionRect
// ---------------------------------------------------------------------------

describe("computeUnionRect", () => {
  test("returns null for empty input", () => {
    expect(computeUnionRect([])).toBeNull();
  });

  test("returns a rect with correct shape for a single input", () => {
    const r = computeUnionRect([{ left: 10, top: 20, right: 60, bottom: 40 }]);
    expect(r).toEqual({ left: 10, top: 20, right: 60, bottom: 40, width: 50, height: 20 });
  });

  test("spans two side-by-side rects horizontally", () => {
    const rects = [
      { left: 10, top: 20, right: 50, bottom: 40 },
      { left: 50, top: 20, right: 90, bottom: 40 },
    ];
    const r = computeUnionRect(rects);
    expect(r.left).toBe(10);
    expect(r.right).toBe(90);
    expect(r.top).toBe(20);
    expect(r.bottom).toBe(40);
    expect(r.width).toBe(80);
    expect(r.height).toBe(20);
  });

  test("spans two vertically stacked rects", () => {
    const rects = [
      { left: 10, top: 20, right: 50, bottom: 35 },
      { left: 10, top: 35, right: 50, bottom: 50 },
    ];
    const r = computeUnionRect(rects);
    expect(r.top).toBe(20);
    expect(r.bottom).toBe(50);
    expect(r.height).toBe(30);
  });

  test("wraps rects with different extents correctly", () => {
    const rects = [
      { left: 5,  top: 10, right: 100, bottom: 30 },
      { left: 20, top: 50, right: 200, bottom: 80 },
    ];
    const r = computeUnionRect(rects);
    expect(r.left).toBe(5);
    expect(r.top).toBe(10);
    expect(r.right).toBe(200);
    expect(r.bottom).toBe(80);
    expect(r.width).toBe(195);
    expect(r.height).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// normalizePdfRects
// ---------------------------------------------------------------------------

describe("normalizePdfRects", () => {
  test("returns empty array for empty input", () => {
    expect(normalizePdfRects([])).toEqual([]);
  });

  test("passes through a single normal rect unchanged", () => {
    const rects = [{ x: 10, y: 20, w: 100, h: 14 }];
    expect(normalizePdfRects(rects)).toEqual(rects);
  });

  test("removes rects with width below noise threshold", () => {
    const rects = [
      { x: 10, y: 20, w: 1, h: 14 },   // too narrow — noise
      { x: 20, y: 20, w: 80, h: 14 },  // normal
    ];
    const result = normalizePdfRects(rects);
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(20);
  });

  test("removes rects with height below noise threshold", () => {
    const rects = [
      { x: 10, y: 20, w: 80, h: 1 },   // too short — noise
      { x: 10, y: 40, w: 80, h: 14 },  // normal
    ];
    const result = normalizePdfRects(rects);
    expect(result).toHaveLength(1);
    expect(result[0].y).toBe(40);
  });

  test("merges two adjacent rects on the same line into one", () => {
    // Two rects on y=20 that are adjacent (gap ≤ merge threshold)
    const rects = [
      { x: 10, y: 20, w: 40, h: 14 },  // right edge at x=50
      { x: 51, y: 20, w: 40, h: 14 },  // left edge at x=51 — gap of 1px
    ];
    const result = normalizePdfRects(rects);
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(10);
    expect(result[0].w).toBe(81);
  });

  test("does NOT merge two rects on the same line that are far apart", () => {
    const rects = [
      { x: 10,  y: 20, w: 40, h: 14 },  // right edge at x=50
      { x: 200, y: 20, w: 40, h: 14 },  // left edge at x=200 — large gap
    ];
    const result = normalizePdfRects(rects);
    expect(result).toHaveLength(2);
  });

  test("groups rects with similar y into one line and merges adjacents", () => {
    // Two rects on roughly the same y (differ by 2px — within tolerance)
    const rects = [
      { x: 10, y: 20, w: 40, h: 14 },
      { x: 51, y: 22, w: 40, h: 14 },  // y=22, delta=2 — same line
    ];
    const result = normalizePdfRects(rects);
    expect(result).toHaveLength(1);
  });

  test("keeps rects on different lines separate", () => {
    const rects = [
      { x: 10, y: 20,  w: 100, h: 14 },
      { x: 10, y: 40,  w: 100, h: 14 },  // y delta = 20 — different line
    ];
    const result = normalizePdfRects(rects);
    expect(result).toHaveLength(2);
  });

  test("does NOT widen the shorter last line to match earlier lines", () => {
    // First line: full-width (w=200). Last line: short (w=80). Must stay short.
    const rects = [
      { x: 10, y: 20,  w: 200, h: 14 },
      { x: 10, y: 40,  w: 80,  h: 14 },
    ];
    const result = normalizePdfRects(rects);
    const lastLine = result.find((r) => r.y >= 40 - 1);
    expect(lastLine.w).toBe(80);
  });

  test("handles multiple lines each with multiple adjacent rects", () => {
    const rects = [
      // Line 1 — two adjacent spans
      { x: 10, y: 20, w: 50, h: 14 },
      { x: 61, y: 20, w: 50, h: 14 },
      // Line 2 — two adjacent spans
      { x: 10, y: 40, w: 30, h: 14 },
      { x: 41, y: 40, w: 30, h: 14 },
    ];
    const result = normalizePdfRects(rects);
    expect(result).toHaveLength(2);            // one per line
    expect(result[0].w).toBe(101);             // 10..111
    expect(result[1].w).toBe(61);              // 10..71
  });
});

// ---------------------------------------------------------------------------
// snapWordOffsets
// ---------------------------------------------------------------------------

describe("snapWordOffsets", () => {
  test("does not move offsets that are already at word boundaries", () => {
    // "hello world" — start at 6 (start of "world"), end at 11 (after "world")
    expect(snapWordOffsets("hello world", 6, 11)).toEqual([6, 11]);
  });

  test("snaps start leftward when it lands inside a word", () => {
    // Start at index 3 (inside "hello": h=0 e=1 l=2 l=3) → snap to 0
    expect(snapWordOffsets("hello world", 3, 11)).toEqual([0, 11]);
  });

  test("snaps end rightward when it lands inside a word", () => {
    // "hello world": w=6 o=7 r=8 — end at 8 (inside "world") → snap to 11
    expect(snapWordOffsets("hello world", 0, 8)).toEqual([0, 11]);
  });

  test("snaps both boundaries when both land mid-word", () => {
    expect(snapWordOffsets("hello world", 3, 8)).toEqual([0, 11]);
  });

  test("does not snap start that is already at index 0", () => {
    expect(snapWordOffsets("hello world", 0, 5)).toEqual([0, 5]);
  });

  test("does not snap end that is already at the node end", () => {
    expect(snapWordOffsets("hello", 0, 5)).toEqual([0, 5]);
  });

  test("snaps a selection fully within a single word to the whole word", () => {
    // "hello" — select "ell" (1..4) → whole word (0..5)
    expect(snapWordOffsets("hello", 1, 4)).toEqual([0, 5]);
  });

  test("snaps correctly when the text starts with whitespace", () => {
    // "  hello" — start at 4 (inside "hello") → snap to 2 (start of "hello")
    expect(snapWordOffsets("  hello", 4, 7)).toEqual([2, 7]);
  });
});

// ---------------------------------------------------------------------------
// getWordHugRects — DOM tests (uses jsdom; getBoundingClientRect mocked)
// ---------------------------------------------------------------------------

describe("getWordHugRects", () => {
  let origBCR;
  let callIdx;

  beforeEach(() => {
    callIdx = 0;
    origBCR = Range.prototype.getBoundingClientRect;
    // Return a distinct non-trivial rect per call so the w/h guard passes
    Range.prototype.getBoundingClientRect = function () {
      callIdx++;
      return { left: callIdx * 100, top: 20, right: callIdx * 100 + 80, bottom: 34, width: 80, height: 14 };
    };
  });

  afterEach(() => {
    Range.prototype.getBoundingClientRect = origBCR;
    document.body.innerHTML = "";
  });

  function makeSpan(text) {
    const span = document.createElement("span");
    span.textContent = text;
    document.body.appendChild(span);
    return span;
  }

  // ── single-word selection ──────────────────────────────────────────────────

  test("single-word selection returns exactly one rect", () => {
    const span = makeSpan("hello world goodbye");
    const tn = span.firstChild;

    const range = document.createRange();
    range.setStart(tn, 6);   // start of "world"
    range.setEnd(tn, 11);    // end   of "world"

    expect(getWordHugRects(range)).toHaveLength(1);
  });

  // ── multi-word selection within one native pdf.js-style span ──────────────

  test("multi-word selection within one span returns one rect per word", () => {
    const span = makeSpan("hello world goodbye");
    const tn = span.firstChild;

    const range = document.createRange();
    range.setStart(tn, 6);   // start of "world"
    range.setEnd(tn, 19);    // end   of "goodbye"

    expect(getWordHugRects(range)).toHaveLength(2); // "world" + "goodbye"
  });

  // ── OCR-style word span (absolutely positioned, one word per span) ─────────

  test("fully-selected OCR word span returns one rect", () => {
    const div = document.createElement("div");
    div.className = "textLayer";
    const span = document.createElement("span");
    span.style.cssText = "position:absolute;left:50px;top:100px;width:60px;height:16px;";
    span.textContent = "quick";
    div.appendChild(span);
    document.body.appendChild(div);

    const tn = span.firstChild;
    const range = document.createRange();
    range.setStart(tn, 0);
    range.setEnd(tn, 5);

    expect(getWordHugRects(range)).toHaveLength(1);
  });

  // ── partial-word drag at start snaps to full word ─────────────────────────

  test("start mid-word snaps leftward so the full start word is included", () => {
    // "hello world" — start at index 3 (inside "hello") → snaps to 0
    // result: ["hello", "world"] = 2 rects
    const span = makeSpan("hello world");
    const tn = span.firstChild;

    const range = document.createRange();
    range.setStart(tn, 3);   // mid "hello"
    range.setEnd(tn, 11);    // end of "world"

    expect(getWordHugRects(range)).toHaveLength(2);
  });

  // ── partial-word drag at end snaps to full word ───────────────────────────

  test("end mid-word snaps rightward so the full end word is included", () => {
    // "hello world" — end at index 8 (inside "world": w=6 o=7 r=8) → snaps to 11
    // result: ["hello", "world"] = 2 rects
    const span = makeSpan("hello world");
    const tn = span.firstChild;

    const range = document.createRange();
    range.setStart(tn, 0);   // start of "hello"
    range.setEnd(tn, 8);     // mid "world"

    expect(getWordHugRects(range)).toHaveLength(2);
  });

  // ── pathological long text node triggers single-rect fallback ─────────────

  test(`text node with more than ${WORD_FALLBACK_LIMIT} words returns one rect`, () => {
    const longText = Array.from({ length: WORD_FALLBACK_LIMIT + 5 },
      (_, i) => `word${i}`).join(" ");
    const span = makeSpan(longText);
    const tn = span.firstChild;

    const range = document.createRange();
    range.setStart(tn, 0);
    range.setEnd(tn, longText.length);

    expect(getWordHugRects(range)).toHaveLength(1);
  });
});
