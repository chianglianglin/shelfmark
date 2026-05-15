import { createMessage } from '../types/message';
import type { AgentMessage } from '../types/message';
import type { Glyph, TextLine, Block, LayoutPayload, TextDirection } from '../types/glyph';

const LINE_Y_TOLERANCE = 3;   // glyphs within 3px y are on the same line
const BLOCK_GAP_PX = 24;      // y gap larger than this = new block

export function runLayout(
  glyphs: Glyph[],
  trace_id: string,
  attempt = 1,
): AgentMessage<LayoutPayload> {
  const lines = groupIntoLines(glyphs);
  const blocks = groupIntoBlocks(lines);
  const columns = detectColumns(blocks);
  const direction = detectDirection(glyphs);
  const reading_order = buildReadingOrder(lines, direction);

  return createMessage('layout', 'qa_layout', 'success', {
    glyphs, lines, blocks, reading_order, columns, direction,
  }, [], trace_id, attempt);
}

function groupIntoLines(glyphs: Glyph[]): TextLine[] {
  const sorted = [...glyphs].sort((a, b) =>
    a.page !== b.page ? a.page - b.page :
    Math.abs(a.y - b.y) <= LINE_Y_TOLERANCE ? a.x - b.x : a.y - b.y
  );

  const lines: TextLine[] = [];
  let bucket: Glyph[] = [];
  let bucketY = -Infinity;
  let bucketPage = -1;

  const flush = () => {
    if (bucket.length === 0) return;
    const byX = [...bucket].sort((a, b) => a.x - b.x);
    // Line ID uses rounded y for readability; collision possible if lines are <0.5px apart (rare in practice)
    lines.push({
      id: `line_p${byX[0].page}_y${Math.round(byX[0].y)}`,
      glyph_ids: byX.map(g => g.id),
      x_start: byX[0].x,   // FIX 1: always fresh from this line's first glyph
      y_baseline: byX[0].y,
      page: byX[0].page,
    });
    bucket = [];            // FIX 1: reset — never carry state to the next line
  };

  for (const g of sorted) {
    const sameLine = g.page === bucketPage && Math.abs(g.y - bucketY) <= LINE_Y_TOLERANCE;
    if (!sameLine) { flush(); bucketY = g.y; bucketPage = g.page; }
    bucket.push(g);
  }
  flush();

  return lines;
}

function groupIntoBlocks(lines: TextLine[]): Block[] {
  const blocks: Block[] = [];
  let current: TextLine[] = [];

  const flush = () => {
    if (current.length === 0) return;
    blocks.push({
      id: `block_p${current[0].page}_${current[0].id}`,
      type: 'paragraph',
      direction: 'ltr',
      line_ids: current.map(l => l.id),
      glyph_ids: current.flatMap(l => l.glyph_ids),
      page: current[0].page,
    });
    current = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const prev = lines[i - 1];
    const line = lines[i];
    const newBlock = !prev
      || line.page !== prev.page
      || line.y_baseline - prev.y_baseline > BLOCK_GAP_PX;
    if (newBlock) flush();
    current.push(line);
  }
  flush();

  return blocks;
}

function detectColumns(_blocks: Block[]): number {
  return 1; // extend with clustering for multi-column PDFs
}

function detectDirection(glyphs: Glyph[]): TextDirection {
  const rtlChars = glyphs.filter(g => /[\u0600-\u06FF\u0590-\u05FF]/.test(g.char));
  return rtlChars.length > glyphs.length * 0.3 ? 'rtl' : 'ltr';
}

function buildReadingOrder(lines: TextLine[], direction: TextDirection): string[] {
  if (direction === 'rtl') {
    return lines.flatMap(l => [...l.glyph_ids].reverse());
  }
  return lines.flatMap(l => l.glyph_ids);
}
