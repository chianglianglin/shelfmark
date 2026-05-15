import { createMessage } from '../types/message';
import type { AgentMessage, AgentError } from '../types/message';
import type { LayoutPayload } from '../types/glyph';

export function runQaLayout(msg: AgentMessage<LayoutPayload>): AgentMessage<LayoutPayload> {
  const errors: AgentError[] = [];
  checkOrderJumps(msg.payload, errors);
  checkStaircase(msg.payload.lines, errors);
  checkNoiseBlocks(msg.payload, errors);

  const failed = errors.some(e => e.severity !== 'warn');
  return createMessage(
    'qa_layout', failed ? 'layout' : 'orchestrator',
    failed ? 'fail' : 'success',
    msg.payload, errors, msg.trace_id, msg.attempt,
  );
}

function checkOrderJumps(payload: LayoutPayload, errors: AgentError[]): void {
  const gm = new Map(payload.glyphs.map(g => [g.id, g]));
  const order = payload.reading_order;
  const affected: string[] = [];
  for (let i = 1; i < order.length; i++) {
    const prev = gm.get(order[i - 1]);
    const curr = gm.get(order[i]);
    if (!prev || !curr || prev.page !== curr.page) continue;
    if (curr.y - prev.y < -200) affected.push(curr.id);
  }
  if (affected.length > 0) {
    errors.push({
      code: 'ORDER_JUMP', severity: 'error', affected,
      detail: `Reading order jumps > 200px backwards at ${affected.length} point(s)`,
      suggested_fix: 'Review column detection — text may be mis-ordered across columns',
    });
  }
}

function checkStaircase(lines: LayoutPayload['lines'], errors: AgentError[]): void {
  let streak = 0;
  const affected: string[] = [];
  // Staircase pattern: x_start increasing >5px per line for 3+ consecutive lines
  // indicates a layout accumulation bug, not legitimate paragraph indentation.
  for (let i = 1; i < lines.length; i++) {
    const delta = lines[i].x_start - lines[i - 1].x_start;
    if (delta > 5) { streak++; affected.push(lines[i].id); }
    else streak = 0;
    if (streak >= 3) {
      errors.push({
        code: 'STAIRCASE', severity: 'error', affected,
        detail: 'Line x_start values increase monotonically — staircase highlights will occur',
        suggested_fix: 'Check layout agent: x_start must be reset per line, not accumulated',
      });
      return;
    }
  }
}

function checkNoiseBlocks(payload: LayoutPayload, errors: AgentError[]): void {
  const small = payload.blocks.filter(b => b.glyph_ids.length < 2);
  if (small.length > 0) {
    errors.push({
      code: 'BBOX_DRIFT', severity: 'warn', affected: small.map(b => b.id),
      detail: `${small.length} block(s) contain only 1 glyph`,
      suggested_fix: 'Filter or merge single-glyph blocks',
    });
  }
}
