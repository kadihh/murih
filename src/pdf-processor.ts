import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { invertImageData } from './utils'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const supportsCanvasFilter = (() => {
  try {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    if (!ctx) return false
    ctx.filter = 'invert(1)'
    return ctx.filter === 'invert(1)'
  } catch {
    return false
  }
})()

export interface ProcessCallbacks {
  onProgress: (current: number, total: number) => void
  onError: (message: string) => void
}

export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise
}

export async function convertPdf(
  pdf: PDFDocumentProxy,
  scale: number,
  callbacks: ProcessCallbacks,
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create()
  const total = pdf.numPages

  const renderCanvas = document.createElement('canvas')
  const renderCtx = supportsCanvasFilter
    ? renderCanvas.getContext('2d')
    : renderCanvas.getContext('2d', { willReadFrequently: true })
  if (!renderCtx) throw new Error('Canvas 2D context not available')

  let filterCanvas: HTMLCanvasElement | null = null
  let filterCtx: CanvasRenderingContext2D | null = null
  if (supportsCanvasFilter) {
    filterCanvas = document.createElement('canvas')
    filterCtx = filterCanvas.getContext('2d')
    if (!filterCtx) throw new Error('Canvas 2D context not available')
  }

  let processedCount = 0

  for (let i = 1; i <= total; i++) {
    try {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale })

      renderCanvas.width = viewport.width
      renderCanvas.height = viewport.height

      await page.render({ canvasContext: renderCtx, viewport }).promise
      page.cleanup()

      let encodeCanvas: HTMLCanvasElement
      if (filterCanvas && filterCtx) {
        filterCanvas.width = viewport.width
        filterCanvas.height = viewport.height
        filterCtx.filter = 'invert(1)'
        filterCtx.drawImage(renderCanvas, 0, 0)
        encodeCanvas = filterCanvas
      } else {
        const imageData = renderCtx.getImageData(
          0,
          0,
          renderCanvas.width,
          renderCanvas.height,
        )
        invertImageData(imageData)
        renderCtx.putImageData(imageData, 0, 0)
        encodeCanvas = renderCanvas
      }

      const jpegBlob = await new Promise<Blob>((resolve, reject) => {
        encodeCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('JPEG encoding failed'))),
          'image/jpeg',
          0.95,
        )
      })

      const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer())
      const jpgImage = await pdfDoc.embedJpg(jpegBytes)

      const pdfPage = pdfDoc.addPage([viewport.width, viewport.height])
      pdfPage.drawImage(jpgImage, {
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height,
      })

      processedCount++
      await new Promise<void>((r) => setTimeout(r, 0))
      callbacks.onProgress(i, total)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      callbacks.onError(`Page ${i}: ${msg}`)
    }
  }

  if (processedCount === 0) {
    throw new Error('No pages could be processed.')
  }

  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes] as BlobPart[], { type: 'application/pdf' })
}
