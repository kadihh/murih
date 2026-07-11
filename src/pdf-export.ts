import { PDFDocument } from 'pdf-lib'
import type { ProcessedPage } from './pdf-processor'

export interface ExportCallbacks {
  onProgress: (current: number, total: number) => void
}

export async function exportPdf(
  pages: ProcessedPage[],
  callbacks?: ExportCallbacks,
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create()

  for (let i = 0; i < pages.length; i++) {
    const pngBytes = await imageDataToPngBytes(pages[i].imageData)
    const pngImage = await pdfDoc.embedPng(pngBytes)

    const pdfPage = pdfDoc.addPage([pages[i].width, pages[i].height])
    pdfPage.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pages[i].width,
      height: pages[i].height,
    })

    callbacks?.onProgress(i + 1, pages.length)
  }

  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes] as BlobPart[], { type: 'application/pdf' })
}

async function imageDataToPngBytes(imageData: ImageData): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context not available')

  ctx.putImageData(imageData, 0, 0)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('Failed to encode canvas to PNG'))
      },
      'image/png',
      1.0,
    )
  })

  return new Uint8Array(await blob.arrayBuffer())
}
