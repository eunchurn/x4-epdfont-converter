// EPDFont format types

export interface GlyphProps {
  width: number;
  height: number;
  advanceX: number;
  left: number;
  top: number;
  dataLength: number;
  dataOffset: number;
  codePoint: number;
}

export interface UnicodeInterval {
  start: number;
  end: number;
}

export interface EPDFontHeader {
  magic: number;
  version: number;
  is2Bit: boolean;
  advanceY: number;
  ascender: number;
  descender: number;
  intervalCount: number;
  glyphCount: number;
  intervalsOffset: number;
  glyphsOffset: number;
  bitmapOffset: number;
}

export interface EPDFontData {
  header: EPDFontHeader;
  intervals: Array<{ start: number; end: number; offset: number }>;
  glyphs: GlyphProps[];
  bitmapData: Uint8Array;
}

export interface ConversionOptions {
  fontName: string;
  fontSize: number;
  is2Bit: boolean;
  additionalIntervals?: UnicodeInterval[];
  includeKorean?: boolean;
  onProgress?: (progress: number, message: string) => void;
}

export interface ConversionResult {
  success: boolean;
  data?: Uint8Array;
  glyphCount?: number;
  intervalCount?: number;
  totalSize?: number;
  advanceY?: number;
  ascender?: number;
  descender?: number;
  error?: string;
}
