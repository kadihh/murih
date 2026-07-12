import { formatFileSize, isPdfFile, isOversized, createObjectUrl, revokeObjectUrl } from './utils'
import { convertPdf, type ProcessCallbacks } from './pdf-processor'
import { initLang, toggleLanguage, t } from './i18n'

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
  langToggle: () => document.getElementById('lang-toggle')!,
}

let currentFile: File | null = null
let currentObjectUrl: string | null = null
let downloadCleanup: AbortController | null = null
let wakeLock: WakeLockSentinel | null = null

export function initUI(): void {
  initLang()
  setupDragDrop()
  setupFileInput()
  setupConvertButton()
  setupErrorDismiss()
  setupLanguageToggle()
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

function setupLanguageToggle(): void {
  DOM.langToggle().addEventListener('click', () => {
    toggleLanguage()
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
    showError(t('errorInvalidPdf'))
    return
  }

  if (isOversized(file)) {
    showError(t('errorTooLarge'))
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

  try {
    wakeLock = await navigator.wakeLock.request('screen')
  } catch {
    // Wake Lock not supported or denied — continue without it
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
    DOM.progressText().textContent = t('converting')
    DOM.progressBar().style.width = '0%'
    DOM.progressPages().textContent = ''
    const arrayBuffer = await file.arrayBuffer()

    const blob = await convertPdf(arrayBuffer, scale, callbacks)

    DOM.progressText().textContent = t('done')
    DOM.progressBar().style.width = '100%'
    DOM.progressPages().textContent = ''

    showDownload(blob, file.name)
  } catch (err) {
    const msg = err instanceof Error ? err.message : t('errorConversion')
    showError(msg)
  } finally {
    DOM.convertBtn().disabled = false
    DOM.progress().classList.add('hidden')
    if (wakeLock) {
      wakeLock.release()
      wakeLock = null
    }
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
