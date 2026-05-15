import { createMessage } from '../types/message';
import type { AgentMessage, AgentError } from '../types/message';
import type { Glyph, ParserPayload } from '../types/glyph';

const DRIFT_PX = 5;
const DRIFT_LINES = 3;

export function runQaParse(msg: AgentMessage<ParserPayload>): AgentMessage<ParserPayload> {
  const errors: AgentError[] = [];

  if (msg.payload.has_text_layer) {
    checkZeroWidth(msg.payload.glyphs, errors);
    checkBboxDrift(msg.payload.glyphs, errors);
    checkNegativeCoords(msg.payload.glyphs, errors);
  }

  const failed = errors.some(e => e.severity !== 'warn');
  return createMessage(
    'qa_parse',
    failed ? 'parser' : 'orchestrator',
    failed ? 'fail' : 'success',
    msg.payload, errors, msg.trace_id, msg.attempt,
  );
}

function checkZeroWidth(glyphs: Glyph[], errors: AgentError[]): void {
  const bad = glyphs.filter(g => g.w <= 0 || g.h <= 0).map(g => g.id);
  if (bad.length > 0) {
    errors.push({
      code: 'ZERO_WIDTH', severity: 'error', affected: bad,
      detail: `${bad.length} glyph(s) have zero width or height`,
      suggested_fix: 'Check font encoding map and glyph advance-width values',
    });
  }
}

function checkBboxDrift(glyphs: Glyph[], errors: AgentError[]): void {
  // Bucket glyphs into lines by y-proximity (nearest 3px)
  const lineMap = new Map<number, Glyph[]>();
  for (const g of glyphs) {
    const key = Math.round(g.y / 3) * 3;
    if (!lineMap.has(key)) lineMap.set(key, []);
    lineMap.get(key)!.push(g);
  }

  const lines = [...lineMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, gs]) => ({
      x_start: Math.min(...gs.map(g => g.x)),
      page: gs[0].page,
      y: gs[0].y,
    }));

  let streak = 0;
  const affected: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const delta = lines[i].x_start - lines[i - 1].x_start;
    if (delta > DRIFT_PX) {
      streak++;
      affected.push(`page_${lines[i].page}_y${Math.round(lines[i].y)}`);
    } else {
      streak = 0;
      affected.length = 0;  // clear accumulated entries when streak breaks
    }
    if (streak >= DRIFT_LINES) {
      errors.push({
        code: 'BBOX_DRIFT', severity: 'error', affected,
        detail: `Line x_start drifts +${DRIFT_PX}px+ for ${streak} consecutive lines`,
        suggested_fix: 'Reset x tracking per line in parser — not cumulative across lines',
      });
      errors.push({
        code: 'STAIRCASE', severity: 'error', affected,
        detail: 'Monotonically increasing x_start will cause staircase highlight rendering',
        suggested_fix: 'Same as BBOX_DRIFT — fix coordinate extraction in parser.ts',
      });
      break;
    }
  }
}

function checkNegativeCoords(glyphs: Glyph[], errors: AgentError[]): void {
  const bad = glyphs.filter(g => g.x < 0 || g.y < 0).map(g => g.id);
  if (bad.length > 0) {
    errors.push({
      code: 'BBOX_DRIFT', severity: 'warn', affected: bad,
      detail: `${bad.length} glyph(s) have negative coordinates`,
      suggested_fix: 'PDF uses bottom-left origin — convert: screen_y = page_height - pdf_y - glyph_height',
    });
  }
}
