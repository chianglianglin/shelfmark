export interface Point { x: number; y: number }

export interface BoundingBox { x: number; y: number; w: number; h: number; page: number }

export interface HighlightRect extends BoundingBox {
  glyph_ids: string[];
}

export interface Glyph {
  id: string;
  char: string;
  x: number;
  y: number;       // TOP of bounding box in screen coordinates (y increases downward)
  w: number;
  h: number;
  page: number;
  font?: string;
  confidence?: number;
}

export type BlockType = 'paragraph' | 'heading' | 'list' | 'verse' | 'table' | 'unknown';
export type TextDirection = 'ltr' | 'rtl';

export interface TextLine {
  id: string;
  glyph_ids: string[];
  x_start: number;    // x of first glyph — must reset per line, never cumulative
  y_baseline: number;
  page: number;
}

export interface Block {
  id: string;
  type: BlockType;
  direction: TextDirection;
  line_ids: string[];
  glyph_ids: string[];
  page: number;
}

export interface ParserPayload {
  page_count: number;
  has_text_layer: boolean;
  glyphs: Glyph[];
  encoding_map: Record<string, string>;
}

export interface OcrPayload {
  synthetic_glyphs: (Glyph & { confidence: number })[];
  avg_confidence: number;
  low_conf_regions: { page: string; bbox: BoundingBox }[];
}

export interface LayoutPayload {
  glyphs: Glyph[];
  lines: TextLine[];
  blocks: Block[];
  reading_order: string[];
  columns: number;
  direction: TextDirection;
}

export interface SelectionPayload {
  selected_glyph_ids: string[];
  highlight_rects: HighlightRect[];
  snap_mode: 'char' | 'word' | 'line';
}

export interface CanvasOp {
  type: 'fillRect';
  x: number; y: number; w: number; h: number;
  color: string;
  opacity: number;
}

export interface RendererPayload {
  canvas_ops: CanvasOp[];
  page: number;
  zoom: number;
}
