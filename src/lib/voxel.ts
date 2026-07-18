// 影像切片引擎：把位图转换成逐层向上生长的体素打印任务
// 三种成型模式：
//  - plate  平板浮雕：竖直平面，明暗决定单侧凸出深度
//  - mirror 双面镜像：浮雕向前后两侧对称凸出
//  - lathe  旋转成型：假设物体是旋转体，按轮廓半宽绕竖直轴扫掠 360°

export type FormMode = 'plate' | 'mirror' | 'lathe'

export interface PrintJob {
  name: string
  mode: FormMode
  resolution: number // 网格 N x N
  layers: number // 竖直方向的打印层数（= N）
  totalVoxels: number
  px: Float32Array // 每个体素中心的世界坐标
  py: Float32Array
  pz: Float32Array
  colors: Float32Array // 每个体素线性 RGB
  voxelSize: number
  voxelDepth: number
  layerHeight: number
  bedSize: number
  bedTopY: number
  planeHeight: number
  filamentMm: number
  estSeconds: number // speed = 1 时的预估时长
}

export interface SliceOptions {
  mode: FormMode
  resolution: number
  maxDepth: number // 单侧最大凸出深度（世界单位，lathe 模式忽略）
  invert: boolean // true = 亮部凸起，false = 暗部凸起（浮雕默认）
  bedSize: number
  bedTopY: number
  planeHeight: number
}

const MAX_VOXELS = 170_000
const BASE_VPS = 240 // speed=1 时每秒沉积体素数

/* 共享：把图片 cover 裁剪到 N×N 并读出像素 */
function extractPixels(img: HTMLImageElement, N: number) {
  const canvas = document.createElement('canvas')
  canvas.width = N
  canvas.height = N
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const side = Math.min(iw, ih)
  ctx.drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, 0, 0, N, N)
  const data = ctx.getImageData(0, 0, N, N).data
  const r = new Uint8Array(N * N)
  const g = new Uint8Array(N * N)
  const b = new Uint8Array(N * N)
  const a = new Uint8Array(N * N)
  for (let i = 0; i < N * N; i++) {
    r[i] = data[i * 4]
    g[i] = data[i * 4 + 1]
    b[i] = data[i * 4 + 2]
    a[i] = data[i * 4 + 3]
  }
  return { r, g, b, a }
}

interface Emit {
  px: number[]
  py: number[]
  pz: number[]
  colors: number[]
}

function pushVoxel(e: Emit, x: number, y: number, z: number, r: number, g: number, b: number, boost: number) {
  e.px.push(x)
  e.py.push(y)
  e.pz.push(z)
  e.colors.push(Math.min(1, (r / 255) * boost), Math.min(1, (g / 255) * boost), Math.min(1, (b / 255) * boost))
}

function finalize(e: Emit, opts: SliceOptions, N: number, cell: number, voxelDepth = cell): PrintJob {
  const total = e.px.length
  const voxelVol = cell * cell * voxelDepth
  return {
    name: '',
    mode: opts.mode,
    resolution: N,
    layers: N,
    totalVoxels: total,
    px: new Float32Array(e.px),
    py: new Float32Array(e.py),
    pz: new Float32Array(e.pz),
    colors: new Float32Array(e.colors),
    voxelSize: cell,
    voxelDepth,
    layerHeight: cell,
    bedSize: opts.bedSize,
    bedTopY: opts.bedTopY,
    planeHeight: opts.planeHeight,
    filamentMm: (total * voxelVol * 1e6) / (Math.PI * 0.875 * 0.875), // 1 世界单位 = 100mm，体积 ×1e6
    estSeconds: total / BASE_VPS,
  }
}

/* 明暗 → 深度等级（1..depthCells） */
function depthField(P: ReturnType<typeof extractPixels>, N: number, invert: boolean, depthCells: number) {
  const depths = new Uint8Array(N * N)
  for (let i = 0; i < N * N; i++) {
    if (P.a[i] < 100) {
      depths[i] = 0
      continue
    }
    const lum = (0.2126 * P.r[i] + 0.7152 * P.g[i] + 0.0722 * P.b[i]) / 255
    let h = invert ? lum : 1 - lum
    h = Math.pow(h, 1.3)
    depths[i] = Math.max(1, Math.round(h * depthCells))
  }
  return depths
}

/* ---- plate：平板浮雕 ---- */
function buildPlate(P: ReturnType<typeof extractPixels>, opts: SliceOptions): PrintJob {
  const N = opts.resolution
  const cell = opts.planeHeight / N
  const depthCells = Math.max(4, Math.min(Math.round(opts.maxDepth / cell), Math.floor(MAX_VOXELS / (N * N))))
  // 预算不足时减少 Z 轴采样层数，但拉伸每层厚度，保持设定的物理深度不变。
  const depthStep = opts.maxDepth / depthCells
  const depths = depthField(P, N, opts.invert, depthCells)
  const zBack = -opts.maxDepth / 2
  const e: Emit = { px: [], py: [], pz: [], colors: [] }

  for (let row = 0; row < N; row++) {
    const yImg = N - 1 - row
    const fwd = row % 2 === 0
    for (let xi = 0; xi < N; xi++) {
      const x = fwd ? xi : N - 1 - xi
      const i = yImg * N + x
      const d = depths[i]
      if (d === 0) continue
      for (let z = 0; z < d; z++) {
        pushVoxel(
          e,
          (x + 0.5) * cell - opts.planeHeight / 2,
          opts.bedTopY + (row + 0.5) * cell,
          zBack + (z + 0.5) * depthStep,
          P.r[i], P.g[i], P.b[i],
          1 + (z / depthCells) * 0.14,
        )
      }
    }
  }
  return finalize(e, opts, N, cell, depthStep)
}

/* ---- mirror：双面镜像浮雕 ---- */
function buildMirror(P: ReturnType<typeof extractPixels>, opts: SliceOptions): PrintJob {
  const N = opts.resolution
  const cell = opts.planeHeight / N
  const depthCells = Math.max(3, Math.min(Math.round(opts.maxDepth / cell), Math.floor(MAX_VOXELS / (2 * N * N))))
  const depthStep = opts.maxDepth / Math.max(1, depthCells - 0.5)
  const depths = depthField(P, N, opts.invert, depthCells)
  const e: Emit = { px: [], py: [], pz: [], colors: [] }

  for (let row = 0; row < N; row++) {
    const yImg = N - 1 - row
    const fwd = row % 2 === 0
    for (let xi = 0; xi < N; xi++) {
      const x = fwd ? xi : N - 1 - xi
      const i = yImg * N + x
      const d = depths[i]
      if (d === 0) continue
      // 以中心面为轴，前后对称沉积（-d+1 .. d-1）
      for (let z = -(d - 1); z <= d - 1; z++) {
        pushVoxel(
          e,
          (x + 0.5) * cell - opts.planeHeight / 2,
          opts.bedTopY + (row + 0.5) * cell,
          z * depthStep,
          P.r[i], P.g[i], P.b[i],
          1 + (Math.abs(z) / depthCells) * 0.12,
        )
      }
    }
  }
  return finalize(e, opts, N, cell, depthStep)
}

/* ---- lathe：旋转成型（轮廓半宽绕竖直轴扫掠） ---- */
function buildLathe(P: ReturnType<typeof extractPixels>, opts: SliceOptions): PrintJob {
  const N = opts.resolution
  const cell = opts.planeHeight / N
  const cx = (N - 1) / 2

  // 背景色：取四角 4×4 均值
  let br = 0, bg = 0, bb = 0, bn = 0
  for (const [cy0, cx0] of [[0, 0], [0, N - 4], [N - 4, 0], [N - 4, N - 4]] as const) {
    for (let y = cy0; y < cy0 + 4; y++) {
      for (let x = cx0; x < cx0 + 4; x++) {
        const i = y * N + x
        br += P.r[i]; bg += P.g[i]; bb += P.b[i]; bn++
      }
    }
  }
  br /= bn; bg /= bn; bb /= bn

  // 每行轮廓半宽（单位：格）
  const BG_DIST = 30
  const radius = new Float32Array(N)
  for (let y = 0; y < N; y++) {
    let rMax = 0
    for (let x = 0; x < N; x++) {
      const i = y * N + x
      if (P.a[i] < 100) continue
      const dist = Math.hypot(P.r[i] - br, P.g[i] - bg, P.b[i] - bb)
      if (dist > BG_DIST) rMax = Math.max(rMax, Math.abs(x - cx))
    }
    radius[y] = rMax
  }

  // 第一遍估算体素量，超预算则收紧角向密度
  let est = 0
  for (let y = 0; y < N; y++) {
    const rMax = Math.floor(radius[y])
    for (let r = 1; r <= rMax; r++) est += Math.max(8, Math.round(2 * Math.PI * r))
    if (rMax >= 0 && radius[y] > 0) est += 1
  }
  const density = Math.min(1, MAX_VOXELS / Math.max(1, est))

  const e: Emit = { px: [], py: [], pz: [], colors: [] }
  for (let row = 0; row < N; row++) {
    const yImg = N - 1 - row // 从底部向上
    const rMax = Math.floor(radius[yImg])
    if (rMax < 1) continue
    const y = opts.bedTopY + (row + 0.5) * cell
    const ccw = row % 2 === 0 // 相邻行换向，路径更顺滑
    // 外圈 → 内圈
    for (let r = rMax; r >= 1; r--) {
      const n = Math.max(8, Math.round(2 * Math.PI * r * density))
      for (let j = 0; j < n; j++) {
        const theta = ((ccw ? j : n - 1 - j) / n) * Math.PI * 2
        const wx = r * Math.cos(theta) * cell
        const wz = r * Math.sin(theta) * cell
        // 表面颜色：把正面像素按经度映射（正面朝 +z，背面镜像正面）
        const xImg = Math.min(N - 1, Math.max(0, Math.round(cx + r * Math.sin(theta))))
        const i = yImg * N + xImg
        pushVoxel(e, wx, y, wz, P.r[i], P.g[i], P.b[i], 1 + 0.1 * Math.abs(Math.sin(theta)))
      }
    }
    // 轴心
    const i0 = yImg * N + Math.round(cx)
    pushVoxel(e, 0, y, 0, P.r[i0], P.g[i0], P.b[i0], 1)
  }
  return finalize(e, opts, N, cell)
}

export function sliceImage(img: HTMLImageElement, opts: SliceOptions): PrintJob {
  const P = extractPixels(img, opts.resolution)
  switch (opts.mode) {
    case 'mirror':
      return buildMirror(P, opts)
    case 'lathe':
      return buildLathe(P, opts)
    default:
      return buildPlate(P, opts)
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
