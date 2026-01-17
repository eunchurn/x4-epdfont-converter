// FreeType WASM type definitions (v0.x API)

export interface FreeTypeBitmap {
  width: number;
  rows: number;
  pitch: number;
  buffer: Uint8Array;
  imagedata?: ImageData; // New API provides ImageData directly
  pixel_mode: number;
  num_grays: number;
}

export interface FreeTypeGlyph {
  bitmap: FreeTypeBitmap;
  bitmap_left: number;
  bitmap_top: number;
  advance: {
    x: number;
    y: number;
  };
}

export interface FreeTypeSize {
  height: number;
  ascender: number;
  descender: number;
}

export interface FreeTypeFace {
  glyph: FreeTypeGlyph;
  size: FreeTypeSize;
  num_glyphs: number;
  family_name: string;
  style_name: string;
  ascender: number;
  descender: number;
  height: number;
  // Legacy API
  setCharSize?(
    width: number,
    height: number,
    hres: number,
    vres: number
  ): void;
  loadGlyph?(glyphIndex: number, flags: number): void;
  getCharIndex?(charCode: number): number;
}

// Glyph info returned by LoadGlyphs
export interface GlyphInfo {
  bitmap: {
    width: number;
    rows: number;
    imagedata?: ImageData;
    buffer?: Uint8Array;
  };
  bitmap_left: number;
  bitmap_top: number;
  advance: {
    x: number;
    y: number;
  };
}

export interface FreeTypeInstance {
  // Font loading
  LoadFontFromBytes(buffer: Uint8Array): FreeTypeFace[];

  // New API (v0.x)
  SetFont(familyName: string, styleName: string): void;
  SetPixelSize(width: number, height: number): void;
  LoadGlyphs(charCodes: number[], flags: number): Map<number, GlyphInfo>;

  // Load flags
  FT_LOAD_RENDER: number;
  FT_LOAD_TARGET_NORMAL: number;
  FT_LOAD_TARGET_MONO: number;
  FT_LOAD_NO_HINTING: number;
}

export type FreeTypeInit = (options?: {
  locateFile?: (path: string) => string;
}) => Promise<FreeTypeInstance>;

declare module "freetype-wasm/dist/freetype.js" {
  const FreeTypeInit: FreeTypeInit;
  export default FreeTypeInit;
}
