#!/usr/bin/env python3
"""
Convert TTF/OTF font files directly to .epdfont binary format.

Usage:
    python ttf_to_epdfont.py <font_name> <size> <font_file> [--additional-intervals MIN,MAX] [-o output.epdfont]

Example:
    python ttf_to_epdfont.py hangeuljaemin 14 ./Hangeuljaemin.ttf --additional-intervals 0xAC00,0xD7AF -o hangeuljaemin_14.epdfont
"""

import freetype
import struct
import sys
import math
import argparse
from collections import namedtuple

EPDFONT_MAGIC = 0x46445045  # "EPDF"
EPDFONT_VERSION = 1

GlyphProps = namedtuple("GlyphProps", ["width", "height", "advance_x", "left", "top", "data_length", "data_offset", "code_point"])

def norm_floor(val):
    return int(math.floor(val / (1 << 6)))

def norm_ceil(val):
    return int(math.ceil(val / (1 << 6)))

def load_glyph(font_stack, code_point):
    face_index = 0
    while face_index < len(font_stack):
        face = font_stack[face_index]
        glyph_index = face.get_char_index(code_point)
        if glyph_index > 0:
            face.load_glyph(glyph_index, freetype.FT_LOAD_RENDER)
            return face
        face_index += 1
    return None

def convert_ttf_to_epdfont(font_files, font_name, size, output_path, additional_intervals=None, is_2bit=False, line_height=1.2, letter_spacing=0, width_scale=1.0, baseline_offset=0):
    """Convert TTF font to .epdfont binary format.
    
    Args:
        line_height: Line height multiplier (default 1.2 = 120%)
        letter_spacing: Additional spacing between characters in pixels (default 0)
        width_scale: Horizontal scaling factor for glyph width (default 1.0 = 100%, 장평)
        baseline_offset: Vertical offset for baseline in pixels (default 0, positive = up)
    """

    font_stack = [freetype.Face(f) for f in font_files]

    # Set font size in pixels (same as FreeType.js SetPixelSize)
    for face in font_stack:
        face.set_pixel_sizes(0, size)

    # Default Unicode intervals - Comprehensive coverage
    intervals = [
        # === Basic Latin & Extensions ===
        # Basic Latin (ASCII)
        (0x0000, 0x007F),
        # Latin-1 Supplement
        (0x0080, 0x00FF),
        # Latin Extended-A
        (0x0100, 0x017F),
        # Latin Extended-B
        (0x0180, 0x024F),
        # IPA Extensions
        (0x0250, 0x02AF),
        # Spacing Modifier Letters
        (0x02B0, 0x02FF),
        # Combining Diacritical Marks
        (0x0300, 0x036F),
        # Greek and Coptic
        (0x0370, 0x03FF),
        # Cyrillic
        (0x0400, 0x04FF),
        # Cyrillic Supplement
        (0x0500, 0x052F),

        # === Korean (Hangul) ===
        # Hangul Jamo (초성, 중성, 종성)
        (0x1100, 0x11FF),
        # Hangul Compatibility Jamo (ㄱ-ㅎ, ㅏ-ㅣ)
        (0x3130, 0x318F),
        # Hangul Jamo Extended-A
        (0xA960, 0xA97F),
        # Hangul Syllables (가-힣) - 11,172 characters
        (0xAC00, 0xD7AF),
        # Hangul Jamo Extended-B
        (0xD7B0, 0xD7FF),

        # === CJK (Chinese, Japanese, Korean) ===
        # CJK Symbols and Punctuation
        (0x3000, 0x303F),
        # Hiragana
        (0x3040, 0x309F),
        # Katakana
        (0x30A0, 0x30FF),
        # Bopomofo
        (0x3100, 0x312F),
        # Katakana Phonetic Extensions
        (0x31F0, 0x31FF),
        # Enclosed CJK Letters and Months (㈀-㋿)
        (0x3200, 0x32FF),
        # CJK Compatibility (㌀-㏿)
        (0x3300, 0x33FF),
        # CJK Unified Ideographs Extension A (한자 확장 A)
        (0x3400, 0x4DBF),
        # CJK Unified Ideographs (한자 기본) - 20,992 characters
        (0x4E00, 0x9FFF),
        # CJK Compatibility Ideographs
        (0xF900, 0xFAFF),

        # === Fullwidth Characters (전각문자) ===
        # Halfwidth and Fullwidth Forms
        (0xFF00, 0xFFEF),

        # === Punctuation & Symbols ===
        # General Punctuation
        (0x2000, 0x206F),
        # Superscripts and Subscripts
        (0x2070, 0x209F),
        # Currency Symbols
        (0x20A0, 0x20CF),
        # Combining Diacritical Marks for Symbols
        (0x20D0, 0x20FF),
        # Letterlike Symbols
        (0x2100, 0x214F),
        # Number Forms
        (0x2150, 0x218F),
        # Arrows
        (0x2190, 0x21FF),
        # Mathematical Operators
        (0x2200, 0x22FF),
        # Miscellaneous Technical
        (0x2300, 0x23FF),
        # Control Pictures
        (0x2400, 0x243F),
        # Optical Character Recognition
        (0x2440, 0x245F),
        # Enclosed Alphanumerics (①②③...)
        (0x2460, 0x24FF),
        # Box Drawing
        (0x2500, 0x257F),
        # Block Elements
        (0x2580, 0x259F),
        # Geometric Shapes
        (0x25A0, 0x25FF),
        # Miscellaneous Symbols
        (0x2600, 0x26FF),
        # Dingbats
        (0x2700, 0x27BF),
        # Miscellaneous Mathematical Symbols-A
        (0x27C0, 0x27EF),
        # Supplemental Arrows-A
        (0x27F0, 0x27FF),
        # Braille Patterns
        (0x2800, 0x28FF),
        # Supplemental Arrows-B
        (0x2900, 0x297F),
        # Miscellaneous Mathematical Symbols-B
        (0x2980, 0x29FF),
        # Supplemental Mathematical Operators
        (0x2A00, 0x2AFF),
        # Miscellaneous Symbols and Arrows
        (0x2B00, 0x2BFF),

        # === Special Characters ===
        # Private Use Area (일부만)
        # (0xE000, 0xF8FF),  # 주석처리 - 필요시 활성화
        
        # Specials
        (0xFFF0, 0xFFFF),

        # === Emoji & Pictographs ===
        # Miscellaneous Symbols and Pictographs
        (0x1F300, 0x1F5FF),
        # Emoticons
        (0x1F600, 0x1F64F),
        # Transport and Map Symbols
        (0x1F680, 0x1F6FF),
        # Supplemental Symbols and Pictographs
        (0x1F900, 0x1F9FF),
        # Symbols and Pictographs Extended-A
        (0x1FA00, 0x1FA6F),
        # Symbols and Pictographs Extended-B
        (0x1FA70, 0x1FAFF),

        # === Additional CJK Extensions (한자 확장) ===
        # CJK Unified Ideographs Extension B
        (0x20000, 0x2A6DF),
        # CJK Unified Ideographs Extension C
        (0x2A700, 0x2B73F),
        # CJK Unified Ideographs Extension D
        (0x2B740, 0x2B81F),
        # CJK Unified Ideographs Extension E
        (0x2B820, 0x2CEAF),
        # CJK Unified Ideographs Extension F
        (0x2CEB0, 0x2EBEF),
        # CJK Compatibility Ideographs Supplement
        (0x2F800, 0x2FA1F),
    ]

    # Korean-specific intervals (legacy - now included in default)
    korean_intervals = []

    # Add additional intervals if specified
    if additional_intervals:
        for interval in additional_intervals:
            parts = interval.split(',')
            if len(parts) == 2:
                start = int(parts[0], 0)
                end = int(parts[1], 0)
                intervals.append((start, end))

    # All intervals are now included by default
    # Korean-specific intervals are already in the default list

    # Sort and merge intervals
    unmerged_intervals = sorted(intervals)
    merged_intervals = []
    for i_start, i_end in unmerged_intervals:
        if merged_intervals and i_start <= merged_intervals[-1][1] + 1:
            merged_intervals[-1] = (merged_intervals[-1][0], max(merged_intervals[-1][1], i_end))
        else:
            merged_intervals.append((i_start, i_end))

    # Validate intervals (remove code points not in font)
    validated_intervals = []
    for i_start, i_end in merged_intervals:
        start = i_start
        for code_point in range(i_start, i_end + 1):
            face = load_glyph(font_stack, code_point)
            if face is None:
                if start < code_point:
                    validated_intervals.append((start, code_point - 1))
                start = code_point + 1
        if start <= i_end:
            validated_intervals.append((start, i_end))

    print(f"Processing {len(validated_intervals)} intervals...")

    # Generate glyphs
    total_size = 0
    all_glyphs = []

    for i_start, i_end in validated_intervals:
        for code_point in range(i_start, i_end + 1):
            face = load_glyph(font_stack, code_point)
            if face is None:
                continue

            bitmap = face.glyph.bitmap

            # Build 4-bit greyscale bitmap
            pixels4g = []
            px = 0
            for i, v in enumerate(bitmap.buffer):
                y = i // bitmap.width if bitmap.width > 0 else 0
                x = i % bitmap.width if bitmap.width > 0 else 0
                if x % 2 == 0:
                    px = (v >> 4)
                else:
                    px = px | (v & 0xF0)
                    pixels4g.append(px)
                    px = 0
                if bitmap.width > 0 and x == bitmap.width - 1 and bitmap.width % 2 > 0:
                    pixels4g.append(px)
                    px = 0

            if is_2bit:
                # 2-bit greyscale
                pixels2b = []
                px = 0
                pitch = (bitmap.width // 2) + (bitmap.width % 2)
                for y in range(bitmap.rows):
                    for x in range(bitmap.width):
                        px = px << 2
                        if pitch > 0 and len(pixels4g) > 0:
                            bm = pixels4g[y * pitch + (x // 2)] if y * pitch + (x // 2) < len(pixels4g) else 0
                            bm = (bm >> ((x % 2) * 4)) & 0xF
                            if bm >= 12:
                                px += 3
                            elif bm >= 8:
                                px += 2
                            elif bm >= 4:
                                px += 1
                        if (y * bitmap.width + x) % 4 == 3:
                            pixels2b.append(px)
                            px = 0
                if (bitmap.width * bitmap.rows) % 4 != 0:
                    px = px << (4 - (bitmap.width * bitmap.rows) % 4) * 2
                    pixels2b.append(px)
                pixels = pixels2b
            else:
                # 1-bit black and white
                pixelsbw = []
                px = 0
                pitch = (bitmap.width // 2) + (bitmap.width % 2)
                for y in range(bitmap.rows):
                    for x in range(bitmap.width):
                        px = px << 1
                        if pitch > 0 and len(pixels4g) > 0:
                            idx = y * pitch + (x // 2)
                            bm = pixels4g[idx] if idx < len(pixels4g) else 0
                            px += 1 if ((x & 1) == 0 and bm & 0xE > 0) or ((x & 1) == 1 and bm & 0xE0 > 0) else 0
                        if (y * bitmap.width + x) % 8 == 7:
                            pixelsbw.append(px)
                            px = 0
                if (bitmap.width * bitmap.rows) % 8 != 0:
                    px = px << (8 - (bitmap.width * bitmap.rows) % 8)
                    pixelsbw.append(px)
                pixels = pixelsbw

            packed = bytes(pixels)
            # Apply letter spacing and width scale to advance_x
            original_advance_x = norm_floor(face.glyph.advance.x)
            adjusted_advance_x = int(original_advance_x * width_scale) + letter_spacing
            
            # Apply baseline offset to top position
            adjusted_top = face.glyph.bitmap_top + baseline_offset
            
            glyph = GlyphProps(
                width=bitmap.width,
                height=bitmap.rows,
                advance_x=adjusted_advance_x,
                left=face.glyph.bitmap_left,
                top=adjusted_top,
                data_length=len(packed),
                data_offset=total_size,
                code_point=code_point,
            )
            total_size += len(packed)
            all_glyphs.append((glyph, packed))

    # Get font metrics from pipe character
    face = load_glyph(font_stack, ord('|'))
    if face is None:
        face = font_stack[0]

    # Apply line height multiplier to advance_y
    original_advance_y = norm_ceil(face.size.height)
    advance_y = int(original_advance_y * line_height)
    ascender = norm_ceil(face.size.ascender)
    descender = norm_floor(face.size.descender)

    print(f"Generated {len(all_glyphs)} glyphs")
    print(f"Font metrics: advanceY={advance_y} (line-height: {line_height*100:.0f}%), ascender={ascender}, descender={descender}")
    if letter_spacing != 0:
        print(f"Letter spacing: {letter_spacing:+d}px")
    if width_scale != 1.0:
        print(f"Width scale (장평): {width_scale*100:.0f}%")
    if baseline_offset != 0:
        print(f"Baseline offset: {baseline_offset:+d}px")

    # Write .epdfont file
    write_epdfont(output_path, validated_intervals, all_glyphs, advance_y, ascender, descender, is_2bit)

    return True

def write_epdfont(output_path, intervals, all_glyphs, advance_y, ascender, descender, is_2bit):
    """Write font data to .epdfont binary file."""

    # Calculate offsets
    header_size = 32
    intervals_size = len(intervals) * 12
    glyphs_size = len(all_glyphs) * 16

    intervals_offset = header_size
    glyphs_offset = intervals_offset + intervals_size
    bitmap_offset = glyphs_offset + glyphs_size

    # Collect bitmap data
    bitmap_data = b''.join([packed for _, packed in all_glyphs])

    with open(output_path, 'wb') as f:
        # Write header (32 bytes)
        header = struct.pack(
            '<IHBBBBBB5I',
            EPDFONT_MAGIC,           # uint32 magic
            EPDFONT_VERSION,         # uint16 version
            1 if is_2bit else 0,     # uint8 is2Bit
            0,                       # uint8 reserved1
            advance_y & 0xFF,        # uint8 advanceY
            ascender & 0xFF,         # int8 ascender
            descender & 0xFF,        # int8 descender (signed)
            0,                       # uint8 reserved2
            len(intervals),          # uint32 intervalCount
            len(all_glyphs),         # uint32 glyphCount
            intervals_offset,        # uint32 intervalsOffset
            glyphs_offset,           # uint32 glyphsOffset
            bitmap_offset,           # uint32 bitmapOffset
        )
        f.write(header)

        # Write intervals
        offset = 0
        for i_start, i_end in intervals:
            f.write(struct.pack('<3I', i_start, i_end, offset))
            offset += i_end - i_start + 1

        # Write glyphs
        for glyph, _ in all_glyphs:
            f.write(struct.pack(
                '<4B2h2I',
                glyph.width,
                glyph.height,
                glyph.advance_x,
                0,  # reserved
                glyph.left,
                glyph.top,
                glyph.data_length,
                glyph.data_offset,
            ))

        # Write bitmap data
        f.write(bitmap_data)

    total_size = bitmap_offset + len(bitmap_data)
    print(f"\nCreated: {output_path}")
    print(f"  Intervals: {len(intervals)}")
    print(f"  Glyphs: {len(all_glyphs)}")
    print(f"  Bitmap size: {len(bitmap_data)} bytes")
    print(f"  Total file size: {total_size} bytes ({total_size / 1024 / 1024:.2f} MB)")

def main():
    parser = argparse.ArgumentParser(description='Convert TTF/OTF font to .epdfont binary format')
    parser.add_argument('name', help='Font name (used for identification)')
    parser.add_argument('size', type=int, help='Font size in pixels')
    parser.add_argument('fontfiles', nargs='+', help='TTF/OTF font file(s), in priority order')
    parser.add_argument('--2bit', dest='is_2bit', action='store_true', help='Generate 2-bit greyscale instead of 1-bit')
    parser.add_argument('--additional-intervals', dest='additional_intervals', action='append',
                        help='Additional Unicode intervals as MIN,MAX (hex or decimal). Can be repeated.')
    parser.add_argument('-o', '--output', dest='output', help='Output .epdfont file path')
    parser.add_argument('--line-height', dest='line_height', type=float, default=1.2,
                        help='Line height multiplier (default: 1.2 = 120%%)')
    parser.add_argument('--letter-spacing', dest='letter_spacing', type=int, default=0,
                        help='Additional spacing between characters in pixels (default: 0)')
    parser.add_argument('--width-scale', dest='width_scale', type=float, default=1.0,
                        help='Horizontal width scale factor, 장평 (default: 1.0 = 100%%)')
    parser.add_argument('--baseline-offset', dest='baseline_offset', type=int, default=0,
                        help='Baseline vertical offset in pixels (default: 0, positive = up)')
    args = parser.parse_args()

    output_path = args.output if args.output else f"{args.name}_{args.size}.epdfont"

    print(f"Converting {args.fontfiles[0]} to {output_path}")
    print(f"Font: {args.name}, Size: {args.size}px, Mode: {'2-bit' if args.is_2bit else '1-bit'}")
    print(f"Line height: {args.line_height*100:.0f}%, Letter spacing: {args.letter_spacing}px")
    print(f"Width scale (장평): {args.width_scale*100:.0f}%, Baseline offset: {args.baseline_offset}px")
    print("")

    success = convert_ttf_to_epdfont(
        args.fontfiles,
        args.name,
        args.size,
        output_path,
        args.additional_intervals,
        args.is_2bit,
        args.line_height,
        args.letter_spacing,
        args.width_scale,
        args.baseline_offset
    )

    if success:
        print("\nConversion complete!")
    else:
        print("\nConversion failed!")
        sys.exit(1)

if __name__ == '__main__':
    main()
