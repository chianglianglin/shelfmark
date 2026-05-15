import { createMessage } from '../types/message';
import type { AgentMessage } from '../types/message';
import type { Glyph, ParserPayload } from '../types/glyph';

// Note: runParser is Node.js-only (uses pdf-parse).
// Call only from backend or worker context — do NOT call from browser code.
// To enable runtime use: npm install pdf-parse @types/pdf-parse
export async function runParser(input: {
  pdf_buffer: Buffer;
  trace_id: string;
  attempt?: number;
}): Promise<AgentMessage<ParserPayload>> {
  try {
    const pdfParse = await import('pdf-parse');
    const glyphs: Glyph[] = [];
    let page_count = 0;
    const encoding_map: Record<string, string> = {};

    await pdfParse.default(input.pdf_buffer, {
      pagerender: async (pageData: any) => {
        page_count++;
        const page = pageData.pageIndex + 1;
        const viewport = pageData.getViewport({ scale: 1 });
        const textContent = await pageData.getTextContent();

        let glyphIndex = 0;
        for (const item of textContent.items) {
          // item.transform = [scaleX, skewX, skewY, scaleY, translateX, translateY]
          // ty (item.transform[5]) is the BASELINE y in PDF space (bottom-left origin).
          // sy (item.transform[3]) is the font scale = glyph height.
          // Fix 2: screen_y = viewport.height - ty - abs(sy)
          // This places Glyph.y at the TOP of the bounding box in screen coordinates.
          const [sx, , , sy, tx, ty] = item.transform;
          const screenY = viewport.height - ty - Math.abs(sy);
          const charWidth = (item.width / item.str.length) || Math.abs(sx);

          let charIndex = 0;
          for (const char of item.str) {
            glyphs.push({
              id: `p${page}_g${glyphIndex++}`,
              char,
              x: tx + charIndex * charWidth,  // per-char offset within this text item
              y: screenY,
              w: charWidth,
              h: Math.abs(sy),
              page,
              font: item.fontName,
            });
            charIndex++;
          }
        }
        return '';
      },
    });

    return createMessage(
      'parser', 'qa_parse', 'success',
      { page_count, has_text_layer: glyphs.length > 0, glyphs, encoding_map },
      [], input.trace_id, input.attempt ?? 1,
    );
  } catch (err) {
    return createMessage(
      'parser', 'qa_parse', 'fail',
      { page_count: 0, has_text_layer: false, glyphs: [], encoding_map: {} },
      [{
        code: 'CORRUPT_PDF', severity: 'fatal', affected: ['all'],
        detail: String(err),
        suggested_fix: 'Verify PDF is not password-protected or corrupted',
      }],
      input.trace_id, input.attempt ?? 1,
    );
  }
}
