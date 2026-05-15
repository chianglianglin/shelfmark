import { createMessage } from '../types/message';
import type { AgentMessage } from '../types/message';
import type { SelectionPayload, RendererPayload, CanvasOp } from '../types/glyph';

// Fix 3: updated highlight color and opacity
export const HIGHLIGHT_COLOR   = '#b4c7f5';
export const HIGHLIGHT_OPACITY = 0.55;

// Improvement 4: injectable config — callers can override without editing source
export interface RendererConfig {
  color?:   string;   // default: HIGHLIGHT_COLOR ('#b4c7f5')
  opacity?: number;   // default: HIGHLIGHT_OPACITY (0.55)
  padding?: number;   // px to expand each rect on all four sides, default: 1
}

export function runRenderer(input: {
  selection: SelectionPayload;
  zoom: number;
  current_page: number;
  trace_id: string;
  attempt?: number;
  config?: RendererConfig;
}): AgentMessage<RendererPayload> {
  const color   = input.config?.color   ?? HIGHLIGHT_COLOR;
  const opacity = input.config?.opacity ?? HIGHLIGHT_OPACITY;
  const padding = input.config?.padding ?? 1;

  const ops: CanvasOp[] = input.selection.highlight_rects
    .filter(r => r.page === input.current_page)  // dirty rect: current page only
    .map(r => ({
      type: 'fillRect' as const,
      // Improvement 5: expand rect by padding on all sides at canvas-op time.
      // Glyph.y is the top of the bounding box (y increases downward), so subtracting
      // padding from y moves the rect upward — correct for top-edge expansion.
      // HighlightRect values are never modified; padding is applied here only.
      x: r.x * input.zoom - padding,
      y: r.y * input.zoom - padding,
      w: r.w * input.zoom + padding * 2,
      h: r.h * input.zoom + padding * 2,
      color,
      opacity,
    }));

  return createMessage('renderer', 'orchestrator', 'success',
    { canvas_ops: ops, page: input.current_page, zoom: input.zoom },
    [], input.trace_id, input.attempt ?? 1,
  );
}
