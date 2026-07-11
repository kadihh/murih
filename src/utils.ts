const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

export function invertImageData(imageData: ImageData): void {
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i]
    data[i + 1] = 255 - data[i + 1]
    data[i + 2] = 255 - data[i + 2]
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function isOversized(file: File): boolean {
  return file.size > MAX_FILE_SIZE
}

export function estimateOutputSize(inputBytes: number, scale: number): number {
  const scaleFactor = (scale / 1.5) ** 2
  return inputBytes * 0.6 * scaleFactor
}

export function createObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

export function revokeObjectUrl(url: string): void {
  URL.revokeObjectURL(url)
}
