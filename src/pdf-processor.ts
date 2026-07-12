export interface ProcessCallbacks {
  onProgress: (current: number, total: number) => void
  onError: (message: string) => void
}

export async function convertPdf(
  data: ArrayBuffer,
  scale: number,
  callbacks: ProcessCallbacks,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./convert.worker.ts', import.meta.url),
      { type: 'module' },
    )

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data
      switch (msg.type) {
        case 'progress':
          callbacks.onProgress(msg.current, msg.total)
          break
        case 'done':
          worker.terminate()
          resolve(msg.blob)
          break
        case 'error':
          worker.terminate()
          reject(new Error(msg.message))
          break
      }
    }

    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'Worker failed'))
    }

    worker.postMessage({ data, scale }, [data])
  })
}
