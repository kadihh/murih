import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { invertImageData } from './utils'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export interface ProcessedPage {
  imageData: ImageData
  width: number
  height: number
}

export interface ProcessCallbacks {
  onProgress: (current: number, total: number) => void
  onError: (message: string) => void
}

export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise
}

export async function processPage(
  page: PDFPageProxy,
  scale: number,
): Promise<ProcessedPage> {
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D context not available')

  await page.render({ canvasContext: ctx, viewport }).promise

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  invertImageData(imageData)

  page.cleanup()

  return {
    imageData,
    width: canvas.width,
    height: canvas.height,
  }
}

export async function processAllPages(
  pdf: PDFDocumentProxy,
  scale: number,
  callbacks: ProcessCallbacks,
): Promise<ProcessedPage[]> {
  const pages: ProcessedPage[] = []
  const total = pdf.numPages

  for (let i = 1; i <= total; i++) {
    try {
      const page = await pdf.getPage(i)
      const processed = await processPage(page, scale)
      pages.push(processed)
      callbacks.onProgress(i, total)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      callbacks.onError(`Page ${i}: ${msg}`)
    }
  }

  return pages
}
