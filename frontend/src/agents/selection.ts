import { createMessage } from '../types/message';
import type { Glyph, LayoutPayload, HighlightRect, TextLine } from '../types/glyph';

const HIT_TOLERANCE = 4;  // px — click within 4px of glyph counts as a hit

export function runSelection(input: {
  pointer: { start: { x: number; y: number }; end: { x: number; y: number } };
  snap: 'char' | 'word' | 'line';
  layout: LayoutPayload;
  trace_id: string;
  attempt?: number;
}) {
  const glyphMap = new Map(input.layout.glyphs.map(g => [g.id, g]));
  const order = input.layout.reading_order;

  const startGlyph = hitTest(input.pointer.start, input.layout.glyphs);
  const endGlyph   = hitTest(input.pointer.end,   input.layout.glyphs);

  if (!startGlyph || !endGlyph) {
    return createMessage('selection', 'qa_selection', 'fail',
      { selected_glyph_ids: [], highlight_rects: [], snap_mode: input.snap },
      [{ code: 'SELECT_MISS', severity: 'warn', affected: [],
         detail: 'Pointer did not land on any glyph',
         suggested_fix: 'Increase HIT_TOLERANCE or check coordinate transform' }],
      input.trace_id, input.attempt ?? 1,
    );
  }

  const si = order.indexOf(startGlyph.id);
  const ei = order.indexOf(endGlyph.id);
  const [from, to] = si <= ei ? [si, ei] : [ei, si];
  let selectedIds = order.slice(from, to + 1);

  if (input.snap === 'word') selectedIds = snapToWords(selectedIds, order, glyphMap);
  if (input.snap === 'line') selectedIds = snapToLines(selectedIds, input.layout);

  const highlight_rects = normalizeRects(
    mergeToRects(selectedIds, glyphMap, input.layout, input.snap)
  );

  return createMessage('selection', 'qa_selection', 'success',
    { selected_glyph_ids: selectedIds, highlight_rects, snap_mode: input.snap },
    [], input.trace_id, input.attempt ?? 1,
  );
}

function hitTest(point: { x: number; y: number }, glyphs: Glyph[]): Glyph | null {
  return glyphs.find(g =>
    point.x >= g.x - HIT_TOLERANCE &&
    point.x <= g.x + g.w + HIT_TOLERANCE &&
    point.y >= g.y - HIT_TOLERANCE &&
    point.y <= g.y + g.h + HIT_TOLERANCE
  ) ?? null;
}

function snapToWords(ids: string[], order: string[], glyphMap: Map<string, Glyph>): string[] {
  let start = order.indexOf(ids[0]);
  let end   = order.indexOf(ids[ids.length - 1]);
  while (start > 0 && glyphMap.get(order[start - 1])?.char !== ' ') start--;
  while (end < order.length - 1 && glyphMap.get(order[end + 1])?.char !== ' ') end++;
  return order.slice(start, end + 1);
}

function snapToLines(ids: string[], layout: LayoutPayload): string[] {
  const idsSet = new Set(ids);
  const lineSet = new Set(
    layout.lines
      .filter(l => l.glyph_ids.some(id => idsSet.has(id)))
      .flatMap(l => l.glyph_ids)
  );
  return layout.reading_order.filter(id => lineSet.has(id));
}

export function mergeToRects(
  ids: string[],
  glyphMap: Map<string, Glyph>,
  layout: LayoutPayload,
  snap: 'char' | 'word' | 'line',
): HighlightRect[] {
  // Build a glyphId -> TextLine map for exact grouping (no y-rounding)
  const glyphToLine = new Map<string, TextLine>();
  for (const textLine of layout.lines) {
    for (const gid of textLine.glyph_ids) {
      glyphToLine.set(gid, textLine);
    }
  }

  // Group selected glyphs by TextLine.id (exact) with fallback for unmapped glyphs
  const lineGroups = new Map<string, Glyph[]>();
  for (const id of ids) {
    const glyph = glyphMap.get(id);
    if (!glyph) continue;
    const textLine = glyphToLine.get(id);
    const key = textLine ? textLine.id : `${glyph.page}_fallback_${Math.round(glyph.y)}`;
    if (!lineGroups.has(key)) lineGroups.set(key, []);
    lineGroups.get(key)!.push(glyph);
  }

  return [...lineGroups.entries()].map(([key, gs]) => {
    const x = Math.min(...gs.map(g => g.x));
    const y = Math.min(...gs.map(g => g.y));
    const w = Math.max(...gs.map(g => g.x + g.w)) - x;

    let h: number;
    if (snap === 'line') {
      // Improvement 6: cover the tallest glyph on the full line, not just selected glyphs.
      // Use the glyphToLine map directly — no find() needed.
      const textLine = glyphToLine.get(gs[0].id);
      if (textLine) {
        const lineGlyphs = textLine.glyph_ids
          .map(id => glyphMap.get(id))
          .filter((g): g is Glyph => g !== undefined);
        h = Math.max(...lineGlyphs.map(g => g.h));
      } else {
        h = Math.max(...gs.map(g => g.h));
      }
    } else {
      h = Math.max(...gs.map(g => g.h));
    }

    return { x, y, w, h, page: gs[0].page, glyph_ids: gs.map(g => g.id) };
  });
}

export function normalizeRects(rects: HighlightRect[]): HighlightRect[] {
  if (rects.length < 2) return rects;
  const widths = rects.map(r => r.w);
  const maxW = Math.max(...widths);
  const minW = Math.min(...widths);
  // If widths vary by more than 20 px, assume lines are genuinely different lengths
  // (e.g. a short final paragraph line). Do not widen.
  // This is NOT column detection — it protects short last lines from being stretched.
  if (maxW - minW > 20) return rects;
  return rects.map(r => ({ ...r, w: maxW }));
}
