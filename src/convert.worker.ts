import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href

function invertImageData(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i]
    data[i + 1] = 255 - data[i + 1]
    data[i + 2] = 255 - data[i + 2]
  }
}

async function convert(data: ArrayBuffer, scale: number): Promise<Blob> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise
  const pdfDoc = await PDFDocument.create()
  const total = pdf.numPages

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })

    const canvas = new OffscreenCanvas(viewport.width, viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('OffscreenCanvas context not available')

    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise
    page.cleanup()

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    invertImageData(imageData.data)
    ctx.putImageData(imageData, 0, 0)

    const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 })
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer())
    const jpgImage = await pdfDoc.embedJpg(jpegBytes)

    const pdfPage = pdfDoc.addPage([viewport.width, viewport.height])
    pdfPage.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    })

    self.postMessage({ type: 'progress', current: i, total })
  }

  if (pdf.numPages === 0) {
    throw new Error('No pages could be processed.')
  }

  const pdfBytes = await pdfDoc.save()
  return new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' })
}

self.onmessage = async (e: MessageEvent) => {
  const { data, scale } = e.data as { data: ArrayBuffer; scale: number }

  try {
    const blob = await convert(data, scale)
    self.postMessage({ type: 'done', blob })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    self.postMessage({ type: 'error', message: msg })
  }
}
