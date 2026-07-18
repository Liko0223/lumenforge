// 影像切片引擎：把位图转换成逐层沉积的体素打印任务

export interface PrintJob {
  name: string
  resolution: number // 网格 N x N
  layers: number // 实际层数
  totalVoxels: number
  px: Float32Array // 每个体素中心的世界坐标
  py: Float32Array
  pz: Float32Array
  colors: Float32Array // 每个体素线性 RGB
  voxelSize: number
  layerHeight: number
  bedSize: number
  bedTopY: number
  filamentMm: number
  estSeconds: number // speed = 1 时的预估时长
}

export interface SliceOptions {
  resolution: number
  maxLayers: number
  invert: boolean // true = 亮部凸起，false = 暗部凸起（浮雕默认）
  bedSize: number
  bedTopY: number
  modelHeight: number
}

const MAX_VOXELS = 170_000
const BASE_VPS = 240 // speed=1 时每秒沉积体素数

export function sliceImage(img: HTMLImageElement, opts: SliceOptions): PrintJob {
  const { resolution: N, invert, bedSize, bedTopY, modelHeight } = opts
  // 体素预算约束实际层数
  const layers = Math.max(8, Math.min(opts.maxLayers, Math.floor(MAX_VOXELS / (N * N))))

  const canvas = document.createElement('canvas')
  canvas.width = N
  canvas.height = N
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  // cover 裁剪为正方形
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const side = Math.min(iw, ih)
  const sx = (iw - side) / 2
  const sy = (ih - side) / 2
  ctx.drawImage(img, sx, sy, side, side, 0, 0, N, N)
  const data = ctx.getImageData(0, 0, N, N).data

  const cell = bedSize / N
  const layerHeight = modelHeight / layers

  // 每格层数
  const heights = new Uint8Array(N * N)
  const cellR = new Uint8Array(N * N)
  const cellG = new Uint8Array(N * N)
  const cellB = new Uint8Array(N * N)

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x
      const o = i * 4
      const r = data[o]
      const g = data[o + 1]
      const b = data[o + 2]
      const a = data[o + 3]
      cellR[i] = r
      cellG[i] = g
      cellB[i] = b
      if (a < 100) {
        heights[i] = 0
        continue
      }
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      let h = invert ? lum : 1 - lum
      h = Math.pow(h, 1.3)
      heights[i] = Math.max(1, Math.round(h * layers))
    }
  }

  // 生成沉积顺序：逐层、蛇形扫描
  let total = 0
  for (let i = 0; i < heights.length; i++) total += heights[i]

  const px = new Float32Array(total)
  const py = new Float32Array(total)
  const pz = new Float32Array(total)
  const colors = new Float32Array(total * 3)

  let k = 0
  for (let l = 0; l < layers; l++) {
    for (let y = 0; y < N; y++) {
      const xStart = y % 2 === 0 ? 0 : N - 1
      const xEnd = y % 2 === 0 ? N : -1
      const xStep = y % 2 === 0 ? 1 : -1
      for (let x = xStart; x !== xEnd; x += xStep) {
        const i = y * N + x
        if (heights[i] <= l) continue
        px[k] = (x + 0.5) * cell - bedSize / 2
        pz[k] = (y + 0.5) * cell - bedSize / 2
        py[k] = bedTopY + (l + 0.5) * layerHeight
        // 随层高微微提亮，模拟新鲜耗材的光泽
        const boost = 1 + (l / layers) * 0.12
        colors[k * 3] = Math.min(1, (cellR[i] / 255) * boost)
        colors[k * 3 + 1] = Math.min(1, (cellG[i] / 255) * boost)
        colors[k * 3 + 2] = Math.min(1, (cellB[i] / 255) * boost)
        k++
      }
    }
  }

  // 折算 1.75mm 耗材用量
  const voxelVol = cell * cell * layerHeight
  const filamentMm = (total * voxelVol) / (Math.PI * 0.875 * 0.875)

  return {
    name: '',
    resolution: N,
    layers,
    totalVoxels: total,
    px,
    py,
    pz,
    colors,
    voxelSize: cell,
    layerHeight,
    bedSize,
    bedTopY,
    filamentMm,
    estSeconds: total / BASE_VPS,
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
