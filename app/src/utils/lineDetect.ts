export interface DetectedLines {
  x: number[]
  y: number[]
}

function normalize(values: number[]) {
  const max = Math.max(...values, 1)
  return values.map((v) => v / max)
}

function pickPeaks(signal: number[], threshold = 0.35, minDistance = 24) {
  const peaks: number[] = []
  let lastPicked = -minDistance

  for (let i = 1; i < signal.length - 1; i += 1) {
    const v = signal[i]
    if (v < threshold) continue
    if (v >= signal[i - 1] && v >= signal[i + 1] && i - lastPicked >= minDistance) {
      peaks.push(i)
      lastPicked = i
    }
  }

  return peaks
}

function toGray(r: number, g: number, b: number) {
  return r * 0.299 + g * 0.587 + b * 0.114
}

export async function detectSplitLinesFromUrl(url: string): Promise<DetectedLines> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'))
    img.src = url
  })

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return { x: [], y: [] }

  ctx.drawImage(image, 0, 0)
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  const colScore = new Array(width).fill(0)
  const rowScore = new Array(height).fill(0)

  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const idx = (y * width + x) * 4
      const idxRight = (y * width + (x + 1)) * 4
      const idxDown = ((y + 1) * width + x) * 4

      const g = toGray(data[idx], data[idx + 1], data[idx + 2])
      const gRight = toGray(data[idxRight], data[idxRight + 1], data[idxRight + 2])
      const gDown = toGray(data[idxDown], data[idxDown + 1], data[idxDown + 2])

      colScore[x] += Math.abs(g - gRight)
      rowScore[y] += Math.abs(g - gDown)
    }
  }

  const normX = normalize(colScore)
  const normY = normalize(rowScore)

  return {
    x: pickPeaks(normX),
    y: pickPeaks(normY),
  }
}
