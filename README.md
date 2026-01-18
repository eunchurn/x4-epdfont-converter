# X4 EPDFont Converter

A web-based font converter that transforms TTF/OTF fonts into EPDFont format for e-paper displays.

## Features

- Convert TTF/OTF fonts to EPDFont binary format (1-bit or 2-bit antialiasing)
- Real-time font preview with customizable rendering options
- Comprehensive Unicode range selection with 100+ presets
- Support for world scripts: Latin, CJK, Arabic, Hebrew, Devanagari, Thai, and many more
- FreeType WASM-based rendering for accurate glyph metrics
- Static site generation (SSG) for easy deployment

## Getting Started

```bash
# Install dependencies
bun install

# Run development server
bun dev

# Build for production
bun run build
```

Open [http://localhost:3000](http://localhost:3000) to use the converter.

## EPDFont Format

EPDFont is a binary font format optimized for e-paper displays:

- **1-bit mode**: Black and white only, smallest file size
- **2-bit mode**: 4 grayscale levels with antialiasing

Output includes glyph metrics (advanceX, advanceY, ascender, descender) for proper text layout.

## Tech Stack

- Next.js 16 with Static Export
- FreeType compiled to WebAssembly
- TypeScript
- Tailwind CSS

## License

MIT
