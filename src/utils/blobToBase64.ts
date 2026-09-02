export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Unable to convert audio to base64'))
        return
      }

      const base64 = reader.result.split(',')[1]
      if (!base64) {
        reject(new Error('Unable to extract base64 audio'))
        return
      }

      resolve(base64)
    }

    reader.onerror = () => {
      reject(reader.error ?? new Error('FileReader failed'))
    }

    reader.readAsDataURL(blob)
  })
}
