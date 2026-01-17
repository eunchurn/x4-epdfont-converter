"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { loadFreeType } from "@/lib/freetype-loader";
import { convertTTFToEPDFont, formatFileSize } from "@/lib/epdfont-converter";
import type { FreeTypeInstance, FreeTypeFace } from "@/types/freetype";
import type { ConversionResult, UnicodeInterval } from "@/types/epdfont";

interface ConversionState {
  status: "idle" | "loading" | "converting" | "success" | "error";
  progress: number;
  message: string;
  result?: ConversionResult;
}

interface FontInfo {
  familyName: string;
  styleName: string;
  numGlyphs: number;
  fileSize: number;
  isValid: boolean;
  error?: string;
}

// Maximum font file size (10MB)
const MAX_FONT_SIZE = 10 * 1024 * 1024;

// Unicode range definitions with metadata
interface UnicodeRangeInfo {
  id: string;
  name: string;
  description: string;
  intervals: UnicodeInterval[];
  category: string;
  defaultEnabled: boolean;
  charCount: number; // approximate character count
}

// All Unicode ranges organized by category
const UNICODE_RANGES: UnicodeRangeInfo[] = [
  // ===== Latin & European =====
  {
    id: "basicLatin",
    name: "Basic Latin",
    description: "ASCII letters, digits, punctuation (0x0000-0x007F)",
    intervals: [{ start: 0x0000, end: 0x007f }],
    category: "Latin & European",
    defaultEnabled: true,
    charCount: 128,
  },
  {
    id: "latin1Supplement",
    name: "Latin-1 Supplement",
    description: "Accented characters for Western European languages (0x0080-0x00FF)",
    intervals: [{ start: 0x0080, end: 0x00ff }],
    category: "Latin & European",
    defaultEnabled: true,
    charCount: 128,
  },
  {
    id: "latinExtendedA",
    name: "Latin Extended-A",
    description: "Eastern European and Baltic languages (0x0100-0x017F)",
    intervals: [{ start: 0x0100, end: 0x017f }],
    category: "Latin & European",
    defaultEnabled: true,
    charCount: 128,
  },
  {
    id: "latinExtendedB",
    name: "Latin Extended-B",
    description: "Additional Latin characters (0x0180-0x024F)",
    intervals: [{ start: 0x0180, end: 0x024f }],
    category: "Latin & European",
    defaultEnabled: false,
    charCount: 208,
  },
  {
    id: "combiningDiacriticals",
    name: "Combining Diacritical Marks",
    description: "Accent marks for extended Latin rendering (0x0300-0x036F)",
    intervals: [{ start: 0x0300, end: 0x036f }],
    category: "Latin & European",
    defaultEnabled: true,
    charCount: 112,
  },
  {
    id: "greek",
    name: "Greek & Coptic",
    description: "Greek alphabet for science/math (0x0370-0x03FF)",
    intervals: [{ start: 0x0370, end: 0x03ff }],
    category: "Latin & European",
    defaultEnabled: false,
    charCount: 144,
  },
  {
    id: "cyrillic",
    name: "Cyrillic",
    description: "Russian, Ukrainian, Bulgarian, etc. (0x0400-0x04FF)",
    intervals: [{ start: 0x0400, end: 0x04ff }],
    category: "Latin & European",
    defaultEnabled: true,
    charCount: 256,
  },
  {
    id: "cyrillicSupplement",
    name: "Cyrillic Supplement",
    description: "Additional Cyrillic characters (0x0500-0x052F)",
    intervals: [{ start: 0x0500, end: 0x052f }],
    category: "Latin & European",
    defaultEnabled: false,
    charCount: 48,
  },

  // ===== Middle Eastern =====
  {
    id: "arabic",
    name: "Arabic",
    description: "Arabic script (0x0600-0x06FF)",
    intervals: [{ start: 0x0600, end: 0x06ff }],
    category: "Middle Eastern",
    defaultEnabled: false,
    charCount: 256,
  },
  {
    id: "hebrew",
    name: "Hebrew",
    description: "Hebrew alphabet (0x0590-0x05FF)",
    intervals: [{ start: 0x0590, end: 0x05ff }],
    category: "Middle Eastern",
    defaultEnabled: false,
    charCount: 112,
  },

  // ===== South & Southeast Asian =====
  {
    id: "thai",
    name: "Thai",
    description: "Thai script (0x0E00-0x0E7F)",
    intervals: [{ start: 0x0e00, end: 0x0e7f }],
    category: "South & Southeast Asian",
    defaultEnabled: false,
    charCount: 128,
  },

  // ===== Punctuation & Symbols =====
  {
    id: "generalPunctuation",
    name: "General Punctuation",
    description: "Smart quotes, dashes, ellipsis, spaces (0x2000-0x206F)",
    intervals: [{ start: 0x2000, end: 0x206f }],
    category: "Punctuation & Symbols",
    defaultEnabled: true,
    charCount: 112,
  },
  {
    id: "currencySymbols",
    name: "Currency Symbols",
    description: "Euro, Pound, Yen, etc. (0x20A0-0x20CF)",
    intervals: [{ start: 0x20a0, end: 0x20cf }],
    category: "Punctuation & Symbols",
    defaultEnabled: true,
    charCount: 48,
  },
  {
    id: "letterlikeSymbols",
    name: "Letterlike Symbols",
    description: "Trademark, copyright, etc. (0x2100-0x214F)",
    intervals: [{ start: 0x2100, end: 0x214f }],
    category: "Punctuation & Symbols",
    defaultEnabled: false,
    charCount: 80,
  },
  {
    id: "numberForms",
    name: "Number Forms",
    description: "Roman numerals, fractions (0x2150-0x218F)",
    intervals: [{ start: 0x2150, end: 0x218f }],
    category: "Punctuation & Symbols",
    defaultEnabled: false,
    charCount: 64,
  },
  {
    id: "arrows",
    name: "Arrows",
    description: "Arrow symbols (0x2190-0x21FF)",
    intervals: [{ start: 0x2190, end: 0x21ff }],
    category: "Punctuation & Symbols",
    defaultEnabled: true,
    charCount: 112,
  },
  {
    id: "mathOperators",
    name: "Mathematical Operators",
    description: "Math symbols (0x2200-0x22FF)",
    intervals: [{ start: 0x2200, end: 0x22ff }],
    category: "Punctuation & Symbols",
    defaultEnabled: true,
    charCount: 256,
  },
  {
    id: "miscTechnical",
    name: "Misc. Technical",
    description: "Technical symbols (0x2300-0x23FF)",
    intervals: [{ start: 0x2300, end: 0x23ff }],
    category: "Punctuation & Symbols",
    defaultEnabled: false,
    charCount: 256,
  },
  {
    id: "boxDrawing",
    name: "Box Drawing",
    description: "Box drawing characters (0x2500-0x257F)",
    intervals: [{ start: 0x2500, end: 0x257f }],
    category: "Punctuation & Symbols",
    defaultEnabled: false,
    charCount: 128,
  },
  {
    id: "blockElements",
    name: "Block Elements",
    description: "Block and shade characters (0x2580-0x259F)",
    intervals: [{ start: 0x2580, end: 0x259f }],
    category: "Punctuation & Symbols",
    defaultEnabled: false,
    charCount: 32,
  },
  {
    id: "geometricShapes",
    name: "Geometric Shapes",
    description: "Circles, squares, triangles (0x25A0-0x25FF)",
    intervals: [{ start: 0x25a0, end: 0x25ff }],
    category: "Punctuation & Symbols",
    defaultEnabled: false,
    charCount: 96,
  },
  {
    id: "miscSymbols",
    name: "Misc. Symbols",
    description: "Various symbols (0x2600-0x26FF)",
    intervals: [{ start: 0x2600, end: 0x26ff }],
    category: "Punctuation & Symbols",
    defaultEnabled: false,
    charCount: 256,
  },
  {
    id: "dingbats",
    name: "Dingbats",
    description: "Decorative symbols (0x2700-0x27BF)",
    intervals: [{ start: 0x2700, end: 0x27bf }],
    category: "Punctuation & Symbols",
    defaultEnabled: false,
    charCount: 192,
  },

  // ===== CJK (East Asian) =====
  {
    id: "cjkSymbols",
    name: "CJK Symbols & Punctuation",
    description: "CJK punctuation marks (0x3000-0x303F)",
    intervals: [{ start: 0x3000, end: 0x303f }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 64,
  },
  {
    id: "hiragana",
    name: "Hiragana",
    description: "Japanese Hiragana (0x3040-0x309F)",
    intervals: [{ start: 0x3040, end: 0x309f }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 96,
  },
  {
    id: "katakana",
    name: "Katakana",
    description: "Japanese Katakana (0x30A0-0x30FF)",
    intervals: [{ start: 0x30a0, end: 0x30ff }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 96,
  },
  {
    id: "katakanaPhonetic",
    name: "Katakana Phonetic Extensions",
    description: "Katakana extensions (0x31F0-0x31FF)",
    intervals: [{ start: 0x31f0, end: 0x31ff }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 16,
  },
  {
    id: "hangulJamo",
    name: "Hangul Jamo",
    description: "Korean Jamo consonants/vowels (0x1100-0x11FF)",
    intervals: [{ start: 0x1100, end: 0x11ff }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 256,
  },
  {
    id: "hangulCompatJamo",
    name: "Hangul Compatibility Jamo",
    description: "Korean compatibility Jamo (0x3130-0x318F)",
    intervals: [{ start: 0x3130, end: 0x318f }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 96,
  },
  {
    id: "hangulJamoExtA",
    name: "Hangul Jamo Extended-A",
    description: "Old Korean Jamo (0xA960-0xA97F)",
    intervals: [{ start: 0xa960, end: 0xa97f }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 32,
  },
  {
    id: "hangulSyllables",
    name: "Hangul Syllables",
    description: "Complete Korean syllables (0xAC00-0xD7AF) - Large!",
    intervals: [{ start: 0xac00, end: 0xd7af }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 11184,
  },
  {
    id: "hangulJamoExtB",
    name: "Hangul Jamo Extended-B",
    description: "Old Korean Jamo (0xD7B0-0xD7FF)",
    intervals: [{ start: 0xd7b0, end: 0xd7ff }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 80,
  },
  {
    id: "cjkRadicalsSupplement",
    name: "CJK Radicals Supplement",
    description: "CJK radicals (0x2E80-0x2EFF)",
    intervals: [{ start: 0x2e80, end: 0x2eff }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 128,
  },
  {
    id: "kangxiRadicals",
    name: "Kangxi Radicals",
    description: "Kangxi dictionary radicals (0x2F00-0x2FDF)",
    intervals: [{ start: 0x2f00, end: 0x2fdf }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 224,
  },
  {
    id: "cjkUnified",
    name: "CJK Unified Ideographs",
    description: "Main CJK characters (0x4E00-0x9FFF) - Very Large!",
    intervals: [{ start: 0x4e00, end: 0x9fff }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 20992,
  },
  {
    id: "cjkExtensionA",
    name: "CJK Extension A",
    description: "CJK Extension A (0x3400-0x4DBF) - Large!",
    intervals: [{ start: 0x3400, end: 0x4dbf }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 6592,
  },
  {
    id: "cjkCompatIdeographs",
    name: "CJK Compat. Ideographs",
    description: "CJK compatibility (0xF900-0xFAFF)",
    intervals: [{ start: 0xf900, end: 0xfaff }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 512,
  },
  {
    id: "cjkCompatForms",
    name: "CJK Compatibility Forms",
    description: "CJK compatibility forms (0xFE30-0xFE4F)",
    intervals: [{ start: 0xfe30, end: 0xfe4f }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 32,
  },
  {
    id: "halfwidthFullwidth",
    name: "Halfwidth & Fullwidth Forms",
    description: "Width variants (0xFF00-0xFFEF)",
    intervals: [{ start: 0xff00, end: 0xffef }],
    category: "CJK (East Asian)",
    defaultEnabled: false,
    charCount: 240,
  },

  // ===== CJK Extensions (SIP - Supplementary Ideographic Plane) =====
  {
    id: "cjkExtensionB",
    name: "CJK Extension B",
    description: "한중일 통합 한자 확장 B (U+20000-U+2A6DF) - Very Large!",
    intervals: [{ start: 0x20000, end: 0x2a6df }],
    category: "CJK Extensions (SIP)",
    defaultEnabled: false,
    charCount: 42720,
  },
  {
    id: "cjkExtensionC",
    name: "CJK Extension C",
    description: "한중일 통합 한자 확장 C (U+2A700-U+2B73F)",
    intervals: [{ start: 0x2a700, end: 0x2b73f }],
    category: "CJK Extensions (SIP)",
    defaultEnabled: false,
    charCount: 4160,
  },
  {
    id: "cjkExtensionD",
    name: "CJK Extension D",
    description: "한중일 통합 한자 확장 D (U+2B740-U+2B81F)",
    intervals: [{ start: 0x2b740, end: 0x2b81f }],
    category: "CJK Extensions (SIP)",
    defaultEnabled: false,
    charCount: 224,
  },
  {
    id: "cjkExtensionE",
    name: "CJK Extension E",
    description: "한중일 통합 한자 확장 E (U+2B820-U+2CEAF)",
    intervals: [{ start: 0x2b820, end: 0x2ceaf }],
    category: "CJK Extensions (SIP)",
    defaultEnabled: false,
    charCount: 5776,
  },
  {
    id: "cjkExtensionF",
    name: "CJK Extension F",
    description: "한중일 통합 한자 확장 F (U+2CEB0-U+2EBEF)",
    intervals: [{ start: 0x2ceb0, end: 0x2ebef }],
    category: "CJK Extensions (SIP)",
    defaultEnabled: false,
    charCount: 7488,
  },
  {
    id: "cjkCompatIdeographsSupplement",
    name: "CJK Compat. Ideographs Supplement",
    description: "한중일 호환용 한자 보충 (U+2F800-U+2FA1F)",
    intervals: [{ start: 0x2f800, end: 0x2fa1f }],
    category: "CJK Extensions (SIP)",
    defaultEnabled: false,
    charCount: 544,
  },
  {
    id: "cjkExtensionG",
    name: "CJK Extension G",
    description: "한중일 통합 한자 확장 G (U+30000-U+3134F)",
    intervals: [{ start: 0x30000, end: 0x3134f }],
    category: "CJK Extensions (SIP)",
    defaultEnabled: false,
    charCount: 4944,
  },
  {
    id: "cjkExtensionH",
    name: "CJK Extension H",
    description: "한중일 통합 한자 확장 H (U+31350-U+323AF)",
    intervals: [{ start: 0x31350, end: 0x323af }],
    category: "CJK Extensions (SIP)",
    defaultEnabled: false,
    charCount: 4192,
  },

  // ===== Publishing & Documents =====
  {
    id: "superscriptsSubscripts",
    name: "Superscripts & Subscripts",
    description: "위첨자, 아래첨자 (0x2070-0x209F)",
    intervals: [{ start: 0x2070, end: 0x209f }],
    category: "Publishing & Documents",
    defaultEnabled: false,
    charCount: 48,
  },
  {
    id: "enclosedAlphanumerics",
    name: "Enclosed Alphanumerics",
    description: "원문자, 괄호문자 ①②③ (0x2460-0x24FF)",
    intervals: [{ start: 0x2460, end: 0x24ff }],
    category: "Publishing & Documents",
    defaultEnabled: false,
    charCount: 160,
  },
  {
    id: "enclosedCjkLetters",
    name: "Enclosed CJK Letters",
    description: "원문자 한글/한자 ㉠㉡㉢ (0x3200-0x32FF)",
    intervals: [{ start: 0x3200, end: 0x32ff }],
    category: "Publishing & Documents",
    defaultEnabled: false,
    charCount: 256,
  },
  {
    id: "cjkCompatibility",
    name: "CJK Compatibility",
    description: "CJK 호환 문자 ㍿㎜㎝ (0x3300-0x33FF)",
    intervals: [{ start: 0x3300, end: 0x33ff }],
    category: "Publishing & Documents",
    defaultEnabled: false,
    charCount: 256,
  },
  {
    id: "enclosedIdeographicSupplement",
    name: "Enclosed Ideographic Supplement",
    description: "원문자 보충 🈚🈯 (U+1F200-U+1F2FF)",
    intervals: [{ start: 0x1f200, end: 0x1f2ff }],
    category: "Publishing & Documents",
    defaultEnabled: false,
    charCount: 256,
  },
  {
    id: "smallFormVariants",
    name: "Small Form Variants",
    description: "작은 형태 변형 (0xFE50-0xFE6F)",
    intervals: [{ start: 0xfe50, end: 0xfe6f }],
    category: "Publishing & Documents",
    defaultEnabled: false,
    charCount: 32,
  },
  {
    id: "verticalForms",
    name: "Vertical Forms",
    description: "세로쓰기용 기호 (0xFE10-0xFE1F)",
    intervals: [{ start: 0xfe10, end: 0xfe1f }],
    category: "Publishing & Documents",
    defaultEnabled: false,
    charCount: 16,
  },
  {
    id: "ideographicSymbols",
    name: "Ideographic Symbols & Punctuation",
    description: "표의 문자 기호 (U+16FE0-U+16FFF)",
    intervals: [{ start: 0x16fe0, end: 0x16fff }],
    category: "Publishing & Documents",
    defaultEnabled: false,
    charCount: 32,
  },

  // ===== Additional Scripts =====
  {
    id: "latinExtendedAdditional",
    name: "Latin Extended Additional",
    description: "라틴 확장 추가 - 베트남어 등 (0x1E00-0x1EFF)",
    intervals: [{ start: 0x1e00, end: 0x1eff }],
    category: "Additional Scripts",
    defaultEnabled: false,
    charCount: 256,
  },
  {
    id: "latinExtendedC",
    name: "Latin Extended-C",
    description: "라틴 확장 C (0x2C60-0x2C7F)",
    intervals: [{ start: 0x2c60, end: 0x2c7f }],
    category: "Additional Scripts",
    defaultEnabled: false,
    charCount: 32,
  },
  {
    id: "latinExtendedD",
    name: "Latin Extended-D",
    description: "라틴 확장 D (0xA720-0xA7FF)",
    intervals: [{ start: 0xa720, end: 0xa7ff }],
    category: "Additional Scripts",
    defaultEnabled: false,
    charCount: 224,
  },
  {
    id: "latinExtendedE",
    name: "Latin Extended-E",
    description: "라틴 확장 E (0xAB30-0xAB6F)",
    intervals: [{ start: 0xab30, end: 0xab6f }],
    category: "Additional Scripts",
    defaultEnabled: false,
    charCount: 64,
  },
  {
    id: "greekExtended",
    name: "Greek Extended",
    description: "그리스어 확장 (0x1F00-0x1FFF)",
    intervals: [{ start: 0x1f00, end: 0x1fff }],
    category: "Additional Scripts",
    defaultEnabled: false,
    charCount: 256,
  },
  {
    id: "cyrillicExtendedA",
    name: "Cyrillic Extended-A",
    description: "키릴 확장 A (0x2DE0-0x2DFF)",
    intervals: [{ start: 0x2de0, end: 0x2dff }],
    category: "Additional Scripts",
    defaultEnabled: false,
    charCount: 32,
  },
  {
    id: "cyrillicExtendedB",
    name: "Cyrillic Extended-B",
    description: "키릴 확장 B (0xA640-0xA69F)",
    intervals: [{ start: 0xa640, end: 0xa69f }],
    category: "Additional Scripts",
    defaultEnabled: false,
    charCount: 96,
  },
  {
    id: "cyrillicExtendedC",
    name: "Cyrillic Extended-C",
    description: "키릴 확장 C (0x1C80-0x1C8F)",
    intervals: [{ start: 0x1c80, end: 0x1c8f }],
    category: "Additional Scripts",
    defaultEnabled: false,
    charCount: 16,
  },

  // ===== IPA & Phonetics =====
  {
    id: "ipaExtensions",
    name: "IPA Extensions",
    description: "국제음성기호 (0x0250-0x02AF)",
    intervals: [{ start: 0x0250, end: 0x02af }],
    category: "IPA & Phonetics",
    defaultEnabled: false,
    charCount: 96,
  },
  {
    id: "phoneticExtensions",
    name: "Phonetic Extensions",
    description: "음성 확장 (0x1D00-0x1D7F)",
    intervals: [{ start: 0x1d00, end: 0x1d7f }],
    category: "IPA & Phonetics",
    defaultEnabled: false,
    charCount: 128,
  },
  {
    id: "phoneticExtensionsSupplement",
    name: "Phonetic Extensions Supplement",
    description: "음성 확장 보충 (0x1D80-0x1DBF)",
    intervals: [{ start: 0x1d80, end: 0x1dbf }],
    category: "IPA & Phonetics",
    defaultEnabled: false,
    charCount: 64,
  },
  {
    id: "spacingModifierLetters",
    name: "Spacing Modifier Letters",
    description: "간격 수정 문자 (0x02B0-0x02FF)",
    intervals: [{ start: 0x02b0, end: 0x02ff }],
    category: "IPA & Phonetics",
    defaultEnabled: false,
    charCount: 80,
  },

  // ===== Mathematical & Technical =====
  {
    id: "mathAlphanumericSymbols",
    name: "Math Alphanumeric Symbols",
    description: "수학 알파벳 기호 (U+1D400-U+1D7FF)",
    intervals: [{ start: 0x1d400, end: 0x1d7ff }],
    category: "Mathematical & Technical",
    defaultEnabled: false,
    charCount: 1024,
  },
  {
    id: "supplementalMathOperators",
    name: "Supplemental Math Operators",
    description: "수학 연산자 보충 (0x2A00-0x2AFF)",
    intervals: [{ start: 0x2a00, end: 0x2aff }],
    category: "Mathematical & Technical",
    defaultEnabled: false,
    charCount: 256,
  },
  {
    id: "miscMathSymbolsA",
    name: "Misc. Math Symbols-A",
    description: "기타 수학 기호 A (0x27C0-0x27EF)",
    intervals: [{ start: 0x27c0, end: 0x27ef }],
    category: "Mathematical & Technical",
    defaultEnabled: false,
    charCount: 48,
  },
  {
    id: "miscMathSymbolsB",
    name: "Misc. Math Symbols-B",
    description: "기타 수학 기호 B (0x2980-0x29FF)",
    intervals: [{ start: 0x2980, end: 0x29ff }],
    category: "Mathematical & Technical",
    defaultEnabled: false,
    charCount: 128,
  },
  {
    id: "supplementalArrows",
    name: "Supplemental Arrows",
    description: "화살표 보충 A+B+C (0x27F0-0x27FF, 0x2900-0x297F, U+1F800-U+1F8FF)",
    intervals: [
      { start: 0x27f0, end: 0x27ff },
      { start: 0x2900, end: 0x297f },
      { start: 0x1f800, end: 0x1f8ff },
    ],
    category: "Mathematical & Technical",
    defaultEnabled: false,
    charCount: 400,
  },
  {
    id: "opticalCharacterRecognition",
    name: "Optical Character Recognition",
    description: "광학 문자 인식 (0x2440-0x245F)",
    intervals: [{ start: 0x2440, end: 0x245f }],
    category: "Mathematical & Technical",
    defaultEnabled: false,
    charCount: 32,
  },
  {
    id: "controlPictures",
    name: "Control Pictures",
    description: "제어 문자 그림 (0x2400-0x243F)",
    intervals: [{ start: 0x2400, end: 0x243f }],
    category: "Mathematical & Technical",
    defaultEnabled: false,
    charCount: 64,
  },

  // ===== Emoji & Pictographs =====
  {
    id: "miscSymbolsPictographs",
    name: "Misc. Symbols & Pictographs",
    description: "기타 기호 및 픽토그램 (U+1F300-U+1F5FF)",
    intervals: [{ start: 0x1f300, end: 0x1f5ff }],
    category: "Emoji & Pictographs",
    defaultEnabled: false,
    charCount: 768,
  },
  {
    id: "emoticons",
    name: "Emoticons",
    description: "이모티콘 (U+1F600-U+1F64F)",
    intervals: [{ start: 0x1f600, end: 0x1f64f }],
    category: "Emoji & Pictographs",
    defaultEnabled: false,
    charCount: 80,
  },
  {
    id: "transportMapSymbols",
    name: "Transport & Map Symbols",
    description: "교통 및 지도 기호 (U+1F680-U+1F6FF)",
    intervals: [{ start: 0x1f680, end: 0x1f6ff }],
    category: "Emoji & Pictographs",
    defaultEnabled: false,
    charCount: 128,
  },
  {
    id: "supplementalSymbolsPictographs",
    name: "Supplemental Symbols & Pictographs",
    description: "보충 기호 및 픽토그램 (U+1F900-U+1F9FF)",
    intervals: [{ start: 0x1f900, end: 0x1f9ff }],
    category: "Emoji & Pictographs",
    defaultEnabled: false,
    charCount: 256,
  },
  {
    id: "symbolsExtendedA",
    name: "Symbols & Pictographs Extended-A",
    description: "기호 및 픽토그램 확장 A (U+1FA00-U+1FA6F)",
    intervals: [{ start: 0x1fa00, end: 0x1fa6f }],
    category: "Emoji & Pictographs",
    defaultEnabled: false,
    charCount: 112,
  },

  // ===== Special & Private Use =====
  {
    id: "specials",
    name: "Specials",
    description: "특수 문자 (0xFFF0-0xFFFF)",
    intervals: [{ start: 0xfff0, end: 0xffff }],
    category: "Special & Private Use",
    defaultEnabled: false,
    charCount: 16,
  },
  {
    id: "privateUseArea",
    name: "Private Use Area (BMP)",
    description: "사용자 정의 영역 (0xE000-0xF8FF) - Large!",
    intervals: [{ start: 0xe000, end: 0xf8ff }],
    category: "Special & Private Use",
    defaultEnabled: false,
    charCount: 6400,
  },
];

// Group ranges by category
const RANGE_CATEGORIES = Array.from(
  new Set(UNICODE_RANGES.map((r) => r.category))
);

// Get default enabled range IDs
const DEFAULT_ENABLED_RANGES = UNICODE_RANGES
  .filter((r) => r.defaultEnabled)
  .map((r) => r.id);

// Quick presets for common use cases (toggle-able)
// rangeIds contains ONLY the additional ranges for this preset (not including defaults)
interface QuickPreset {
  id: string;
  name: string;
  description: string;
  rangeIds: string[]; // Only the unique ranges for this preset
  icon: string;
}

const QUICK_PRESETS: QuickPreset[] = [
  {
    id: "korean",
    name: "한국어",
    description: "한글 음절, 자모, 호환 자모, CJK 기호, 원문자",
    rangeIds: [
      "hangulSyllables",
      "hangulJamo",
      "hangulCompatJamo",
      "cjkSymbols",
      "enclosedCjkLetters",
    ],
    icon: "🇰🇷",
  },
  {
    id: "hanja",
    name: "한자 (기본)",
    description: "CJK 통합 한자 (20,992자)",
    rangeIds: [
      "cjkUnified",
      "cjkSymbols",
      "kangxiRadicals",
    ],
    icon: "漢",
  },
  {
    id: "hanjaExtended",
    name: "한자 (확장)",
    description: "CJK 한자 + 확장 A~H (약 9만자) - Very Large!",
    rangeIds: [
      "cjkUnified",
      "cjkExtensionA",
      "cjkExtensionB",
      "cjkExtensionC",
      "cjkExtensionD",
      "cjkExtensionE",
      "cjkExtensionF",
      "cjkExtensionG",
      "cjkExtensionH",
      "cjkCompatIdeographs",
      "cjkCompatIdeographsSupplement",
      "cjkSymbols",
      "kangxiRadicals",
      "cjkRadicalsSupplement",
    ],
    icon: "漢+",
  },
  {
    id: "japanese",
    name: "日本語",
    description: "히라가나, 가타카나, CJK 기호",
    rangeIds: [
      "hiragana",
      "katakana",
      "katakanaPhonetic",
      "cjkSymbols",
      "halfwidthFullwidth",
    ],
    icon: "🇯🇵",
  },
  {
    id: "fullwidth",
    name: "전각 문자",
    description: "전각/반각 폼, CJK 기호",
    rangeIds: [
      "halfwidthFullwidth",
      "cjkSymbols",
      "cjkCompatibility",
    ],
    icon: "Ａ",
  },
  {
    id: "publishing",
    name: "출판/문서",
    description: "원문자, 위/아래첨자, 단위기호, 세로쓰기",
    rangeIds: [
      "superscriptsSubscripts",
      "enclosedAlphanumerics",
      "enclosedCjkLetters",
      "cjkCompatibility",
      "smallFormVariants",
      "verticalForms",
      "numberForms",
      "letterlikeSymbols",
    ],
    icon: "📖",
  },
  {
    id: "math",
    name: "수학 기호",
    description: "수학 연산자, 그리스어, 수학 알파벳",
    rangeIds: [
      "greek",
      "greekExtended",
      "numberForms",
      "letterlikeSymbols",
      "miscTechnical",
      "mathAlphanumericSymbols",
      "supplementalMathOperators",
      "miscMathSymbolsA",
      "miscMathSymbolsB",
      "supplementalArrows",
    ],
    icon: "∑",
  },
  {
    id: "symbols",
    name: "특수 문자",
    description: "기호, 딩뱃, 도형, 박스 그리기",
    rangeIds: [
      "miscSymbols",
      "dingbats",
      "geometricShapes",
      "boxDrawing",
      "blockElements",
    ],
    icon: "★",
  },
  {
    id: "european",
    name: "유럽어 확장",
    description: "라틴 확장, 그리스어, 키릴 확장",
    rangeIds: [
      "latinExtendedB",
      "latinExtendedC",
      "latinExtendedD",
      "latinExtendedE",
      "latinExtendedAdditional",
      "greek",
      "greekExtended",
      "cyrillicSupplement",
      "cyrillicExtendedA",
      "cyrillicExtendedB",
      "cyrillicExtendedC",
    ],
    icon: "🇪🇺",
  },
  {
    id: "multilingual",
    name: "다국어",
    description: "아랍어, 히브리어, 태국어, 베트남어",
    rangeIds: [
      "arabic",
      "hebrew",
      "thai",
      "latinExtendedAdditional", // Vietnamese
    ],
    icon: "🌍",
  },
  {
    id: "phonetics",
    name: "음성 기호",
    description: "IPA, 음성 확장, 간격 수정자",
    rangeIds: [
      "ipaExtensions",
      "phoneticExtensions",
      "phoneticExtensionsSupplement",
      "spacingModifierLetters",
    ],
    icon: "🗣️",
  },
  {
    id: "emoji",
    name: "이모지",
    description: "이모티콘, 픽토그램, 기호",
    rangeIds: [
      "miscSymbolsPictographs",
      "emoticons",
      "transportMapSymbols",
      "supplementalSymbolsPictographs",
      "symbolsExtendedA",
    ],
    icon: "😀",
  },
];

// Preview canvas size
const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 800;

// Default preview text
const DEFAULT_PREVIEW_TEXT = `ABCDEFGabcdefg 0123456789
The quick brown fox jumps over the lazy dog.
한글 테스트: 가나다라마바사아자차카타파하
日本語テスト: あいうえお カキクケコ
中文测试: 你好世界
수학 기호: ∑∫∂√∞±×÷=≠≈
특수 문자: ★☆♠♣♥♦►◄●○■□
화살표: ←→↑↓↔↕⇐⇒⇑⇓`;

export default function FontConverter() {
  const [fontFile, setFontFile] = useState<File | null>(null);
  const [fontData, setFontData] = useState<Uint8Array | null>(null);
  const [fontInfo, setFontInfo] = useState<FontInfo | null>(null);
  const [fontName, setFontName] = useState("");
  const [fontSize, setFontSize] = useState(28);
  const [is2Bit, setIs2Bit] = useState(true);
  const [selectedRanges, setSelectedRanges] = useState<string[]>(DEFAULT_ENABLED_RANGES);
  const [customInterval, setCustomInterval] = useState({ start: "", end: "" });
  const [customIntervals, setCustomIntervals] = useState<UnicodeInterval[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<string[]>([]);
  const [isUnicodeRangesOpen, setIsUnicodeRangesOpen] = useState(false); // Collapsed by default
  const [conversionState, setConversionState] = useState<ConversionState>({
    status: "idle",
    progress: 0,
    message: "",
  });
  const [freetypeLoaded, setFreetypeLoaded] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(520); // default width in px
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Font rendering options
  const [charSpacing, setCharSpacing] = useState(0); // pixels between characters
  const [lineSpacing, setLineSpacing] = useState(1.2); // line height multiplier
  const [boldness, setBoldness] = useState(0); // 0 = normal, positive = bolder
  const [italicAngle, setItalicAngle] = useState(0); // degrees for synthetic italic
  const [antialiasing, setAntialiasing] = useState(true); // smooth rendering
  const [baselineShift, setBaselineShift] = useState(0); // vertical offset
  const [horizontalScale, setHorizontalScale] = useState(100); // width percentage

  // Preview state
  const [previewText, setPreviewText] = useState(DEFAULT_PREVIEW_TEXT);
  const [previewBgColor, setPreviewBgColor] = useState("#ffffff");
  const [previewFgColor, setPreviewFgColor] = useState("#000000");
  const [previewScale, setPreviewScale] = useState(1); // zoom level

  const freetypeRef = useRef<FreeTypeInstance | null>(null);
  const activeFontRef = useRef<FreeTypeFace | null>(null);
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Load FreeType WASM on mount
  useEffect(() => {
    loadFreeType()
      .then((ft) => {
        freetypeRef.current = ft;
        setFreetypeLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load FreeType:", err);
        setConversionState({
          status: "error",
          progress: 0,
          message: "Failed to load FreeType WASM library",
        });
      });
  }, []);

  // Desktop detection for sidebar resize
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  // Sidebar resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      // Clamp between 280px and 700px
      setSidebarWidth(Math.min(700, Math.max(280, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  // Validate font file when selected
  const validateFont = useCallback(
    async (file: File): Promise<FontInfo> => {
      // Check file size first
      if (file.size > MAX_FONT_SIZE) {
        return {
          familyName: "",
          styleName: "",
          numGlyphs: 0,
          fileSize: file.size,
          isValid: false,
          error: `Font file is too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(MAX_FONT_SIZE)}.`,
        };
      }

      // Check file extension
      const ext = file.name.toLowerCase().split(".").pop();
      if (!["ttf", "otf", "woff", "woff2"].includes(ext || "")) {
        return {
          familyName: "",
          styleName: "",
          numGlyphs: 0,
          fileSize: file.size,
          isValid: false,
          error: "Unsupported font format. Please use TTF, OTF, WOFF, or WOFF2.",
        };
      }

      if (!freetypeRef.current) {
        return {
          familyName: "",
          styleName: "",
          numGlyphs: 0,
          fileSize: file.size,
          isValid: false,
          error: "FreeType library not loaded yet.",
        };
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);

        // Try to load the font
        const faces = freetypeRef.current.LoadFontFromBytes(data);

        if (!faces || faces.length === 0) {
          return {
            familyName: "",
            styleName: "",
            numGlyphs: 0,
            fileSize: file.size,
            isValid: false,
            error: "Could not find any font faces in the file.",
          };
        }

        const face = faces[0];
        activeFontRef.current = face;

        // Store font data for later use
        setFontData(data);

        return {
          familyName: face.family_name || "Unknown",
          styleName: face.style_name || "Regular",
          numGlyphs: face.num_glyphs || 0,
          fileSize: file.size,
          isValid: true,
        };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";

        // Check for OOM error
        if (errorMessage.includes("OOM") || errorMessage.includes("memory")) {
          return {
            familyName: "",
            styleName: "",
            numGlyphs: 0,
            fileSize: file.size,
            isValid: false,
            error: `Font file is too complex and caused a memory error. Try a simpler font or a smaller file size (current: ${formatFileSize(file.size)}).`,
          };
        }

        return {
          familyName: "",
          styleName: "",
          numGlyphs: 0,
          fileSize: file.size,
          isValid: false,
          error: `Failed to parse font: ${errorMessage}`,
        };
      }
    },
    []
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFontFile(file);
      setFontInfo(null);
      setFontData(null);
      activeFontRef.current = null;
      setConversionState({ status: "idle", progress: 0, message: "" });

      // Auto-set font name from filename
      const name = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, "");
      setFontName(name);

      // Validate font
      setIsValidating(true);
      const info = await validateFont(file);
      setFontInfo(info);
      setIsValidating(false);

      // Update font name from actual font family if valid
      if (info.isValid && info.familyName) {
        setFontName(info.familyName);
      }
    },
    [validateFont]
  );

  const handleRangeToggle = useCallback((rangeId: string) => {
    setSelectedRanges((prev) =>
      prev.includes(rangeId)
        ? prev.filter((id) => id !== rangeId)
        : [...prev, rangeId]
    );
  }, []);

  const handleCategoryToggle = useCallback((category: string) => {
    const categoryRangeIds = UNICODE_RANGES
      .filter((r) => r.category === category)
      .map((r) => r.id);

    setSelectedRanges((prev) => {
      const allSelected = categoryRangeIds.every((id) => prev.includes(id));
      if (allSelected) {
        // Deselect all in category
        return prev.filter((id) => !categoryRangeIds.includes(id));
      } else {
        // Select all in category
        return [...new Set([...prev, ...categoryRangeIds])];
      }
    });
  }, []);

  const handleCategoryCollapse = useCallback((category: string) => {
    setCollapsedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedRanges(UNICODE_RANGES.map((r) => r.id));
  }, []);

  const handleDeselectAll = useCallback(() => {
    setSelectedRanges([]);
  }, []);

  const handleResetToDefaults = useCallback(() => {
    setSelectedRanges(DEFAULT_ENABLED_RANGES);
  }, []);

  // Check if a preset is fully enabled (all its ranges are selected)
  const isPresetEnabled = useCallback((presetId: string): boolean => {
    const preset = QUICK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return false;
    return preset.rangeIds.every((id) => selectedRanges.includes(id));
  }, [selectedRanges]);

  // Check if a preset is partially enabled (some but not all ranges are selected)
  const isPresetPartial = useCallback((presetId: string): boolean => {
    const preset = QUICK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return false;
    const selectedCount = preset.rangeIds.filter((id) => selectedRanges.includes(id)).length;
    return selectedCount > 0 && selectedCount < preset.rangeIds.length;
  }, [selectedRanges]);

  // Toggle preset - add or remove all ranges in the preset
  const handleTogglePreset = useCallback((presetId: string) => {
    const preset = QUICK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    const isEnabled = preset.rangeIds.every((id) => selectedRanges.includes(id));

    if (isEnabled) {
      // Remove all preset ranges (but keep default ranges)
      setSelectedRanges((prev) =>
        prev.filter((id) => !preset.rangeIds.includes(id) || DEFAULT_ENABLED_RANGES.includes(id))
      );
    } else {
      // Add all preset ranges
      setSelectedRanges((prev) => [...new Set([...prev, ...preset.rangeIds])]);
    }
  }, [selectedRanges]);

  // Calculate preset character counts
  const getPresetCharCount = useCallback((presetId: string): number => {
    const preset = QUICK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return 0;
    return preset.rangeIds.reduce((sum, id) => {
      const range = UNICODE_RANGES.find((r) => r.id === id);
      return sum + (range?.charCount || 0);
    }, 0);
  }, []);

  const handleAddCustomInterval = useCallback(() => {
    const start = parseInt(customInterval.start, 16);
    const end = parseInt(customInterval.end, 16);

    if (!isNaN(start) && !isNaN(end) && start <= end) {
      setCustomIntervals((prev) => [...prev, { start, end }]);
      setCustomInterval({ start: "", end: "" });
    }
  }, [customInterval]);

  const handleRemoveCustomInterval = useCallback((index: number) => {
    setCustomIntervals((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Calculate total selected character count
  const totalSelectedChars = selectedRanges.reduce((sum, id) => {
    const range = UNICODE_RANGES.find((r) => r.id === id);
    return sum + (range?.charCount || 0);
  }, 0) + customIntervals.reduce((sum, i) => sum + (i.end - i.start + 1), 0);

  // Check if a code point is in the selected Unicode ranges
  const isCodePointInSelectedRanges = useCallback((codePoint: number): boolean => {
    // Check standard ranges
    for (const rangeId of selectedRanges) {
      const range = UNICODE_RANGES.find((r) => r.id === rangeId);
      if (range) {
        for (const interval of range.intervals) {
          if (codePoint >= interval.start && codePoint <= interval.end) {
            return true;
          }
        }
      }
    }
    // Check custom intervals
    for (const interval of customIntervals) {
      if (codePoint >= interval.start && codePoint <= interval.end) {
        return true;
      }
    }
    return false;
  }, [selectedRanges, customIntervals]);

  // Render preview using FreeType
  const renderPreview = useCallback(async () => {
    const canvas = previewCanvasRef.current;
    const ft = freetypeRef.current;
    if (!canvas || !ft || !fontInfo?.isValid || !fontData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas with background color
    ctx.fillStyle = previewBgColor;
    ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

    try {
      // Reload font to ensure it's active (needed after any other operations)
      const faces = ft.LoadFontFromBytes(fontData);
      if (!faces || faces.length === 0) {
        throw new Error("Failed to load font for preview");
      }

      // Set font using family and style names
      ft.SetFont(faces[0].family_name, faces[0].style_name);
      ft.SetPixelSize(0, fontSize);

      const lineHeight = Math.round(fontSize * lineSpacing);
      let cursorX = 10;
      let cursorY = fontSize + 10;

      const lines = previewText.split("\n");

      // Use FT_LOAD_RENDER flag for rendering
      const loadFlags = ft.FT_LOAD_RENDER | ft.FT_LOAD_TARGET_NORMAL;

      for (const line of lines) {
        cursorX = 10;
        const chars = Array.from(line);

        for (const char of chars) {
          const codePoint = char.codePointAt(0);
          if (codePoint === undefined) continue;

          // Check if character is in selected Unicode ranges
          const isInRange = isCodePointInSelectedRanges(codePoint);

          // Load glyph - returns a Map<number, GlyphInfo>
          const glyphsMap = ft.LoadGlyphs([codePoint], loadFlags);
          const glyph = glyphsMap.get(codePoint);
          if (!glyph) {
            cursorX += fontSize / 2 + charSpacing;
            continue;
          }

          if (glyph.bitmap && glyph.bitmap.imagedata) {
            const imgData = glyph.bitmap.imagedata;
            const width = glyph.bitmap.width;
            const height = glyph.bitmap.rows;

            if (width > 0 && height > 0) {
              // Create temporary canvas for glyph
              const glyphCanvas = document.createElement("canvas");
              glyphCanvas.width = width;
              glyphCanvas.height = height;
              const glyphCtx = glyphCanvas.getContext("2d");

              if (glyphCtx) {
                const imageData = glyphCtx.createImageData(width, height);

                // Parse foreground color - use dimmed color if not in range
                let fgR: number, fgG: number, fgB: number;
                if (isInRange) {
                  fgR = parseInt(previewFgColor.slice(1, 3), 16);
                  fgG = parseInt(previewFgColor.slice(3, 5), 16);
                  fgB = parseInt(previewFgColor.slice(5, 7), 16);
                } else {
                  // Use red/dimmed color for characters not in selected ranges
                  fgR = 200;
                  fgG = 100;
                  fgB = 100;
                }

                // Copy glyph bitmap with color
                const srcData = imgData.data;
                for (let i = 0; i < srcData.length; i += 4) {
                  const alpha = srcData[i + 3];
                  // Apply boldness by increasing alpha threshold
                  const adjustedAlpha = Math.min(255, alpha + boldness * 30);
                  // Apply dimming for out-of-range characters
                  const finalAlpha = isInRange ? adjustedAlpha : Math.floor(adjustedAlpha * 0.5);

                  imageData.data[i] = fgR;
                  imageData.data[i + 1] = fgG;
                  imageData.data[i + 2] = fgB;
                  imageData.data[i + 3] = antialiasing ? finalAlpha : (finalAlpha > 127 ? 255 : 0);
                }

                glyphCtx.putImageData(imageData, 0, 0);

                // Apply horizontal scale
                const scaledWidth = (width * horizontalScale) / 100;

                // Draw glyph with transformations
                ctx.save();

                // Apply italic angle
                if (italicAngle !== 0) {
                  ctx.transform(1, 0, Math.tan((-italicAngle * Math.PI) / 180), 1, 0, 0);
                }

                ctx.drawImage(
                  glyphCanvas,
                  cursorX + glyph.bitmap_left,
                  cursorY - glyph.bitmap_top + baselineShift,
                  scaledWidth,
                  height
                );

                ctx.restore();
              }
            }

            // Advance cursor
            const advance = (glyph.advance?.x || fontSize) / 64;
            cursorX += (advance * horizontalScale) / 100 + charSpacing;
          } else {
            // No bitmap, just advance
            cursorX += fontSize / 2 + charSpacing;
          }

          // Word wrap
          if (cursorX > PREVIEW_WIDTH - 20) {
            cursorX = 10;
            cursorY += lineHeight;
          }
        }

        // Move to next line
        cursorY += lineHeight;

        // Stop if we've exceeded the canvas height
        if (cursorY > PREVIEW_HEIGHT - 20) break;
      }
    } catch (err) {
      console.error("Preview render error:", err);
      // Draw error message
      ctx.fillStyle = "#ff0000";
      ctx.font = "14px sans-serif";
      ctx.fillText("Preview error: " + (err instanceof Error ? err.message : "Unknown"), 10, 30);
    }
  }, [
    fontData,
    fontInfo,
    fontSize,
    previewText,
    previewBgColor,
    previewFgColor,
    charSpacing,
    lineSpacing,
    boldness,
    italicAngle,
    antialiasing,
    baselineShift,
    horizontalScale,
    isCodePointInSelectedRanges,
  ]);

  // Re-render preview when options change
  useEffect(() => {
    if (fontData && fontInfo?.isValid && freetypeLoaded) {
      renderPreview();
    }
  }, [fontData, fontInfo, freetypeLoaded, renderPreview]);

  const handleConvert = useCallback(async () => {
    if (!fontFile || !freetypeRef.current || !fontData || !fontInfo?.isValid)
      return;

    setConversionState({
      status: "converting",
      progress: 0,
      message: "Starting conversion...",
    });

    try {
      // Collect all intervals from selected ranges and custom intervals
      const allIntervals: UnicodeInterval[] = [...customIntervals];
      for (const rangeId of selectedRanges) {
        const range = UNICODE_RANGES.find((r) => r.id === rangeId);
        if (range) {
          allIntervals.push(...range.intervals);
        }
      }

      const result = await convertTTFToEPDFont(freetypeRef.current, fontData, {
        fontName,
        fontSize,
        is2Bit,
        includeKorean: false, // No longer needed, handled by selectedRanges
        additionalIntervals: allIntervals.length > 0 ? allIntervals : undefined,
        onProgress: (progress, message) => {
          setConversionState((prev) => ({
            ...prev,
            progress,
            message,
          }));
        },
      });

      if (result.success) {
        setConversionState({
          status: "success",
          progress: 100,
          message: "Conversion complete!",
          result,
        });
      } else {
        setConversionState({
          status: "error",
          progress: 0,
          message: result.error || "Conversion failed",
        });
      }
    } catch (error) {
      setConversionState({
        status: "error",
        progress: 0,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [
    fontFile,
    fontData,
    fontInfo,
    fontName,
    fontSize,
    is2Bit,
    selectedRanges,
    customIntervals,
  ]);

  const handleDownload = useCallback(() => {
    if (!conversionState.result?.data) return;

    const data = conversionState.result.data;
    const blob = new Blob([new Uint8Array(data)], {
      type: "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);

    if (downloadRef.current) {
      downloadRef.current.href = url;
      downloadRef.current.download = `${fontName}_${fontSize}${is2Bit ? "_2bit" : ""}.epdfont`;
      downloadRef.current.click();
      URL.revokeObjectURL(url);
    }
  }, [conversionState.result, fontName, fontSize, is2Bit]);

  const canConvert =
    fontFile &&
    fontName &&
    freetypeLoaded &&
    fontInfo?.isValid &&
    conversionState.status !== "converting";

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Loading indicator */}
      {!freetypeLoaded && conversionState.status !== "error" && (
        <div className="px-4 py-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <span className="text-blue-700 dark:text-blue-300">
                Loading FreeType WASM library...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error display */}
      {conversionState.status === "error" && (
        <div className="px-4 py-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-700 dark:text-red-300">
              {conversionState.message}
            </p>
          </div>
        </div>
      )}

      {/* Main layout: Settings (left) + Preview (right) */}
      <div className="flex flex-col-reverse lg:flex-row min-h-screen">
        {/* Sidebar - Settings (Left) */}
        <aside
          ref={sidebarRef}
          className="w-full flex-shrink-0 bg-white dark:bg-gray-800 border-t lg:border-t-0 border-gray-200 dark:border-gray-700 relative"
          style={{ width: isDesktop ? sidebarWidth : '100%' }}
        >
          <div className="p-4 space-y-4 lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto">
            {/* Font file upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Font File
          </label>
          <input
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            onChange={handleFileChange}
            disabled={!freetypeLoaded}
            className="block w-full text-sm text-gray-500 dark:text-gray-400
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              dark:file:bg-blue-900 dark:file:text-blue-300
              hover:file:bg-blue-100 dark:hover:file:bg-blue-800
              disabled:opacity-50 disabled:cursor-not-allowed"
          />

          {/* Validating indicator */}
          {isValidating && (
            <div className="mt-2 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <span>Validating font file...</span>
            </div>
          )}

          {/* Font info display */}
          {fontInfo && !isValidating && (
            <div
              className={`mt-3 p-3 rounded-lg ${
                fontInfo.isValid
                  ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
              }`}
            >
              {fontInfo.isValid ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="font-medium">Font loaded successfully</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mt-2">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">
                        Family:{" "}
                      </span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {fontInfo.familyName}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">
                        Style:{" "}
                      </span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {fontInfo.styleName}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">
                        Glyphs:{" "}
                      </span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {fontInfo.numGlyphs.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">
                        Size:{" "}
                      </span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {formatFileSize(fontInfo.fileSize)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
                  <svg
                    className="w-5 h-5 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <p className="font-medium">Font validation failed</p>
                    <p className="text-sm mt-1">{fontInfo.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Font settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Font Name
            </label>
            <input
              type="text"
              value={fontName}
              onChange={(e) => setFontName(e.target.value)}
              placeholder="e.g., myfont"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Font Size (pt)
            </label>
            <input
              type="number"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value) || 14)}
              min={8}
              max={72}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Bit depth selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Bit Depth
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={!is2Bit}
                onChange={() => setIs2Bit(false)}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-gray-700 dark:text-gray-300">
                1-bit (Black & White)
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={is2Bit}
                onChange={() => setIs2Bit(true)}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-gray-700 dark:text-gray-300">
                2-bit (4 Grayscale Levels)
              </span>
            </label>
          </div>
        </div>

        {/* Font Rendering Options */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Rendering Options
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Char Spacing */}
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Char Spacing (px)
              </label>
              <input
                type="number"
                value={charSpacing}
                onChange={(e) => setCharSpacing(parseInt(e.target.value) || 0)}
                min={-10}
                max={50}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Line Spacing */}
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Line Spacing (x)
              </label>
              <input
                type="number"
                value={lineSpacing}
                onChange={(e) => setLineSpacing(parseFloat(e.target.value) || 1)}
                min={0.5}
                max={3}
                step={0.1}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Boldness */}
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Boldness
              </label>
              <input
                type="range"
                value={boldness}
                onChange={(e) => setBoldness(parseInt(e.target.value))}
                min={0}
                max={5}
                className="w-full"
              />
              <div className="text-xs text-center text-gray-500">{boldness}</div>
            </div>

            {/* Italic Angle */}
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Italic Angle
              </label>
              <input
                type="range"
                value={italicAngle}
                onChange={(e) => setItalicAngle(parseInt(e.target.value))}
                min={-20}
                max={20}
                className="w-full"
              />
              <div className="text-xs text-center text-gray-500">{italicAngle}°</div>
            </div>

            {/* Horizontal Scale */}
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Width Scale (%)
              </label>
              <input
                type="number"
                value={horizontalScale}
                onChange={(e) => setHorizontalScale(parseInt(e.target.value) || 100)}
                min={50}
                max={200}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Baseline Shift */}
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Baseline Shift (px)
              </label>
              <input
                type="number"
                value={baselineShift}
                onChange={(e) => setBaselineShift(parseInt(e.target.value) || 0)}
                min={-20}
                max={20}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Antialiasing */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="antialiasing"
                checked={antialiasing}
                onChange={(e) => setAntialiasing(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <label htmlFor="antialiasing" className="text-xs text-gray-600 dark:text-gray-400">
                Antialiasing
              </label>
            </div>

            {/* Reset button */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setCharSpacing(0);
                  setLineSpacing(1.2);
                  setBoldness(0);
                  setItalicAngle(0);
                  setHorizontalScale(100);
                  setBaselineShift(0);
                  setAntialiasing(true);
                }}
                className="text-xs px-2 py-1.5 text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                Reset Options
              </button>
            </div>
          </div>
        </div>

        {/* Test Text Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Test Text
          </label>
          <textarea
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md
              bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
            placeholder="Enter text to preview..."
          />
        </div>

        {/* Quick Presets (Toggle) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Quick Presets (토글)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_PRESETS.map((preset) => {
              const charCount = getPresetCharCount(preset.id);
              const isLarge = charCount > 10000;
              const isEnabled = isPresetEnabled(preset.id);
              const isPartial = isPresetPartial(preset.id);
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleTogglePreset(preset.id)}
                  className={`flex items-center gap-1.5 p-2 rounded border transition-all text-left text-xs
                    ${isEnabled
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                      : isPartial
                        ? "border-blue-300 bg-blue-50/50 dark:bg-blue-900/15 border-dashed"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  title={preset.description}
                >
                  {/* Checkbox indicator */}
                  <div className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center
                    ${isEnabled
                      ? "bg-blue-500 border-blue-500"
                      : isPartial
                        ? "bg-blue-200 border-blue-400 dark:bg-blue-700 dark:border-blue-500"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  >
                    {isEnabled && (
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    {isPartial && !isEnabled && (
                      <svg className="w-2.5 h-2.5 text-blue-600 dark:text-blue-300" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm">{preset.icon}</span>
                  <span className={`font-medium truncate ${isEnabled ? "text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-white"}`}>
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            프리셋을 클릭하여 켜고 끌 수 있습니다. 여러 프리셋을 동시에 선택할 수 있습니다.
          </p>
        </div>

        {/* Unicode Ranges - Collapsible */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          {/* Header with toggle */}
          <div
            className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
            onClick={() => setIsUnicodeRangesOpen(!isUnicodeRangesOpen)}
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-gray-500 dark:text-gray-400"
              >
                {isUnicodeRangesOpen ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Unicode Ranges (세부 선택)
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedRanges.length} ranges, {totalSelectedChars.toLocaleString()} characters
                  {totalSelectedChars > 10000 && (
                    <span className="ml-1 text-yellow-600 dark:text-yellow-400">(Large)</span>
                  )}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsUnicodeRangesOpen(!isUnicodeRangesOpen); }}
              className="text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              {isUnicodeRangesOpen ? "닫기" : "열기"}
            </button>
          </div>

          {/* Collapsible content */}
          {isUnicodeRangesOpen && (
            <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
              {/* Action buttons */}
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs px-2 py-1 text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-xs px-2 py-1 text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  Deselect All
                </button>
                <button
                  type="button"
                  onClick={handleResetToDefaults}
                  className="text-xs px-2 py-1 text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  Reset Defaults
                </button>
              </div>

              {/* Categories */}
              <div className="space-y-2 max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            {RANGE_CATEGORIES.map((category) => {
              const categoryRanges = UNICODE_RANGES.filter(
                (r) => r.category === category
              );
              const selectedInCategory = categoryRanges.filter((r) =>
                selectedRanges.includes(r.id)
              ).length;
              const isCollapsed = collapsedCategories.includes(category);
              const allSelected = selectedInCategory === categoryRanges.length;
              const someSelected = selectedInCategory > 0 && !allSelected;

              return (
                <div key={category} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                  {/* Category header */}
                  <div
                    className="flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                    onClick={() => handleCategoryCollapse(category)}
                  >
                    <button
                      type="button"
                      className="text-gray-500 dark:text-gray-400"
                    >
                      {isCollapsed ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </button>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleCategoryToggle(category);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="font-medium text-gray-900 dark:text-white flex-1">
                      {category}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedInCategory}/{categoryRanges.length}
                    </span>
                  </div>

                  {/* Range items */}
                  {!isCollapsed && (
                    <div className="p-2 space-y-1">
                      {categoryRanges.map((range) => (
                        <label
                          key={range.id}
                          className={`flex items-start gap-2 p-2 rounded cursor-pointer transition-colors
                            ${
                              selectedRanges.includes(range.id)
                                ? "bg-blue-50 dark:bg-blue-900/20"
                                : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedRanges.includes(range.id)}
                            onChange={() => handleRangeToggle(range.id)}
                            className="w-4 h-4 mt-0.5 text-blue-600 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {range.name}
                              </span>
                              {range.charCount > 5000 && (
                                <span className="text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                                  Large
                                </span>
                              )}
                              {range.defaultEnabled && (
                                <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                                  Default
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {range.description}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              {range.charCount.toLocaleString()} chars
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
              </div>
            </div>
          )}
        </div>

        {/* Custom intervals */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Custom Unicode Intervals (Hex)
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={customInterval.start}
              onChange={(e) =>
                setCustomInterval((prev) => ({
                  ...prev,
                  start: e.target.value,
                }))
              }
              placeholder="Start (e.g., AC00)"
              className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
            <span className="text-gray-500">-</span>
            <input
              type="text"
              value={customInterval.end}
              onChange={(e) =>
                setCustomInterval((prev) => ({ ...prev, end: e.target.value }))
              }
              placeholder="End (e.g., D7AF)"
              className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
            <button
              type="button"
              onClick={handleAddCustomInterval}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              Add
            </button>
          </div>
          {customIntervals.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {customIntervals.map((interval, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm"
                >
                  {interval.start.toString(16).toUpperCase()}-
                  {interval.end.toString(16).toUpperCase()}
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomInterval(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Convert button */}
            {/* Convert button */}
            <div className="pt-4">
              <button
                onClick={handleConvert}
                disabled={!canConvert}
                className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg
                  hover:bg-blue-700 focus:ring-4 focus:ring-blue-300
                  disabled:bg-gray-400 disabled:cursor-not-allowed
                  transition-colors duration-200"
              >
                {conversionState.status === "converting"
                  ? "Converting..."
                  : "Convert to EPDFont"}
              </button>
            </div>

          </div>

          {/* Resize handle */}
          <div
            onMouseDown={handleMouseDown}
            className={`hidden lg:block absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 transition-colors
              ${isResizing ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
          />
        </aside>

        {/* Main Content - Preview (Right) */}
        <main className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-900">
          <div className="p-4 lg:p-6 space-y-4">
            {/* Preview Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                  Preview ({PREVIEW_WIDTH}x{PREVIEW_HEIGHT})
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Preview Colors */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 dark:text-gray-400">BG:</label>
                    <input
                      type="color"
                      value={previewBgColor}
                      onChange={(e) => setPreviewBgColor(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 dark:text-gray-400">FG:</label>
                    <input
                      type="color"
                      value={previewFgColor}
                      onChange={(e) => setPreviewFgColor(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                  {/* E-paper presets */}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => { setPreviewBgColor("#ffffff"); setPreviewFgColor("#000000"); }}
                      className="text-xs px-2 py-1 bg-white text-black border rounded"
                      title="White paper"
                    >
                      W
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPreviewBgColor("#f5f5dc"); setPreviewFgColor("#000000"); }}
                      className="text-xs px-2 py-1 bg-[#f5f5dc] text-black border rounded"
                      title="Cream paper"
                    >
                      C
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPreviewBgColor("#000000"); setPreviewFgColor("#ffffff"); }}
                      className="text-xs px-2 py-1 bg-black text-white border rounded"
                      title="Dark mode"
                    >
                      D
                    </button>
                  </div>
                  {/* Zoom Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewScale((s) => Math.max(0.25, s - 0.25))}
                      className="px-2 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                      -
                    </button>
                    <span className="text-xs text-gray-600 dark:text-gray-400 min-w-[3rem] text-center">
                      {Math.round(previewScale * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewScale((s) => Math.min(2, s + 0.25))}
                      className="px-2 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Canvas Preview */}
              <div className="flex justify-center bg-gray-100 dark:bg-gray-900 rounded-lg p-4">
                <div className="relative" style={{ transform: `scale(${previewScale})`, transformOrigin: "top center" }}>
                  <canvas
                    ref={previewCanvasRef}
                    width={PREVIEW_WIDTH}
                    height={PREVIEW_HEIGHT}
                    className="border border-gray-300 dark:border-gray-600 shadow-lg bg-white"
                    style={{ imageRendering: antialiasing ? "auto" : "pixelated" }}
                  />
                  {!fontData && (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-500 pointer-events-none">
                      <p className="text-lg">Load a font to see preview</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Legend for out-of-range characters */}
              <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: "rgb(200, 100, 100)" }}></span>
                  Characters not in selected Unicode ranges (will not be converted)
                </span>
              </div>
            </div>

            {/* Progress bar */}
            {conversionState.status === "converting" && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>{conversionState.message}</span>
                  <span>{Math.round(conversionState.progress)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${conversionState.progress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Success result */}
            {conversionState.status === "success" && conversionState.result && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">Conversion Successful!</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Glyphs</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {conversionState.result.glyphCount?.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Intervals</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {conversionState.result.intervalCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">File Size</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {formatFileSize(conversionState.result.totalSize || 0)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleDownload}
                  className="w-full py-2 px-4 bg-green-600 text-white font-medium rounded-lg
                    hover:bg-green-700 focus:ring-4 focus:ring-green-300
                    transition-colors duration-200"
                >
                  Download .epdfont File
                </button>
                <a ref={downloadRef} className="hidden" />
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
