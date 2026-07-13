# AGENTS.md

## What This Is

Frontend-only PDF color inverter. Converts PDF backgrounds to black and text to white for comfortable phone reading. All processing runs locally in the browser — no server, no uploads.

## Tech Stack

- **Vite** — dev server + bundler (ESM-native, zero config)
- **TypeScript** — strict mode
- **Tailwind CSS v4** — utility-first styling
- **pdfjs-dist** (Apache-2.0) — renders PDF pages to `<canvas>` for pixel manipulation
- **pdf-lib** (Apache-2.0) — builds the output PDF from inverted canvas images

## Commands

```sh
npm install        # install deps
npm run dev        # start dev server (http://localhost:5173)
npm run build      # production build to dist/
npm run preview    # preview production build locally
```

There are no tests, no linter, and no CI configured. If you add them, document the commands here.

## Architecture

Two-library pipeline, both client-side:

1. **pdfjs-dist** renders each PDF page to an offscreen `<canvas>` at 3x scale
2. Canvas `getImageData()` → invert every pixel RGB: `(255 - r, 255 - g, 255 - b)`
3. **pdf-lib** embeds the inverted canvas as PNG images into a new PDF
4. Browser downloads the result via a user-clicked `<a download>` link (required for browser download permissions)

Output is image-based — text in the result PDF is **not selectable or searchable**. This is by design for reliability across all PDF types.

## File Structure

```
src/
  main.ts              Entry point — imports, wires UI
  style.css            Tailwind imports + drag-over styles
  pdf-processor.ts     Worker orchestrator: spawns convert.worker.ts
  convert.worker.ts    Web Worker: render PDF, invert pixels, build output PDF
  ui.ts                DOM events: drag-drop, progress, download button, errors
  utils.ts             Pure helpers: formatFileSize(), isPdfFile(), etc.
  i18n.ts              Internationalization logic (Arabic/English)
  translations.ts      Translation strings
```

## Key Gotchas

- **pdfjs-dist worker**: Must set `GlobalWorkerOptions.workerSrc` to the bundled worker file. In Vite, use `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`.
- **Canvas CORS**: Never load cross-origin resources onto the canvas or `getImageData()` will throw a SecurityError (tainted canvas). All PDF data comes from local file input, so this is safe by default.
- **Memory**: Revoke object URLs after download. Call `page.cleanup()` after rendering each PDF page with pdfjs-dist.
- **Browser downloads require a user gesture**: You cannot auto-download via `a.click()` after async work — the user gesture expires. Instead, show a download button the user clicks directly.
- **Scale**: Default render scale is 3.0 (~216 DPI effective). Higher = sharper text, bigger file. Configurable in UI.
- **File size warning**: Show a warning for PDFs over 50MB — large files at 3x scale produce very large output.
- **Both pdf-lib and pdfjs-dist are Apache-2.0 licensed** — safe to ship in open-source projects.
- **Dark page detection**: `isPageDark()` samples 16 edge/border points to detect pages with dark backgrounds. These pages are not inverted (they're already readable in dark mode).

## Design Principles

- Zero server dependencies. Everything runs in the browser.
- Clean, minimal code. No frameworks beyond what's listed above.
- Mobile-first responsive design.
- Professional dark-themed UI.
