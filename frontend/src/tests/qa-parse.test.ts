import { describe, it, expect } from 'vitest';
import { runQaParse } from '../qa/qa-parse';
import { createMessage } from '../types/message';
import type { ParserPayload, Glyph } from '../types/glyph';

function makeGlyph(id: string, x: number, y: number, w = 10, h = 12, page = 1): Glyph {
  return { id, char: 'A', x, y, w, h, page };
}

function makeMsg(glyphs: Glyph[], has_text_layer = true) {
  const payload: ParserPayload = {
    page_count: 1, has_text_layer, glyphs, encoding_map: {},
  };
  return createMessage('parser', 'qa_parse', 'success', payload, [], 'trace_1');
}

describe('qa-parse', () => {
  it('passes clean glyphs with no errors', () => {
    const msg = makeMsg([
      makeGlyph('p1_g0', 10, 10),
      makeGlyph('p1_g1', 20, 10),
      makeGlyph('p1_g2', 10, 30),
    ]);
    const result = runQaParse(msg);
    expect(result.status).toBe('success');
    expect(result.to_agent).toBe('orchestrator');
    expect(result.errors).toHaveLength(0);
  });

  it('detects ZERO_WIDTH when a glyph has w=0', () => {
    const msg = makeMsg([makeGlyph('p1_g0', 10, 10, 0, 12)]);
    const result = runQaParse(msg);
    expect(result.status).toBe('fail');
    expect(result.errors.some(e => e.code === 'ZERO_WIDTH')).toBe(true);
  });

  it('detects STAIRCASE and BBOX_DRIFT when x_start drifts monotonically across 4 lines', () => {
    // 4 lines, each glyph 30px to the right of the previous — classic staircase
    const glyphs: Glyph[] = [
      makeGlyph('p1_g0',  10,  10),  // line y≈9
      makeGlyph('p1_g1',  40,  40),  // line y≈39
      makeGlyph('p1_g2',  70,  70),  // line y≈69
      makeGlyph('p1_g3', 100, 100),  // line y≈99
    ];
    const result = runQaParse(makeMsg(glyphs));
    expect(result.errors.some(e => e.code === 'STAIRCASE')).toBe(true);
    expect(result.errors.some(e => e.code === 'BBOX_DRIFT')).toBe(true);
    expect(result.status).toBe('fail');
  });

  it('does NOT flag non-monotonic x variation', () => {
    // Lines vary but don't monotonically increase — natural paragraph indentation
    const glyphs: Glyph[] = [
      makeGlyph('p1_g0', 10,  10),
      makeGlyph('p1_g1', 40,  40),  // streak=1
      makeGlyph('p1_g2', 10,  70),  // resets — streak back to 0
      makeGlyph('p1_g3', 40, 100),
    ];
    const result = runQaParse(makeMsg(glyphs));
    expect(result.errors.some(e => e.code === 'STAIRCASE')).toBe(false);
  });

  it('skips all checks when has_text_layer is false', () => {
    // zero-dim glyph that would normally trigger ZERO_WIDTH
    const glyphs = [makeGlyph('p1_g0', 10, 10, 0, 0)];
    const result = runQaParse(makeMsg(glyphs, false));
    expect(result.status).toBe('success');
    expect(result.errors).toHaveLength(0);
  });

  it('detects ZERO_WIDTH when a glyph has h=0', () => {
    const msg = makeMsg([makeGlyph('p1_g0', 10, 10, 10, 0)]);
    const result = runQaParse(msg);
    expect(result.status).toBe('fail');
    expect(result.errors.some(e => e.code === 'ZERO_WIDTH')).toBe(true);
  });

  it('detects negative coordinates as BBOX_DRIFT warn (does not fail)', () => {
    const msg = makeMsg([makeGlyph('p1_g0', -5, 10)]);
    const result = runQaParse(msg);
    // warn-only errors should not cause a fail
    expect(result.status).toBe('success');
    expect(result.errors.some(e => e.code === 'BBOX_DRIFT' && e.severity === 'warn')).toBe(true);
  });

  it('affected array contains only current streak entries, not stale ones', () => {
    // Two separate drift sequences: first reaches streak=2 then resets, second reaches streak=3 and triggers
    const glyphs: Glyph[] = [
      makeGlyph('g0', 10, 10),   // line 0, x_start=10
      makeGlyph('g1', 25, 25),   // line 1, delta=15 > 5, streak=1
      makeGlyph('g2', 40, 40),   // line 2, delta=15 > 5, streak=2
      makeGlyph('g3', 10, 55),   // line 3, delta=-30 ≤ 5, streak RESETS to 0
      makeGlyph('g4', 25, 70),   // line 4, delta=15 > 5, streak=1
      makeGlyph('g5', 40, 85),   // line 5, delta=15 > 5, streak=2
      makeGlyph('g6', 55, 100),  // line 6, delta=15 > 5, streak=3 → TRIGGER
    ];
    const result = runQaParse(makeMsg(glyphs));
    const driftErr = result.errors.find(e => e.code === 'BBOX_DRIFT');
    expect(driftErr).toBeDefined();
    // affected should only contain entries from the second drift sequence (lines 4, 5, 6)
    // NOT from lines 1 and 2 of the first sequence
    expect(driftErr!.affected.length).toBeLessThanOrEqual(3);
    expect(driftErr!.affected.some(a => a.includes('y25') || a.includes('y40'))).toBe(false);
  });
});
