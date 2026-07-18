// 影像切片引擎：把位图转换成竖直平面、逐层向上生长的体素打印任务
// 图像平面立于热床中央（面向 +z 观察者），明暗决定每格向观察者凸出的深度

export interface PrintJob {
  name: string
  resolution: number // 网格 N x N
  layers: number // 实际层数（= 竖直方向的像素行数 N）
  totalVoxels: number
  px: Float32Array // 每个体素中心的世界坐标
  py: Float32Array
  pz: Float32Array
  colors: Float32Array // 每个体素线性 RGB
  voxelSize: number
  layerHeight: number
  bedSize: number
  bedTopY: number
  planeHeight: number
  filamentMm: number
  estSeconds: number // speed = 1 时的预估时长
}

export interface SliceOptions {
  resolution: number
  maxDepth: number // 最大凸出深度（世界单位）
  invert: boolean // true = 亮部凸起，false = 暗部凸起（浮雕默认）
  bedSize: number
  bedTopY: number
  planeHeight: number
}

const MAX_VOXELS = 170_000
const BASE_VPS = 240 // speed=1 时每秒沉积体素数

export function sliceImage(img: HTMLImageElement, opts: SliceOptions): PrintJob {
  const { resolution: N, invert, bedSize, bedTopY, planeHeight, maxDepth } = opts

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

  const cell = planeHeight / N
  // 深度层数：受最大深度与体素预算双重约束
  const depthCells = Math.max(
    4,
    Math.min(Math.round(maxDepth / cell), Math.floor(MAX_VOXELS / (N * N))),
  )

  // 每格深度（1..depthCells）
  const depths = new Uint8Array(N * N)
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
        depths[i] = 0
        continue
      }
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      let h = invert ? lum : 1 - lum
      h = Math.pow(h, 1.3)
      depths[i] = Math.max(1, Math.round(h * depthCells))
    }
  }

  // 生成沉积顺序：从下往上逐行（打印层），行内蛇形，每格从背板向观察者逐格凸出
  let total = 0
  for (let i = 0; i < depths.length; i++) total += depths[i]

  const px = new Float32Array(total)
  const py = new Float32Array(total)
  const pz = new Float32Array(total)
  const colors = new Float32Array(total * 3)

  const zBack = (-depthCells * cell) / 2

  let k = 0
  for (let row = 0; row < N; row++) {
    const yImg = N - 1 - row // 图像底部先打印
    const xStart = row % 2 === 0 ? 0 : N - 1
    const xEnd = row % 2 === 0 ? N : -1
    const xStep = row % 2 === 0 ? 1 : -1
    for (let x = xStart; x !== xEnd; x += xStep) {
      const i = yImg * N + x
      const d = depths[i]
      if (d === 0) continue
      for (let z = 0; z < d; z++) {
        px[k] = (x + 0.5) * cell - planeHeight / 2
        py[k] = bedTopY + (row + 0.5) * cell
        pz[k] = zBack + (z + 0.5) * cell
        // 越靠外（新沉积的面）微微提亮
        const boost = 1 + (z / depthCells) * 0.14
        colors[k * 3] = Math.min(1, (cellR[i] / 255) * boost)
        colors[k * 3 + 1] = Math.min(1, (cellG[i] / 255) * boost)
        colors[k * 3 + 2] = Math.min(1, (cellB[i] / 255) * boost)
        k++
      }
    }
  }

  // 折算 1.75mm 耗材用量
  const voxelVol = cell * cell * cell
  const filamentMm = (total * voxelVol) / (Math.PI * 0.875 * 0.875)

  return {
    name: '',
    resolution: N,
    layers: N,
    totalVoxels: total,
    px,
    py,
    pz,
    colors,
    voxelSize: cell,
    layerHeight: cell,
    bedSize,
    bedTopY,
    planeHeight,
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
