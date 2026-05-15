/**
 * Utilities for PDF text selection geometry.
 *
 * Pure geometry helpers (computeUnionRect, normalizePdfRects, snapWordOffsets)
 * have no DOM dependencies and are fully unit-testable in isolation.
 *
 * getWordHugRects is DOM-dependent (uses Range + NodeIterator) and is designed
 * to run in a browser or jsdom environment only.
 */

// Rects smaller than this in PDF-space are considered OCR/layout noise.
const NOISE_MIN = 2;       // px

// Rects whose y values differ by less than this are treated as the same line.
const LINE_Y_TOLERANCE = 4; // px

// Rects on the same line separated by less than this are merged together.
const MERGE_GAP = 3;       // px

// Text nodes with more selected words than this fall back to a single rect
// instead of per-word ranges, guarding against pathologically long text items.
export const WORD_FALLBACK_LIMIT = 50;

/**
 * computeUnionRect
 *
 * Given an array of DOMRect-like objects { left, top, right, bottom },
 * returns the smallest bounding rectangle that covers all of them,
 * with { left, top, right, bottom, width, height }.
 *
 * Returns null for an empty input.
 */
export function computeUnionRect(rects) {
  if (!rects || rects.length === 0) return null;
  let left = Infinity, top = Infinity;
  let right = -Infinity, bottom = -Infinity;
  for (const r of rects) {
    if (r.left   < left)   left   = r.left;
    if (r.top    < top)    top    = r.top;
    if (r.right  > right)  right  = r.right;
    if (r.bottom > bottom) bottom = r.bottom;
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/**
 * normalizePdfRects
 *
 * Cleans up the raw array of { x, y, w, h } rects that come from
 * Range.getClientRects() after coordinate normalization into PDF space.
 *
 * Steps (in order):
 *   1. Remove noise — rects with w < NOISE_MIN or h < NOISE_MIN.
 *   2. Sort by y then x.
 *   3. Group into lines — consecutive rects whose y values differ by
 *      less than LINE_Y_TOLERANCE belong to the same line.
 *   4. Within each line, sort by x and merge adjacent rects
 *      (gap ≤ MERGE_GAP).
 *
 * Intentionally does NOT normalize widths across lines — short last
 * lines of a paragraph stay short.
 */
export function normalizePdfRects(rects) {
  // 1. Remove noise
  const filtered = rects.filter((r) => r.w >= NOISE_MIN && r.h >= NOISE_MIN);
  if (filtered.length === 0) return [];

  // 2. Sort by y then x
  const sorted = filtered.slice().sort((a, b) => a.y - b.y || a.x - b.x);

  // 3. Group into lines by y proximity
  const lines = [];
  for (const rect of sorted) {
    const last = lines[lines.length - 1];
    const lastY = last ? last[last.length - 1].y : null;
    if (last === undefined || rect.y - lastY > LINE_Y_TOLERANCE) {
      lines.push([rect]);
    } else {
      last.push(rect);
    }
  }

  // 4. Within each line, merge adjacent rects
  const result = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    let cur = { ...line[0] };
    for (let i = 1; i < line.length; i++) {
      const next = line[i];
      if (next.x <= cur.x + cur.w + MERGE_GAP) {
        // Extend cur to cover next
        const farX = Math.max(cur.x + cur.w, next.x + next.w);
        const farY = Math.max(cur.y + cur.h, next.y + next.h);
        cur = {
          x: Math.min(cur.x, next.x),
          y: Math.min(cur.y, next.y),
          w: farX - Math.min(cur.x, next.x),
          h: farY - Math.min(cur.y, next.y),
        };
      } else {
        result.push(cur);
        cur = { ...next };
      }
    }
    result.push(cur);
  }

  return result;
}

/**
 * snapWordOffsets
 *
 * Extends [start, end] offsets within `text` outward to encompass complete
 * words at both boundaries.  Whitespace characters mark word edges.
 *
 * Pure function — no DOM dependency. Exported for unit testing.
 *
 * @param {string} text  - Full text content of the text node.
 * @param {number} start - Raw startOffset from the Range (may be mid-word).
 * @param {number} end   - Raw endOffset from the Range (may be mid-word).
 * @returns {[number, number]} [snappedStart, snappedEnd]
 */
export function snapWordOffsets(text, start, end) {
  let s = start;
  let e = end;
  // Walk start leftward until we hit whitespace or the node beginning.
  while (s > 0 && !/\s/.test(text[s - 1])) s--;
  // Walk end rightward until we hit whitespace or the node end.
  while (e < text.length && !/\s/.test(text[e])) e++;
  return [s, e];
}

/**
 * getWordHugRects
 *
 * Drop-in replacement for Array.from(range.getClientRects()) that produces
 * tighter, word-level geometry:
 *
 *   • Walks every text node covered by the Range.
 *   • Snaps the start / end boundary offsets outward to full word boundaries
 *     (Option A — full-word snap).
 *   • Creates one temporary Range per word and collects its getBoundingClientRect().
 *   • For text nodes whose selected slice exceeds WORD_FALLBACK_LIMIT words,
 *     falls back to one rect covering the entire selected slice.
 *   • Falls back to native range.getClientRects() if either boundary is not a
 *     text node (element-level ranges produced by non-text-layer selections).
 *
 * Returns an array of DOMRect-like objects in viewport coordinates — the same
 * format as Range.getClientRects() — so the caller's PDF-space conversion and
 * normalizePdfRects() pass are unchanged.
 *
 * @param {Range} range - The live browser selection range.
 * @returns {DOMRect[]}
 */
export function getWordHugRects(range) {
  // Guard: element-level range boundaries — fall back to native behaviour.
  if (range.startContainer.nodeType !== Node.TEXT_NODE ||
      range.endContainer.nodeType !== Node.TEXT_NODE) {
    return Array.from(range.getClientRects());
  }

  const rects  = [];
  const root   = range.commonAncestorContainer;
  // NodeIterator needs an element as root; unwrap when it's already a text node.
  const iterRoot = root.nodeType === Node.TEXT_NODE ? root.parentNode : root;

  const iter = document.createNodeIterator(iterRoot, NodeFilter.SHOW_TEXT);
  let started = false;
  let node;

  while ((node = iter.nextNode())) {
    const isStart = node === range.startContainer;
    const isEnd   = node === range.endContainer;

    // Skip text nodes that come before the selection start.
    if (!started) {
      if (!isStart) continue;
      started = true;
    }

    const text     = node.textContent ?? "";
    const rawStart = isStart ? range.startOffset : 0;
    const rawEnd   = isEnd   ? range.endOffset   : text.length;

    _collectWordRects(rects, node, text, rawStart, rawEnd, isStart, isEnd);

    if (isEnd) break;
  }

  return rects;
}

/**
 * _collectWordRects  (internal)
 *
 * Snaps the offsets for the start / end boundary nodes, splits the selected
 * slice into words, and pushes one getBoundingClientRect() result per word
 * into `rects`.  Uses the single-rect fallback for overlong slices.
 */
function _collectWordRects(rects, node, fullText, rawStart, rawEnd, isStart, isEnd) {
  // Compute snapped offsets; only apply the relevant end to each boundary.
  const [snappedStart, snappedEnd] = snapWordOffsets(fullText, rawStart, rawEnd);
  const sOff = isStart ? snappedStart : rawStart;
  const eOff = isEnd   ? snappedEnd   : rawEnd;

  const selected = fullText.slice(sOff, eOff);
  if (!selected.trim()) return;

  const words = selected.match(/\S+/g) ?? [];

  // Fallback for pathologically long text items (e.g. entire paragraphs in
  // one PDF text stream item) — avoids hundreds of forced layout reflows.
  if (words.length > WORD_FALLBACK_LIMIT) {
    try {
      const fb = document.createRange();
      fb.setStart(node, sOff);
      fb.setEnd(node, eOff);
      const r = fb.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) rects.push(r);
    } catch { /* skip unrenderable nodes */ }
    return;
  }

  // One temporary Range per word → one tight viewport rect.
  const re = /\S+/g;
  let m;
  while ((m = re.exec(selected)) !== null) {
    try {
      const wr = document.createRange();
      wr.setStart(node, sOff + m.index);
      wr.setEnd(node,   sOff + m.index + m[0].length);
      const r = wr.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) rects.push(r);
    } catch { /* skip */ }
  }
}
