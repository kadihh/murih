import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href

const GAMMA = 0.78

function invertImageData(data: Uint8ClampedArray): void {
  const lut = new Uint8Array(256)
  for (let v = 0; v < 256; v++) {
    lut[v] = Math.round(255 * Math.pow((255 - v) / 255, GAMMA))
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]]
    data[i + 1] = lut[data[i + 1]]
    data[i + 2] = lut[data[i + 2]]
  }
}

function isPageDark(
  ctx: OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
): boolean {
  const points: [number, number][] = []

  // 4 corners
  points.push([0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1])

  // 4 edge midpoints
  points.push([Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1])
  points.push([0, Math.floor(h / 2)], [w - 1, Math.floor(h / 2)])

  // 8 more points: 2 per edge, evenly spaced
  const stepX = Math.floor(w / 3)
  const stepY = Math.floor(h / 3)
  points.push([stepX, 0], [w - 1 - stepX, 0])          // top edge
  points.push([stepX, h - 1], [w - 1 - stepX, h - 1])  // bottom edge
  points.push([0, stepY], [0, h - 1 - stepY])           // left edge
  points.push([w - 1, stepY], [w - 1, h - 1 - stepY])  // right edge

  let totalLuminance = 0
  let sampled = 0

  for (const [x, y] of points) {
    const pixel = ctx.getImageData(x, y, 1, 1).data
    // skip fully transparent pixels
    if (pixel[3] === 0) continue
    // perceptual luminance
    totalLuminance += 0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2]
    sampled++
  }

  if (sampled === 0) return false

  return totalLuminance / sampled < 128
}

async function convert(data: ArrayBuffer, scale: number): Promise<Blob> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise
  const pdfDoc = await PDFDocument.create()
  const total = pdf.numPages

  if (total === 0) {
    throw new Error('PDF has no pages.')
  }

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })

    const canvas = new OffscreenCanvas(viewport.width, viewport.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('OffscreenCanvas context not available')

    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise
    page.cleanup()

    if (!isPageDark(ctx, canvas.width, canvas.height)) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      invertImageData(imageData.data)
      ctx.putImageData(imageData, 0, 0)
    }

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
