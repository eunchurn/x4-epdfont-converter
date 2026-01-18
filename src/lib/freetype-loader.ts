import type { FreeTypeInstance, FreeTypeInit } from "@/types/freetype";

let freetypeInstance: FreeTypeInstance | null = null;
let loadingPromise: Promise<FreeTypeInstance> | null = null;

// // Dynamic script loader for CDN
// function loadScript(src: string): Promise<void> {
//   return new Promise((resolve, reject) => {
//     // Check if script already loaded
//     if (document.querySelector(`script[src="${src}"]`)) {
//       resolve();
//       return;
//     }

//     const script = document.createElement("script");
//     script.type = "module";
//     script.src = src;
//     script.onload = () => resolve();
//     script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
//     document.head.appendChild(script);
//   });
// }

export async function loadFreeType(): Promise<FreeTypeInstance> {
  if (freetypeInstance) {
    return freetypeInstance;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      // Load FreeType from CDN (use @0 for latest v0.x)
      const cdnUrl = "https://cdn.jsdelivr.net/npm/freetype-wasm@0/dist/freetype.js";

      // Dynamic import from CDN
      const freetypeModule = await import(/* webpackIgnore: true */ cdnUrl);
      const FreeTypeInit = freetypeModule.default as FreeTypeInit;

      freetypeInstance = await FreeTypeInit();

      return freetypeInstance;
    } catch (error) {
      loadingPromise = null;
      throw error;
    }
  })();

  return loadingPromise;
}

export function getFreeType(): FreeTypeInstance | null {
  return freetypeInstance;
}
