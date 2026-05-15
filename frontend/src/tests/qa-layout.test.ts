import { describe, it, expect } from 'vitest';
import { runQaLayout } from '../qa/qa-layout';
import { createMessage } from '../types/message';
import type { LayoutPayload, Glyph, TextLine, Block } from '../types/glyph';

function makeGlyph(id: string, x: number, y: number, page = 1): Glyph {
  return { id, char: 'A', x, y, w: 10, h: 12, page };
}

function makeLine(id: string, glyph_ids: string[], x_start: number, y_baseline: number): TextLine {
  return { id, glyph_ids, x_start, y_baseline, page: 1 };
}

function makeBlock(id: string, glyph_ids: string[]): Block {
  return { id, type: 'paragraph', direction: 'ltr', line_ids: [], glyph_ids, page: 1 };
}

function makeMsg(payload: LayoutPayload) {
  return createMessage('layout', 'qa_layout', 'success', payload, [], 'trace_1');
}

describe('qa-layout', () => {
  it('passes clean layout with no errors', () => {
    const glyphs = [
      makeGlyph('g0', 10, 10),
      makeGlyph('g1', 10, 50),
      makeGlyph('g2', 10, 90),
    ];
    const lines = [
      makeLine('l0', ['g0'], 10, 10),
      makeLine('l1', ['g1'], 10, 50),
      makeLine('l2', ['g2'], 10, 90),
    ];
    const payload: LayoutPayload = {
      glyphs, lines,
      blocks: [makeBlock('b0', ['g0', 'g1', 'g2'])],
      reading_order: ['g0', 'g1', 'g2'],
      columns: 1, direction: 'ltr',
    };
    const result = runQaLayout(makeMsg(payload));
    expect(result.status).toBe('success');
    expect(result.errors).toHaveLength(0);
  });

  it('detects ORDER_JUMP when reading order jumps >200px backwards on the same page', () => {
    const glyphs = [
      makeGlyph('g0', 10,  10),
      makeGlyph('g1', 10, 500),  // forward 490px
      makeGlyph('g2', 10, 100),  // back 400px → ORDER_JUMP
    ];
    const payload: LayoutPayload = {
      glyphs,
      lines: [makeLine('l0', ['g0', 'g1', 'g2'], 10, 10)],
      blocks: [makeBlock('b0', ['g0', 'g1', 'g2'])],
      reading_order: ['g0', 'g1', 'g2'],
      columns: 1, direction: 'ltr',
    };
    const result = runQaLayout(makeMsg(payload));
    expect(result.errors.some(e => e.code === 'ORDER_JUMP')).toBe(true);
    expect(result.status).toBe('fail');
  });

  it('detects STAIRCASE when line x_start increases monotonically across 4 lines', () => {
    const glyphs = [
      makeGlyph('g0', 10, 10),
      makeGlyph('g1', 20, 30),
      makeGlyph('g2', 30, 50),
      makeGlyph('g3', 40, 70),
    ];
    const lines = [
      makeLine('l0', ['g0'], 10, 10),  // x_start=10
      makeLine('l1', ['g1'], 20, 30),  // x_start=20, delta=10 > 5 → streak=1
      makeLine('l2', ['g2'], 30, 50),  // x_start=30, delta=10 > 5 → streak=2
      makeLine('l3', ['g3'], 40, 70),  // x_start=40, delta=10 > 5 → streak=3 → STAIRCASE
    ];
    const payload: LayoutPayload = {
      glyphs, lines,
      blocks: [makeBlock('b0', ['g0', 'g1', 'g2', 'g3'])],
      reading_order: ['g0', 'g1', 'g2', 'g3'],
      columns: 1, direction: 'ltr',
    };
    const result = runQaLayout(makeMsg(payload));
    expect(result.errors.some(e => e.code === 'STAIRCASE')).toBe(true);
    expect(result.status).toBe('fail');
  });
});
