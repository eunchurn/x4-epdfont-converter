import type {
  FreeTypeInstance,
  FreeTypeFace,
  GlyphInfo,
} from "@/types/freetype";
import type {
  GlyphProps,
  UnicodeInterval,
  ConversionOptions,
  ConversionResult,
} from "@/types/epdfont";

// EPDFont constants
const EPDFONT_MAGIC = 0x46445045; // "EPDF"
const EPDFONT_VERSION = 1;

// Batch size for processing to prevent OOM
const BATCH_SIZE = 256;

// Default Unicode intervals
const DEFAULT_INTERVALS: UnicodeInterval[] = [
  // Basic Latin (printable)
  { start: 0x0021, end: 0x007e },
  // Latin-1 Supplement (printable)
  { start: 0x00a1, end: 0x00ff },
  // Latin Extended-A
  { start: 0x0100, end: 0x017f },
  // General Punctuation (subset)
  { start: 0x2010, end: 0x2027 },
  // Currency symbols
  { start: 0x20a0, end: 0x20cf },
  // Cyrillic
  { start: 0x0400, end: 0x04ff },
  // Math Symbols (subset)
  { start: 0x2200, end: 0x22ff },
  // Arrows
  { start: 0x2190, end: 0x21ff },
];

// Korean intervals
const KOREAN_INTERVALS: UnicodeInterval[] = [
  // Hangul Syllables (가-힣)
  { start: 0xac00, end: 0xd7af },
  // Hangul Jamo
  { start: 0x1100, end: 0x11ff },
  // Hangul Compatibility Jamo
  { start: 0x3130, end: 0x318f },
];

// Invisible characters to skip (but keep space for advanceX)
function isInvisibleCharacter(codePoint: number): boolean {
  // Keep space (0x20) - needed for word spacing (advanceX)
  // Keep no-break space (0x00a0) - needed for spacing
  // Keep ideographic space (0x3000) - needed for CJK spacing
  if (codePoint === 0x0009) return true; // Tab
  if (codePoint === 0x000a) return true; // Line Feed
  if (codePoint === 0x000b) return true; // Vertical Tab
  if (codePoint === 0x000c) return true; // Form Feed
  if (codePoint === 0x000d) return true; // Carriage Return
  if (codePoint >= 0x0000 && codePoint <= 0x001f) return true; // Control chars (except space)
  if (codePoint >= 0x007f && codePoint <= 0x009f) return true; // More control chars
  if (codePoint === 0x1680) return true; // Ogham Space Mark
  if (codePoint >= 0x2000 && codePoint <= 0x200a) return true; // Various spaces (keep for advanceX)
  if (codePoint === 0x2028) return true; // Line Separator
  if (codePoint === 0x2029) return true; // Paragraph Separator
  if (codePoint === 0x202f) return true; // Narrow No-Break Space
  if (codePoint === 0x205f) return true; // Medium Mathematical Space
  if (codePoint === 0x200b) return true; // Zero Width Space
  if (codePoint === 0x200c) return true; // Zero Width Non-Joiner
  if (codePoint === 0x200d) return true; // Zero Width Joiner
  if (codePoint === 0x2060) return true; // Word Joiner
  if (codePoint === 0xfeff) return true; // Zero Width No-Break Space (BOM)
  if (codePoint === 0x00ad) return true; // Soft Hyphen
  return false;
}

function mergeIntervals(intervals: UnicodeInterval[]): UnicodeInterval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: UnicodeInterval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

// Yield to event loop to prevent UI freeze and allow GC
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1));
}

// Check if pixel should be rendered based on threshold
function shouldRenderPixel(
  data: Uint8ClampedArray,
  index: number,
  threshold: number
): boolean {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  const a = data[index + 3];

  // Primary check: alpha channel
  if (a > threshold) return true;

  // Secondary check: RGB luminance for fonts that use RGB
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  if (a > threshold / 4 && luminance < 255 - threshold) {
    return true;
  }

  return false;
}

// Convert RGBA imagedata to grayscale values (0-255)
function extractGrayscale(
  imagedata: ImageData,
  width: number,
  height: number,
  threshold: number
): number[] {
  const grayscale: number[] = [];
  const data = imagedata.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (shouldRenderPixel(data, idx, threshold)) {
        // Calculate grayscale from alpha (coverage)
        const a = data[idx + 3];
        grayscale.push(Math.min(255, Math.floor((a / 255) * 255)));
      } else {
        grayscale.push(0);
      }
    }
  }

  return grayscale;
}

// Convert grayscale to 2-bit (4 levels)
function convertTo2bit(grayscale: number[], width: number, height: number): Uint8Array {
  const totalPixels = width * height;
  const packedLength = Math.ceil(totalPixels / 4);
  const packed = new Uint8Array(packedLength);

  for (let i = 0; i < totalPixels; i++) {
    const val = grayscale[i];
    let level: number;

    if (val >= 192) {
      level = 3;
    } else if (val >= 128) {
      level = 2;
    } else if (val >= 64) {
      level = 1;
    } else {
      level = 0;
    }

    const byteIdx = Math.floor(i / 4);
    const bitPos = (3 - (i % 4)) * 2;
    packed[byteIdx] |= level << bitPos;
  }

  return packed;
}

// Convert grayscale to 1-bit (black/white)
function convertTo1bit(grayscale: number[], width: number, height: number): Uint8Array {
  const totalPixels = width * height;
  const packedLength = Math.ceil(totalPixels / 8);
  const packed = new Uint8Array(packedLength);

  for (let i = 0; i < totalPixels; i++) {
    const val = grayscale[i];
    if (val >= 128) {
      const byteIdx = Math.floor(i / 8);
      const bitPos = 7 - (i % 8);
      packed[byteIdx] |= 1 << bitPos;
    }
  }

  return packed;
}

function writeEPDFontBinary(
  intervals: Array<{ start: number; end: number }>,
  glyphs: Array<{ glyph: GlyphProps; data: Uint8Array }>,
  advanceY: number,
  ascender: number,
  descender: number,
  is2Bit: boolean
): Uint8Array {
  const headerSize = 32;
  const intervalsSize = intervals.length * 12;
  const glyphsSize = glyphs.length * 16;

  const intervalsOffset = headerSize;
  const glyphsOffset = intervalsOffset + intervalsSize;
  const bitmapOffset = glyphsOffset + glyphsSize;

  let totalBitmapSize = 0;
  for (const { data } of glyphs) {
    totalBitmapSize += data.length;
  }

  const totalSize = bitmapOffset + totalBitmapSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const uint8View = new Uint8Array(buffer);

  // Write header (32 bytes)
  let offset = 0;
  view.setUint32(offset, EPDFONT_MAGIC, true);
  offset += 4;
  view.setUint16(offset, EPDFONT_VERSION, true);
  offset += 2;
  view.setUint8(offset++, is2Bit ? 1 : 0);
  view.setUint8(offset++, 0);
  view.setUint8(offset++, advanceY & 0xff);
  view.setInt8(offset++, ascender & 0xff);
  view.setInt8(offset++, descender & 0xff);
  view.setUint8(offset++, 0);
  view.setUint32(offset, intervals.length, true);
  offset += 4;
  view.setUint32(offset, glyphs.length, true);
  offset += 4;
  view.setUint32(offset, intervalsOffset, true);
  offset += 4;
  view.setUint32(offset, glyphsOffset, true);
  offset += 4;
  view.setUint32(offset, bitmapOffset, true);
  offset += 4;

  // Write intervals
  let glyphOffset = 0;
  for (const interval of intervals) {
    view.setUint32(offset, interval.start, true);
    offset += 4;
    view.setUint32(offset, interval.end, true);
    offset += 4;
    view.setUint32(offset, glyphOffset, true);
    offset += 4;
    glyphOffset += interval.end - interval.start + 1;
  }

  // Write glyphs
  for (const { glyph } of glyphs) {
    view.setUint8(offset++, glyph.width);
    view.setUint8(offset++, glyph.height);
    view.setUint8(offset++, glyph.advanceX);
    view.setUint8(offset++, 0);
    view.setInt16(offset, glyph.left, true);
    offset += 2;
    view.setInt16(offset, glyph.top, true);
    offset += 2;
    view.setUint32(offset, glyph.dataLength, true);
    offset += 4;
    view.setUint32(offset, glyph.dataOffset, true);
    offset += 4;
  }

  // Write bitmap data
  let bitmapPos = bitmapOffset;
  for (const { data } of glyphs) {
    uint8View.set(data, bitmapPos);
    bitmapPos += data.length;
  }

  return new Uint8Array(buffer);
}

export async function convertTTFToEPDFont(
  ft: FreeTypeInstance,
  fontData: Uint8Array,
  options: ConversionOptions
): Promise<ConversionResult> {
  const { fontSize, is2Bit, additionalIntervals, includeKorean, onProgress } =
    options;

  const threshold = 127; // Pixel render threshold

  try {
    onProgress?.(0, "Loading font...");

    // Load font
    let faces: FreeTypeFace[];
    try {
      faces = ft.LoadFontFromBytes(fontData);
      if (!faces || faces.length === 0) {
        return {
          success: false,
          error: "Failed to load font: No font faces found in the file",
        };
      }
    } catch (err) {
      return {
        success: false,
        error: `Failed to parse font file: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }

    const activeFont = faces[0];

    // Set font using new API
    try {
      ft.SetFont(activeFont.family_name, activeFont.style_name);
      ft.SetPixelSize(0, fontSize);
    } catch (err) {
      return {
        success: false,
        error: `Failed to set font: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }

    onProgress?.(5, "Preparing intervals...");
    await yieldToEventLoop();

    // Prepare intervals
    let intervals = [...DEFAULT_INTERVALS];

    if (includeKorean) {
      intervals = [...intervals, ...KOREAN_INTERVALS];
    }

    if (additionalIntervals) {
      intervals = [...intervals, ...additionalIntervals];
    }

    const mergedIntervals = mergeIntervals(intervals);

    onProgress?.(10, "Scanning glyphs...");

    // Count total code points
    let totalCodePoints = 0;
    for (const interval of mergedIntervals) {
      totalCodePoints += interval.end - interval.start + 1;
    }

    // Collect all code points to process
    const allCodePoints: number[] = [];
    for (const { start, end } of mergedIntervals) {
      for (let cp = start; cp <= end; cp++) {
        if (!isInvisibleCharacter(cp)) {
          allCodePoints.push(cp);
        }
      }
    }

    onProgress?.(15, `Processing ${allCodePoints.length} glyphs...`);

    // Process glyphs in batches using new LoadGlyphs API
    const validGlyphs: Map<number, { glyph: GlyphProps; data: Uint8Array }> = new Map();
    let totalDataSize = 0;
    let processedCount = 0;

    for (let i = 0; i < allCodePoints.length; i += BATCH_SIZE) {
      const batchCodes = allCodePoints.slice(i, i + BATCH_SIZE);

      try {
        const loadFlags = ft.FT_LOAD_RENDER | ft.FT_LOAD_TARGET_NORMAL;
        const glyphsMap = ft.LoadGlyphs(batchCodes, loadFlags);

        for (const [charCode, glyphInfo] of glyphsMap.entries()) {
          processGlyph(charCode, glyphInfo);
        }
      } catch (err) {
        console.warn(`Batch ${i}-${i + BATCH_SIZE} failed:`, err);
        // Process individually as fallback
        for (const charCode of batchCodes) {
          try {
            const glyphsMap = ft.LoadGlyphs([charCode], ft.FT_LOAD_RENDER);
            const glyphInfo = glyphsMap.get(charCode);
            if (glyphInfo) {
              processGlyph(charCode, glyphInfo);
            }
          } catch {
            // Skip failed glyphs
          }
        }
      }

      processedCount += batchCodes.length;
      const progress = 15 + (processedCount / allCodePoints.length) * 70;
      onProgress?.(progress, `Processing glyphs... ${processedCount}/${allCodePoints.length}`);
      await yieldToEventLoop();
    }

    function processGlyph(charCode: number, glyphInfo: GlyphInfo) {
      const bitmap = glyphInfo.bitmap;

      if (!bitmap || bitmap.width <= 0 || bitmap.rows <= 0) {
        // Empty glyph
        const emptyGlyph: GlyphProps = {
          width: 0,
          height: 0,
          advanceX: Math.round(glyphInfo.advance?.x / 64) || 0,
          left: 0,
          top: 0,
          dataLength: 0,
          dataOffset: totalDataSize,
          codePoint: charCode,
        };
        validGlyphs.set(charCode, { glyph: emptyGlyph, data: new Uint8Array(0) });
        return;
      }

      // Get grayscale from imagedata or buffer
      let grayscale: number[];

      if (bitmap.imagedata) {
        grayscale = extractGrayscale(bitmap.imagedata, bitmap.width, bitmap.rows, threshold);
      } else if (bitmap.buffer) {
        // Fallback: convert buffer to grayscale
        grayscale = Array.from(bitmap.buffer);
      } else {
        // No bitmap data
        const emptyGlyph: GlyphProps = {
          width: 0,
          height: 0,
          advanceX: Math.round(glyphInfo.advance?.x / 64) || 0,
          left: 0,
          top: 0,
          dataLength: 0,
          dataOffset: totalDataSize,
          codePoint: charCode,
        };
        validGlyphs.set(charCode, { glyph: emptyGlyph, data: new Uint8Array(0) });
        return;
      }

      // Convert to target bit depth
      const packedData = is2Bit
        ? convertTo2bit(grayscale, bitmap.width, bitmap.rows)
        : convertTo1bit(grayscale, bitmap.width, bitmap.rows);

      const glyph: GlyphProps = {
        width: bitmap.width,
        height: bitmap.rows,
        advanceX: Math.round(glyphInfo.advance?.x / 64) || bitmap.width,
        left: glyphInfo.bitmap_left || 0,
        top: glyphInfo.bitmap_top || 0,
        dataLength: packedData.length,
        dataOffset: totalDataSize,
        codePoint: charCode,
      };

      totalDataSize += packedData.length;
      validGlyphs.set(charCode, { glyph, data: packedData });
    }

    onProgress?.(85, "Building intervals...");
    await yieldToEventLoop();

    // Build validated intervals from processed glyphs
    const validatedIntervals: Array<{ start: number; end: number }> = [];
    const sortedCodes = Array.from(validGlyphs.keys()).sort((a, b) => a - b);

    if (sortedCodes.length > 0) {
      let rangeStart = sortedCodes[0];
      let rangeEnd = sortedCodes[0];

      for (let i = 1; i < sortedCodes.length; i++) {
        const code = sortedCodes[i];
        if (code === rangeEnd + 1) {
          rangeEnd = code;
        } else {
          validatedIntervals.push({ start: rangeStart, end: rangeEnd });
          rangeStart = code;
          rangeEnd = code;
        }
      }
      validatedIntervals.push({ start: rangeStart, end: rangeEnd });
    }

    // Build ordered glyphs array
    const orderedGlyphs: Array<{ glyph: GlyphProps; data: Uint8Array }> = [];
    let currentOffset = 0;

    for (const { start, end } of validatedIntervals) {
      for (let cp = start; cp <= end; cp++) {
        const glyphData = validGlyphs.get(cp);
        if (glyphData) {
          glyphData.glyph.dataOffset = currentOffset;
          currentOffset += glyphData.data.length;
          orderedGlyphs.push(glyphData);
        } else {
          // Missing glyph - add empty placeholder
          const emptyGlyph: GlyphProps = {
            width: 0,
            height: 0,
            advanceX: 0,
            left: 0,
            top: 0,
            dataLength: 0,
            dataOffset: currentOffset,
            codePoint: cp,
          };
          orderedGlyphs.push({ glyph: emptyGlyph, data: new Uint8Array(0) });
        }
      }
    }

    onProgress?.(90, "Building binary...");
    await yieldToEventLoop();

    // Get font metrics from scaled size (after SetPixelSize)
    // FreeType stores metrics in 26.6 fixed-point format (multiply by 64)
    // Use size.* for scaled metrics, not face.* which are unscaled
    const sizeMetrics = activeFont.size;
    const advanceY = sizeMetrics?.height
      ? Math.ceil(sizeMetrics.height / 64)
      : fontSize;
    const ascender = sizeMetrics?.ascender
      ? Math.ceil(sizeMetrics.ascender / 64)
      : Math.ceil(fontSize * 0.8);
    const descender = sizeMetrics?.descender
      ? Math.floor(sizeMetrics.descender / 64)
      : Math.floor(-fontSize * 0.2);

    // Write binary
    const binaryData = writeEPDFontBinary(
      validatedIntervals,
      orderedGlyphs,
      advanceY,
      ascender,
      descender,
      is2Bit
    );

    onProgress?.(100, "Complete!");

    return {
      success: true,
      data: binaryData,
      glyphCount: orderedGlyphs.length,
      intervalCount: validatedIntervals.length,
      totalSize: binaryData.length,
      advanceY,
      ascender,
      descender,
    };
  } catch (error) {
    console.error("Conversion error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
