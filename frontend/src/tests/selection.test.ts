import { describe, it, expect } from 'vitest';
import { mergeToRects, normalizeRects } from '../agents/selection';
import type { Glyph, LayoutPayload, TextLine, Block, HighlightRect } from '../types/glyph';

function g(id: string, x: number, y: number, w: number, h: number, page = 1): Glyph {
  return { id, char: 'A', x, y, w, h, page };
}

function line(id: string, glyph_ids: string[], x_start: number, y_baseline: number): TextLine {
  return { id, glyph_ids, x_start, y_baseline, page: 1 };
}

function block(id: string, glyph_ids: string[]): Block {
  return { id, type: 'paragraph', direction: 'ltr', line_ids: [], glyph_ids, page: 1 };
}

describe('mergeToRects — snap-to-line full height (Improvement 6)', () => {
  it('uses tallest glyph on the full line, not just selected glyphs', () => {
    // Line contains a tall glyph (h=24) that is NOT selected, plus small selected glyphs (h=12)
    const large = g('large', 5,  10, 10, 24);   // not selected
    const sA    = g('sA',   20, 10, 10, 12);   // selected
    const sB    = g('sB',   35, 10, 10, 12);   // selected

    const l = line('l0', ['large', 'sA', 'sB'], 5, 10);
    const allGlyphs = [large, sA, sB];
    const layout: LayoutPayload = {
      glyphs: allGlyphs,
      lines: [l],
      blocks: [block('b0', ['large', 'sA', 'sB'])],
      reading_order: ['large', 'sA', 'sB'],
      columns: 1, direction: 'ltr',
    };
    const glyphMap = new Map(allGlyphs.map(glyph => [glyph.id, glyph]));

    const rects = mergeToRects(['sA', 'sB'], glyphMap, layout, 'line');
    expect(rects).toHaveLength(1);
    expect(rects[0].h).toBe(24);  // must use the tall glyph's height
  });

  it('uses only selected glyphs height when snap is not line', () => {
    const large = g('large', 5, 10, 10, 24);
    const sA    = g('sA',  20, 10, 10, 12);
    const l = line('l0', ['large', 'sA'], 5, 10);
    const allGlyphs = [large, sA];
    const layout: LayoutPayload = {
      glyphs: allGlyphs,
      lines: [l],
      blocks: [block('b0', ['large', 'sA'])],
      reading_order: ['large', 'sA'],
      columns: 1, direction: 'ltr',
    };
    const glyphMap = new Map(allGlyphs.map(glyph => [glyph.id, glyph]));

    const rects = mergeToRects(['sA'], glyphMap, layout, 'char');
    expect(rects[0].h).toBe(12);  // only selected glyph's height
  });
});

describe('normalizeRects (Improvement 7)', () => {
  it('widens all rects to maxW when widths are within 20px', () => {
    const rects: HighlightRect[] = [
      { x: 10, y: 10, w: 200, h: 12, page: 1, glyph_ids: [] },
      { x: 10, y: 30, w: 195, h: 12, page: 1, glyph_ids: [] },
      { x: 10, y: 50, w: 198, h: 12, page: 1, glyph_ids: [] },
    ];
    const result = normalizeRects(rects);
    expect(result.every(r => r.w === 200)).toBe(true);
  });

  it('leaves rects unchanged when width difference exceeds 20px (short final line)', () => {
    const rects: HighlightRect[] = [
      { x: 10, y: 10, w: 200, h: 12, page: 1, glyph_ids: [] },
      { x: 10, y: 30, w: 100, h: 12, page: 1, glyph_ids: [] },  // short final line
      { x: 10, y: 50, w: 200, h: 12, page: 1, glyph_ids: [] },
    ];
    const result = normalizeRects(rects);
    expect(result[1].w).toBe(100);  // unchanged
    expect(result[0].w).toBe(200);
  });
});
