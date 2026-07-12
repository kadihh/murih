import { formatFileSize, isPdfFile, isOversized, createObjectUrl, revokeObjectUrl } from './utils'
import { loadPdf, convertPdf, type ProcessCallbacks } from './pdf-processor'

const DOM = {
  dropZone: () => document.getElementById('drop-zone')!,
  fileInput: () => document.getElementById('file-input') as HTMLInputElement,
  controls: () => document.getElementById('controls')!,
  fileName: () => document.getElementById('file-name')!,
  fileSize: () => document.getElementById('file-size')!,
  scaleSelect: () => document.getElementById('scale-select') as HTMLSelectElement,
  convertBtn: () => document.getElementById('convert-btn') as HTMLButtonElement,
  progress: () => document.getElementById('progress')!,
  progressText: () => document.getElementById('progress-text')!,
  progressPages: () => document.getElementById('progress-pages')!,
  progressBar: () => document.getElementById('progress-bar')!,
  downloadSection: () => document.getElementById('download-section')!,
  downloadLink: () => document.getElementById('download-link') as HTMLAnchorElement,
  downloadFilesize: () => document.getElementById('download-filesize')!,
  error: () => document.getElementById('error')!,
  errorMessage: () => document.getElementById('error-message')!,
  errorDismiss: () => document.getElementById('error-dismiss')!,
}

let currentFile: File | null = null
let currentObjectUrl: string | null = null
let downloadCleanup: AbortController | null = null

export function initUI(): void {
  setupDragDrop()
  setupFileInput()
  setupConvertButton()
  setupErrorDismiss()
}

function setupDragDrop(): void {
  const zone = DOM.dropZone()

  zone.addEventListener('dragover', (e) => {
    e.preventDefault()
    zone.classList.add('drag-over')
  })

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over')
  })

  zone.addEventListener('drop', (e) => {
    e.preventDefault()
    zone.classList.remove('drag-over')
    const file = e.dataTransfer?.files[0]
    if (file) handleFile(file)
  })
}

function setupFileInput(): void {
  DOM.fileInput().addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) handleFile(file)
  })
}

function setupConvertButton(): void {
  DOM.convertBtn().addEventListener('click', () => {
    if (currentFile) startConversion(currentFile)
  })
}

function setupErrorDismiss(): void {
  DOM.errorDismiss().addEventListener('click', () => {
    DOM.error().classList.add('hidden')
  })
}

function handleFile(file: File): void {
  hideError()
  DOM.downloadSection().classList.add('hidden')

  if (currentObjectUrl) {
    revokeObjectUrl(currentObjectUrl)
    currentObjectUrl = null
  }

  if (!isPdfFile(file)) {
    showError('Please select a valid PDF file.')
    return
  }

  if (isOversized(file)) {
    showError('File is too large. Maximum size is 100 MB.')
    return
  }

  currentFile = file
  DOM.fileName().textContent = file.name
  DOM.fileSize().textContent = formatFileSize(file.size)
  DOM.controls().classList.remove('hidden')
  DOM.progress().classList.add('hidden')
  if (window.innerWidth < 768) {
    DOM.scaleSelect().value = '2'
  }
}

async function startConversion(file: File): Promise<void> {
  const scale = parseFloat(DOM.scaleSelect().value)

  DOM.convertBtn().disabled = true
  DOM.progress().classList.remove('hidden')
  DOM.downloadSection().classList.add('hidden')
  DOM.error().classList.add('hidden')

  if (currentObjectUrl) {
    revokeObjectUrl(currentObjectUrl)
    currentObjectUrl = null
  }

  const callbacks: ProcessCallbacks = {
    onProgress(current, total) {
      DOM.progressPages().textContent = `${current} / ${total}`
      DOM.progressBar().style.width = `${(current / total) * 100}%`
    },
    onError(message) {
      showError(message)
    },
  }

  try {
    DOM.progressText().textContent = 'Loading PDF...'
    DOM.progressBar().style.width = '0%'
    DOM.progressPages().textContent = ''
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await loadPdf(arrayBuffer)

    DOM.progressText().textContent = 'Converting...'

    const blob = await convertPdf(pdf, scale, callbacks)

    DOM.progressText().textContent = 'Done!'
    DOM.progressBar().style.width = '100%'
    DOM.progressPages().textContent = ''

    showDownload(blob, file.name)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Conversion failed'
    showError(msg)
  } finally {
    DOM.convertBtn().disabled = false
    DOM.progress().classList.add('hidden')
  }
}

function showDownload(blob: Blob, originalName: string): void {
  const url = createObjectUrl(blob)
  currentObjectUrl = url

  const filename = originalName.replace(/\.pdf$/i, '') + '_inverted.pdf'
  const link = DOM.downloadLink()
  link.href = url
  link.download = filename

  DOM.downloadFilesize().textContent = formatFileSize(blob.size)
  DOM.downloadSection().classList.remove('hidden')
  DOM.progress().classList.add('hidden')

  link.focus({ preventScroll: true })

  requestAnimationFrame(() => link.click())

  downloadCleanup?.abort()
  downloadCleanup = new AbortController()

  link.addEventListener('click', () => {
    setTimeout(() => {
      if (currentObjectUrl === url) {
        revokeObjectUrl(url)
        currentObjectUrl = null
      }
    }, 30000)
  }, { once: true, signal: downloadCleanup.signal })
}

function showError(message: string): void {
  DOM.errorMessage().textContent = message
  DOM.error().classList.remove('hidden')
}

function hideError(): void {
  DOM.error().classList.add('hidden')
}
