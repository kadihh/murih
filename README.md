# Murih

PDF Color Inverter — converts PDF backgrounds to black and text to white for comfortable reading on phones and in dark environments. Runs entirely in your browser. No server, no uploads, no data leaves your device.

## Features

- **Full color inversion** — every pixel gets its RGB complement: white becomes black, black becomes white
- **100% client-side** — no file uploads, no server processing, complete privacy
- **Drag & drop** — drop a PDF or click to browse
- **Configurable quality** — 1.5x to 4x render scale (default 3x for sharp phone reading)
- **Responsive** — works on mobile, tablet, and desktop
- **Dark-themed UI** — matches the purpose of the tool
- **Size warnings** — alerts when output will be large
- **Progress tracking** — per-page progress bar during conversion

## How to Run

```sh
npm install        # install dependencies
npm run dev        # start dev server (http://localhost:5173)
npm run build      # production build to dist/
npm run preview    # preview production build locally
```

## How It Works

### The Pipeline

```
PDF file (local)
  → pdfjs-dist loads the PDF document from an ArrayBuffer
  → Each page is rendered to an offscreen <canvas> at the chosen scale
  → canvas.getImageData() reads every pixel as RGBA values
  → invertImageData() flips each pixel: output = 255 - input
  → pdf-lib creates a new PDFDocument
  → Each inverted canvas is encoded as PNG and embedded into the new PDF
  → The result is offered as a browser download
```

### Why Image-Based Output?

The output PDF contains rasterized images of each page (not vector text). This means:

- **Text is not selectable or searchable** in the output
- **Works on every PDF type** — scanned documents, image-heavy PDFs, complex layouts
- **Reliable** — no need to parse PDF color operators or handle different color spaces

### The Math

Color inversion is a single arithmetic operation per pixel:

```
R' = 255 - R
G' = 255 - G
B' = 255 - B
```

Alpha channel is preserved unchanged.

## Tech Stack

| Library | Version | Purpose | License |
|---------|---------|---------|---------|
| [Vite](https://vite.dev/) | ^6.4.3 | Dev server + bundler | MIT |
| [TypeScript](https://www.typescriptlang.org/) | ^5.9.3 | Type-safe JavaScript | Apache-2.0 |
| [Tailwind CSS](https://tailwindcss.com/) | ^4.3.2 | Utility-first CSS | MIT |
| [pdfjs-dist](https://mozilla.github.io/pdf.js/) | ^4.10.38 | PDF rendering to canvas | Apache-2.0 |
| [pdf-lib](https://pdf-lib.js.org/) | ^1.17.1 | PDF creation from images | Apache-2.0 |

## File Structure

```
murih/
├── AGENTS.md             Agent instructions for AI coding assistants
├── README.md             This file
├── .gitignore            Git ignore rules
├── package.json          Project config and dependencies
├── tsconfig.json         TypeScript configuration (strict mode)
├── vite.config.ts        Vite config with Tailwind plugin
├── index.html            Main HTML shell with responsive layout
├── public/
│   └── favicon.svg       App icon
└── src/
    ├── main.ts           Entry point — imports CSS, initializes UI
    ├── style.css          Tailwind imports + interaction styles
    ├── pdf-processor.ts   Worker orchestrator: spawns convert.worker.ts
    ├── convert.worker.ts  Web Worker: render PDF, invert pixels, build output PDF
    ├── ui.ts              All DOM interactions and event handling
    ├── utils.ts           Pure helper functions (no side effects)
    ├── i18n.ts            Internationalization logic (Arabic/English)
    └── translations.ts    Translation strings
```

---

## Code Explained

### `src/main.ts` — Entry Point

The simplest file. Two lines of logic:

```ts
import './style.css'
import { initUI } from './ui'
initUI()
```

- Imports `style.css` so Vite processes it (Tailwind generates utilities from it)
- Calls `initUI()` which wires up all DOM event listeners
- No logic, no state — just bootstrapping

---

### `src/utils.ts` — Pure Helper Functions

Every function here is pure (no side effects, no DOM access, no async). They exist to keep business logic out of the UI and processing layers.

#### `formatFileSize(bytes: number): string`

Converts byte counts to human-readable strings: `1023` → `"1023 B"`, `1536` → `"1.5 KB"`, `5242880` → `"5.0 MB"`.

#### `isPdfFile(file: File): boolean`

Double-checks the file is a PDF: checks the MIME type (`application/pdf`) OR the file extension (`.pdf`). The extension check catches cases where the OS sets a wrong MIME type.

#### `isOversized(file: File): boolean`

Returns `true` if file exceeds 100 MB. Prevents memory exhaustion — at 3x scale, a 100MB PDF could produce several GB of pixel data in memory.

#### `estimateOutputSize(inputBytes: number, scale: number): number`

Rough heuristic for the size warning:

```ts
const scaleFactor = (scale / 1.5) ** 2
return inputBytes * 0.6 * scaleFactor
```

The `0.6` factor accounts for PDF compression. The `scaleFactor` is quadratic because area scales with the square of linear scale. At 3x (default), the multiplier is `0.6 * (3/1.5)² = 2.4x` the input size.

#### `createObjectUrl(blob: Blob): string` / `revokeObjectUrl(url: string): void`

Thin wrappers around `URL.createObjectURL()` and `URL.revokeObjectURL()`. Centralized here so the rest of the codebase never touches the URL API directly.

---

### `src/pdf-processor.ts` — PDF Rendering + Inversion

This file handles the pdfjs-dist side: loading a PDF, rendering pages to canvas, and inverting pixels.

#### Worker Configuration (lines 5-8)

```ts
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()
```

pdfjs-dist uses a Web Worker for PDF parsing. Vite resolves `new URL(..., import.meta.url)` to the correct bundled path at build time. In dev it points to `node_modules/...`, in production it points to `dist/assets/...`.

#### `ProcessedPage` Interface

```ts
interface ProcessedPage {
  imageData: ImageData   // The inverted pixel data
  width: number          // Canvas width in pixels
  height: number         // Canvas height in pixels
}
```

Returned by `processPage()`. Consumed by `exportPdf()` to create the output PDF pages.

#### `ProcessCallbacks` Interface

```ts
interface ProcessCallbacks {
  onProgress: (current: number, total: number) => void
  onError: (message: string) => void
}
```

The UI passes these callbacks to get real-time updates. `onProgress` fires after each page succeeds. `onError` fires if a page fails to render (corrupt page, out of memory, etc.) — processing continues to the next page.

#### `loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy>`

Wraps `pdfjsLib.getDocument()`. Converts the ArrayBuffer to a Uint8Array (pdfjs requirement) and returns the parsed PDF document.

#### `processPage(page, scale): Promise<ProcessedPage>`

Renders a single PDF page:

1. `page.getViewport({ scale })` — calculates the output dimensions at the given scale
2. Creates an offscreen `<canvas>` sized to the viewport
3. `canvas.getContext('2d', { willReadFrequently: true })` — the `willReadFrequently` hint tells the browser to optimize for `getImageData()` calls (backs the canvas with CPU memory instead of GPU)
4. `page.render({ canvasContext, viewport }).promise` — pdfjs renders the page onto the canvas
5. `ctx.getImageData(...)` — reads all pixel data as an `ImageData` object
6. `invertImageData(imageData)` — flips every pixel in-place
7. `page.cleanup()` — frees pdfjs internal resources for this page (the pixel data is already extracted)
8. Returns the inverted `ImageData` with dimensions

#### `processAllPages(pdf, scale, callbacks): Promise<ProcessedPage[]>`

Iterates all pages sequentially:

```ts
for (let i = 1; i <= total; i++) {
  try {
    const page = await pdf.getPage(i)
    const processed = await processPage(page, scale)
    pages.push(processed)
    callbacks.onProgress(i, total)
  } catch (err) {
    callbacks.onError(`Page ${i}: ${msg}`)
  }
}
```

- Sequential (not parallel) to avoid memory spikes — each page's canvas is GC'd before the next
- Each page is wrapped in try/catch — a single bad page doesn't kill the whole conversion
- `onProgress` fires after each successful page so the UI can update the progress bar
- `onError` fires for failed pages — the error message includes the page number
- Returns only successfully processed pages (failed pages are skipped)

---

### `src/convert.worker.ts` — Web Worker

Runs in a separate thread. Handles the heavy lifting: PDF rendering, pixel inversion, and output PDF building.

#### `invertImageData(data: Uint8ClampedArray): void`

The core algorithm. Mutates the pixel buffer in-place for zero allocation:

```ts
for (let i = 0; i < data.length; i += 4) {
  data[i]     = 255 - data[i]      // R
  data[i + 1] = 255 - data[i + 1]  // G
  data[i + 2] = 255 - data[i + 2]  // B
  // data[i + 3] alpha is untouched
}
```

Steps by 4 because each pixel is 4 bytes (R, G, B, A). Alpha is preserved — transparent pixels stay transparent.

#### `isPageDark(ctx, w, h): boolean`

Samples 16 edge/border points to detect pages with dark backgrounds. If the average luminance is below 128, the page is considered dark and skipped during inversion (it's already readable in dark mode).

#### `convert(data, scale): Promise<Blob>`

The main conversion pipeline:

1. Load the PDF with pdfjs-dist
2. Create a new pdf-lib document
3. For each page: render to canvas → check if dark → invert if needed → encode as JPEG → embed in output PDF
4. Post progress messages back to the main thread
5. Return the final PDF as a Blob

#### Message Protocol

The worker communicates via `postMessage`:

| Message | Direction | Payload |
|---------|-----------|---------|
| `{ type: 'progress', current, total }` | Worker → Main | Page progress update |
| `{ type: 'done', blob }` | Worker → Main | Conversion complete |
| `{ type: 'error', message }` | Worker → Main | Conversion failed |
| `{ data, scale }` | Main → Worker | Start conversion (ArrayBuffer transferred) |

---

### `src/ui.ts` — UI Controller

The largest file. Manages all DOM interactions, state, and the conversion flow.

#### DOM Helper (lines 5-26)

```ts
const DOM = {
  dropZone: () => document.getElementById('drop-zone')!,
  // ... 15 more accessors
}
```

Lazy-accessor pattern: each call to `DOM.foo()` does a fresh `getElementById`. This avoids storing stale references if the DOM changes. The `!` non-null assertion is safe because all IDs exist in `index.html`.

#### Module-Level State (lines 27-30)

```ts
let currentFile: File | null = null
let currentObjectUrl: string | null = null
let downloadCleanup: AbortController | null = null
let wakeLock: WakeLockSentinel | null = null
```

- `currentFile` — the selected PDF, kept so the convert button can access it
- `currentObjectUrl` — the blob URL of the last conversion, revoked on re-conversion or new file
- `downloadCleanup` — AbortController that cleans up the download click listener between conversions (prevents listener accumulation)
- `wakeLock` — keeps the screen awake during conversion (released when done)

#### `initUI()`

Called once from `main.ts`. Wires up six event listeners:

| Handler | Event | Element | What it does |
|---------|-------|---------|-------------|
| `setupDragDrop` | dragover/dragleave/drop | drop-zone | Visual feedback + file extraction |
| `setupFileInput` | change | file-input | File selection via native picker |
| `setupConvertButton` | click | convert-btn | Starts conversion |
| `setupErrorDismiss` | click | error-dismiss | Hides error banner |
| `setupLanguageToggle` | click | lang-toggle | Switches Arabic/English |
| `setupScaleWarning` | change | scale-select | Shows warning on 4x for mobile |

#### `handleFile(file: File)`

Called when a file is selected (via drop or picker):

1. Hides any previous error and download section
2. Revokes any existing object URL (frees the old blob)
3. Validates: is it a PDF? Is it under 100MB?
4. If valid: stores `currentFile`, shows the controls section (file name, quality selector, convert button)
5. On mobile, defaults scale to 2x for better performance

#### `updateSizeWarning()`

Reads the current scale from the dropdown, calls `estimateOutputSize()`, and toggles the warning if estimated output exceeds 50MB.

#### `startConversion(file: File)` — The Main Flow

This is the heart of the app. The async flow:

```
1.  Disable convert button, show progress section, hide download/error
2.  Revoke any old object URL
3.  Acquire wake lock (keeps screen on during conversion)
4.  Set progress text to "Converting..."
5.  Read file as ArrayBuffer
6.  convertPdf() → spawns Web Worker that renders + inverts + builds PDF
7.  Worker posts progress messages → progress bar fills
8.  Set progress text to "Done!", bar to 100%
9.  showDownload() → show download section, hide progress, attempt auto-click
10. finally → re-enable convert button, hide progress, release wake lock
```

The `finally` block ensures the progress section is always hidden and the button is always re-enabled, regardless of success or error.

#### `showDownload(blob, originalName)`

Handles post-conversion UI:

1. Creates an object URL from the blob
2. Sets the download link's `href` and `download` attributes
3. Shows the download section, hides progress
4. Focuses the download link (accessibility)
5. Attempts `requestAnimationFrame(() => link.click())` for auto-download (may be blocked by browser)
6. Adds a `{ once: true }` click listener on the download link (with AbortController cleanup):
   - Schedules object URL revocation after 30 seconds (gives browser time to finish downloading)

The `downloadCleanup` AbortController prevents listener accumulation if the user converts multiple files — each new conversion aborts the previous listener.

#### `showError(message)` / `hideError()`

Toggles the error section. `showError` sets the message text and removes the `hidden` class. `hideError` adds it back.

---

### `index.html` — HTML Shell

Semantic structure:

```
<body>
  <header>    — Language toggle + app name
  <main>      — All interactive sections (stacked vertically)
    drop-zone    — File input (drag & drop + click)
    controls     — File info, quality selector, convert button
    progress     — Progress bar (hidden until conversion starts)
    download     — Download button (hidden until conversion completes)
    error        — Error banner (hidden by default)
</body>
```

**CSP header** (line 6):
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:
```

- `script-src 'self'` — only same-origin scripts (no CDN, no eval)
- `style-src 'self' 'unsafe-inline'` — Tailwind generates inline styles for the progress bar width
- `img-src 'self' blob: data:` — canvas operations may produce blob/data URLs
- No `connect-src` — the app makes zero network requests

---

### `src/style.css` — Custom Styles

Minimal — Tailwind handles everything except:

- **`body`** — font smoothing for crisp text
- **`#drop-zone.drag-over`** — green border + subtle background when dragging a file over the drop zone
- **`#drop-zone.drag-over svg`** — scales the upload icon up slightly with a transition
- **`#download-link:focus`** — green outline for keyboard navigation
- **`#download-link:focus:not(:focus-visible)`** — removes outline on mouse click (only shows on keyboard Tab)

---

### `vite.config.ts`

```ts
export default defineConfig({
  plugins: [tailwindcss()],
  build: { target: 'es2022' },
})
```

- Tailwind CSS v4 uses a Vite plugin (not PostCSS)
- Build target is ES2022 for modern browser features (top-level await, etc.)

### `tsconfig.json`

Strict mode with all safety flags:
- `strict: true` — full type checking
- `noUnusedLocals: true` — errors on unused variables
- `noUnusedParameters: true` — errors on unused function parameters
- `noFallthroughCasesInSwitch: true` — errors on missing break statements
- `target: ES2022` — matches Vite build target

---

## Security

- **No server** — all processing happens in the browser
- **No uploads** — files never leave your device
- **CSP headers** — Content Security Policy restricts script/style/img sources
- **No innerHTML/eval** — only `textContent` for user-facing strings
- **Canvas safety** — only local file data loaded onto canvas (no CORS issues)
- **Memory cleanup** — object URLs revoked after download, pdfjs pages cleaned up after rendering

## Quality Settings

| Scale | Effective DPI | Use Case | Relative File Size |
|-------|--------------|----------|-------------------|
| 1.5x | ~108 DPI | Smallest files, acceptable on phones | 1x |
| 2x | ~144 DPI | Balanced quality and size | 1.8x |
| 3x | ~216 DPI | Sharp text on phones (default) | 4x |
| 4x | ~288 DPI | Maximum quality, large files | 7x |

## Browser Support

Works in all modern browsers with Canvas and ES2022 support:

- Chrome 90+
- Firefox 90+
- Safari 15+
- Edge 90+

## License

This project uses dependencies licensed under Apache-2.0 and MIT. Check individual dependency licenses for details.
