import { useCallback, useEffect, useRef, useState } from 'react'
import MachineScene, { type MachineStatus, type HudScreen } from '../components/MachineScene'
import Terminal from '../components/Terminal'
import BootOverlay from '../components/BootOverlay'
import { sliceImage, loadImage, type PrintJob, type FormMode } from '../lib/voxel'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

const RESOLUTIONS = [32, 48, 64, 96]
const BED_SIZE = 2.3
const BED_TOP_Y = 0.6
const PLANE_HEIGHT = 1.7 // 竖直图像平面高度

const SAMPLES = [
  { id: 'temple-of-heaven', name: '天坛', file: 'temple-of-heaven.webp' },
  { id: 'forbidden-city', name: '故宫', file: 'forbidden-city.webp' },
  { id: 'color-orb', name: '彩色圆盘', file: 'color-orb.webp' },
  { id: 'japanese-castle', name: '日本城堡', file: 'japanese-castle.webp' },
  { id: 'notre-dame', name: '巴黎圣母院', file: 'notre-dame.webp' },
].map((s) => ({ ...s, url: `${import.meta.env.BASE_URL}samples/${s.file}` }))

function fmt(n: number) {
  return n.toLocaleString('en-US')
}
function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export default function Home() {
  const [booted, setBooted] = useState(() => typeof window !== 'undefined' && window.location.search.includes('skipboot'))
  const [status, setStatus] = useState<MachineStatus>('idle')
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const imgRef = useRef<HTMLImageElement | null>(null)

  const [resolution, setResolution] = useState(64)
  const [maxDepth, setMaxDepth] = useState(0.5)
  const [mode, setMode] = useState<FormMode>('plate')
  const [invert, setInvert] = useState(false)
  const [speed, setSpeed] = useState(1.4)

  const [job, setJob] = useState<PrintJob | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, layer: 0, layers: 0 })
  const [elapsed, setElapsed] = useState(0)
  const [lines, setLines] = useState<string[]>([
    '; LUMENFORGE LF-1 固件 v2.4.1',
    '; 串口已连接 · 115200 baud',
    'M115  ; 请求固件信息',
  ])
  const [drag, setDrag] = useState(false)
  const [uptime, setUptime] = useState(0)

  const screenRef = useRef<HudScreen>({ l1: 'STANDBY', l2: 'AWAITING MEDIA', pct: 0 })
  const canvasEl = useRef<HTMLCanvasElement | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const sliceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const busy = status === 'slicing' || status === 'printing'

  /* 时钟 */
  useEffect(() => {
    const t = setInterval(() => setUptime((u) => u + 1), 1000)
    return () => clearInterval(t)
  }, [])

  /* 打印计时 */
  useEffect(() => {
    if (status !== 'printing') return
    const t = setInterval(() => setElapsed((e) => e + 0.25), 250)
    return () => clearInterval(t)
  }, [status])

  /* 机身屏幕状态 */
  useEffect(() => {
    const s = screenRef.current
    if (status === 'idle') {
      s.l1 = 'STANDBY'
      s.l2 = imageSrc ? 'MEDIA LOADED' : 'AWAITING MEDIA'
      s.pct = 0
    } else if (status === 'slicing') {
      s.l1 = 'SLICING'
      s.l2 = 'BUILDING LAYERS'
      s.pct = 0.35
    } else if (status === 'done') {
      s.l1 = 'COMPLETE'
      s.l2 = fileName.slice(0, 18).toUpperCase()
      s.pct = 1
    }
  }, [status, imageSrc, fileName])

  const log = useCallback((line: string) => {
    setLines((prev) => (prev.length > 90 ? [...prev.slice(-70), line] : [...prev, line]))
  }, [])

  /* 载入图片 */
  const applyImage = useCallback(
    async (url: string, name: string) => {
      try {
        const img = await loadImage(url)
        imgRef.current = img
        setImageSrc(url)
        setFileName(name)
        setJob(null)
        setStatus('idle')
        setProgress({ done: 0, total: 0, layer: 0, layers: 0 })
        log(`; 介质已装载: ${name} (${img.naturalWidth}×${img.naturalHeight})`)
      } catch {
        log('; 错误: 无法读取该文件')
      }
    },
    [log],
  )

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return
      applyImage(URL.createObjectURL(file), file.name)
    },
    [applyImage],
  )

  /* 开始打印 */
  const startPrint = useCallback(() => {
    if (!imgRef.current || busy) return
    setStatus('slicing')
    setElapsed(0)
    log('M140 S60  ; 热床 60°C')
    log('M104 S215 ; 喷嘴 215°C')
    log('G28       ; 三轴回零')
    log(`; 切片中: ${fileName} @ ${resolution}px · ${{ plate: '平板浮雕', mirror: '双面镜像', lathe: '旋转成型' }[mode]}`)
    sliceTimer.current = setTimeout(() => {
      const j = sliceImage(imgRef.current!, {
        mode,
        resolution,
        maxDepth,
        invert,
        bedSize: BED_SIZE,
        bedTopY: BED_TOP_Y,
        planeHeight: PLANE_HEIGHT,
      })
      j.name = fileName
      setJob(j)
      setProgress({ done: 0, total: j.totalVoxels, layer: 0, layers: j.layers })
      log(`; 切片完成: ${j.layers} 层 · ${fmt(j.totalVoxels)} 体素 · 耗材 ${(j.filamentMm / 1000).toFixed(2)}m`)
      log('M106 S255 ; 冷却风扇开启')
      setStatus('printing')
    }, 1300)
  }, [busy, fileName, resolution, maxDepth, invert, mode, log])

  /* 取消 */
  const cancel = useCallback(() => {
    if (sliceTimer.current) clearTimeout(sliceTimer.current)
    setStatus('idle')
    setJob(null)
    setProgress({ done: 0, total: 0, layer: 0, layers: 0 })
    log('M112  ; 作业中止，喷头归位')
  }, [log])

  /* 完成 */
  const handleComplete = useCallback(() => {
    setStatus('done')
    log('M400      ; 等待运动结束')
    log('M104 S0   ; 喷嘴降温')
    log('M140 S0   ; 热床降温')
    log('M84       ; 电机释放')
    log('; ✓ 打印完成')
  }, [log])

  /* 导出快照 */
  const snapshot = useCallback(() => {
    const cv = canvasEl.current
    if (!cv) return
    const a = document.createElement('a')
    a.href = cv.toDataURL('image/png')
    a.download = `lumenforge-${fileName || 'print'}.png`
    a.click()
  }, [fileName])

  const pct = progress.total > 0 ? progress.done / progress.total : 0
  const remain = job ? Math.max(0, job.estSeconds / speed - elapsed) : 0

  const statusMeta = {
    idle: { label: imageSrc ? 'READY 就绪' : 'STANDBY 待机', cls: 'text-sky-400', led: 'text-sky-400 led-slow' },
    slicing: { label: 'SLICING 切片中', cls: 'text-amber-400', led: 'text-amber-400 led-fast' },
    printing: { label: 'PRINTING 打印中', cls: 'text-primary', led: 'text-primary led-fast' },
    done: { label: 'COMPLETE 完成', cls: 'text-emerald-400', led: 'text-emerald-400 led-slow' },
  }[status]

  return (
    <div className="h-full flex flex-col bp-grid select-none">
      {!booted && <BootOverlay onDone={() => setBooted(true)} />}

      {/* ===== 顶栏 ===== */}
      <header className="h-12 shrink-0 border-b border-border bg-card/70 backdrop-blur flex items-center px-4 gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 border border-primary/70 grid place-items-center">
            <div className="w-2 h-2 bg-primary" />
          </div>
          <span className="font-bold tracking-[0.28em] text-[13px]">LUMENFORGE</span>
          <span className="label-tech hidden sm:inline mt-px">LF-1 · 影像打印机</span>
        </div>
        <div className="flex-1" />
        <div className="hidden md:block font-mono2 text-[10px] text-muted-foreground tracking-widest">
          UPTIME {fmtTime(uptime)}
        </div>
        <div className="flex items-center gap-2 border border-border px-2.5 py-1">
          <span className={`led ${statusMeta.led}`} />
          <span className={`font-mono2 text-[10px] tracking-[0.18em] ${statusMeta.cls}`}>{statusMeta.label}</span>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* ===== 左侧控制面板 ===== */}
        <aside className="w-[318px] shrink-0 border-r border-border bg-card/60 backdrop-blur overflow-y-auto">
          {/* 介质仓 */}
          <section className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="label-tech">01 · 介质仓 MEDIA</span>
              <span className={`led ${imageSrc ? 'text-emerald-400' : 'text-muted-foreground/40'}`} />
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {imageSrc ? (
              <div className="rise-in">
                <div className="corner-ticks border border-border bg-black/40 p-1.5">
                  <img src={imageSrc} alt="media" className="w-full aspect-square object-cover" />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-mono2 text-[10px] text-muted-foreground truncate max-w-[170px]">{fileName}</span>
                  <button
                    onClick={() => fileInput.current?.click()}
                    disabled={busy}
                    className="font-mono2 text-[10px] tracking-widest text-primary hover:underline disabled:opacity-40"
                  >
                    更换
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDrag(true)
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDrag(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFile(f)
                }}
                className={`dropzone w-full aspect-[4/3] flex flex-col items-center justify-center gap-3 ${drag ? 'dropzone-drag' : ''}`}
              >
                <div className="w-10 h-10 border border-border grid place-items-center text-muted-foreground">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 16V4m0 0l-4 4m4-4l4 4" />
                    <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
                  </svg>
                </div>
                <div className="text-center">
                  <div className="text-[12px] text-foreground/80">放入一张图片</div>
                  <div className="font-mono2 text-[9.5px] text-muted-foreground mt-1 tracking-widest">CLICK / DROP · JPG PNG WEBP</div>
                </div>
              </button>
            )}

            {/* 示例图库 */}
            <div className="mt-3 pt-3 border-t border-border/60">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono2 text-[9px] tracking-[0.2em] text-muted-foreground">示例图库 SAMPLES</span>
                <span className="font-mono2 text-[9px] text-muted-foreground/50">点击即印</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {SAMPLES.map((s) => (
                  <button
                    key={s.id}
                    disabled={busy}
                    onClick={() => applyImage(s.url, `sample-${s.id}.png`)}
                    className="group relative aspect-square overflow-hidden border border-border hover:border-primary/70 transition-colors disabled:opacity-40"
                    title={s.name}
                  >
                    <img
                      src={s.url}
                      alt={s.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-[2px] font-mono2 text-[8.5px] text-foreground/80 py-0.5 text-center">
                      {s.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 打印参数 */}
          <section className={`p-4 border-b border-border transition-opacity ${busy ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="label-tech mb-3">02 · 打印参数 SLICER</div>

            <div className="mb-4">
              <div className="flex justify-between mb-1.5">
                <span className="font-mono2 text-[10px] text-foreground/70">成型模式</span>
                <span className="font-mono2 text-[9px] text-muted-foreground">
                  {mode === 'plate' ? '单面竖直浮雕' : mode === 'mirror' ? '前后对称' : '旋转体 360°'}
                </span>
              </div>
              <div className="flex">
                {([
                  { id: 'plate', label: '平板' },
                  { id: 'mirror', label: '双面' },
                  { id: 'lathe', label: '旋转' },
                ] as const).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`seg-btn flex-1 first:border-r-0 [&:nth-child(2)]:border-r-0 ${mode === m.id ? 'seg-btn-active' : ''}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {mode === 'lathe' && (
                <div className="font-mono2 text-[9px] text-muted-foreground mt-1.5 leading-relaxed">
                  适合天坛 / 花瓶 / 塔等旋转对称物体，按轮廓扫掠成圆
                </div>
              )}
            </div>

            <div className="mb-4">
              <div className="flex justify-between mb-1.5">
                <span className="font-mono2 text-[10px] text-foreground/70">网格精度</span>
                <span className="font-mono2 text-[10px] text-primary">{resolution}×{resolution}</span>
              </div>
              <div className="flex">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setResolution(r)}
                    className={`seg-btn flex-1 first:border-r-0 [&:nth-child(2)]:border-r-0 [&:nth-child(3)]:border-r-0 ${resolution === r ? 'seg-btn-active' : ''}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className={`mb-4 transition-opacity ${mode === 'lathe' ? 'opacity-30 pointer-events-none' : ''}`}>
              <div className="flex justify-between mb-1.5">
                <span className="font-mono2 text-[10px] text-foreground/70">浮雕深度</span>
                <span className="font-mono2 text-[10px] text-primary">
                  {mode === 'lathe' ? '由轮廓决定' : `${Math.round(maxDepth * 100)}mm`}
                </span>
              </div>
              <Slider value={[maxDepth]} onValueChange={([v]) => setMaxDepth(v)} min={0.2} max={1.4} step={0.05} />
              {resolution >= 64 && maxDepth > 0.5 && (
                <div className="font-mono2 text-[9px] text-muted-foreground mt-1">
                  高精度下 Z 轴采样会自动调整，实际深度保持不变
                </div>
              )}
            </div>

            <div className="mb-4">
              <div className="flex justify-between mb-1.5">
                <span className="font-mono2 text-[10px] text-foreground/70">沉积速度</span>
                <span className="font-mono2 text-[10px] text-primary">{speed.toFixed(1)}×</span>
              </div>
              <Slider value={[speed]} onValueChange={([v]) => setSpeed(v)} min={0.5} max={3} step={0.1} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono2 text-[10px] text-foreground/70">亮部凸起</div>
                <div className="font-mono2 text-[9px] text-muted-foreground mt-0.5">默认暗部凸起（浮雕模式）</div>
              </div>
              <Switch checked={invert} onCheckedChange={setInvert} />
            </div>
          </section>

          {/* 作业控制 */}
          <section className="p-4">
            <div className="label-tech mb-3">03 · 作业控制 JOB</div>

            {status === 'printing' || status === 'slicing' ? (
              <button
                onClick={cancel}
                className="w-full h-11 border border-destructive/70 text-destructive font-mono2 text-[12px] tracking-[0.3em] hover:bg-destructive/10 transition-colors"
              >
                ■ 中止作业
              </button>
            ) : (
              <button
                onClick={startPrint}
                disabled={!imageSrc}
                className="w-full h-11 bg-primary text-primary-foreground font-mono2 text-[12px] tracking-[0.3em] hover:brightness-110 active:brightness-95 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
              >
                ▶ 开始打印
              </button>
            )}

            {/* 进度 */}
            <div className="mt-4">
              <div className="flex justify-between mb-1.5">
                <span className="font-mono2 text-[10px] text-muted-foreground">PROGRESS</span>
                <span className="font-mono2 text-[10px] text-primary">{(pct * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-secondary relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-150" style={{ width: `${pct * 100}%` }} />
              </div>
            </div>

            {/* 实时参数 */}
            <div className="grid grid-cols-2 gap-px bg-border border border-border mt-4">
              {[
                { k: '层 LAYER', v: progress.layers ? `${status === 'done' ? progress.layers : progress.layer}/${progress.layers}` : '—' },
                { k: '体素 VOXEL', v: progress.total ? fmt(progress.done) : '—' },
                { k: '耗材 FIL.', v: job ? `${((job.filamentMm * pct) / 1000).toFixed(2)}m` : '—' },
                { k: '剩余 ETA', v: status === 'printing' ? fmtTime(remain) : status === 'done' ? fmtTime(elapsed) : '—' },
              ].map(({ k, v }) => (
                <div key={k} className="bg-card px-2.5 py-2">
                  <div className="font-mono2 text-[9px] text-muted-foreground tracking-widest">{k}</div>
                  <div className="font-mono2 text-[13px] text-foreground mt-0.5">{v}</div>
                </div>
              ))}
            </div>
          </section>
        </aside>

        {/* ===== 右侧：3D 视口 + 终端 ===== */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 relative min-h-0 border-b border-border">
            <MachineScene
              job={job}
              status={status}
              speed={speed}
              screen={screenRef.current}
              onProgress={setProgress}
              onLog={log}
              onComplete={handleComplete}
              onCanvasReady={(c) => (canvasEl.current = c)}
            />

            {/* 视口叠加层 */}
            <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
              <span className={`led ${busy ? 'text-destructive led-fast' : 'text-emerald-400 led-slow'}`} />
              <span className="font-mono2 text-[10px] tracking-[0.2em] text-foreground/70">CAM-01 · LIVE</span>
            </div>
            <div className="absolute top-3 right-3 font-mono2 text-[10px] tracking-[0.2em] text-muted-foreground pointer-events-none text-right">
              <div>PLATE {Math.round(PLANE_HEIGHT * 100)}×{Math.round(PLANE_HEIGHT * 100)}mm</div>
              <div className="mt-0.5">NOZZLE 0.4 · PLA</div>
            </div>
            <div className="absolute bottom-3 left-3 font-mono2 text-[10px] text-muted-foreground/70 pointer-events-none">
              拖拽旋转 · 滚轮缩放
            </div>
            {status === 'printing' && <div className="scan-sweep" />}

            {/* 切片遮罩 */}
            {status === 'slicing' && (
              <div className="absolute inset-0 bg-background/50 backdrop-blur-[2px] grid place-items-center">
                <div className="text-center rise-in">
                  <div className="font-mono2 text-[12px] tracking-[0.4em] text-primary">SLICING</div>
                  <div className="font-mono2 text-[10px] text-muted-foreground mt-2 tracking-widest">正在生成 {resolution} 行沉积路径…</div>
                </div>
              </div>
            )}

            {/* 完成卡片 */}
            {status === 'done' && (
              <div className="absolute bottom-4 right-4 panel corner-ticks p-4 w-[240px] rise-in">
                <div className="flex items-center gap-2 mb-2">
                  <span className="led text-emerald-400" />
                  <span className="font-mono2 text-[11px] tracking-[0.25em] text-emerald-400">打印完成</span>
                </div>
                <div className="font-mono2 text-[10px] text-muted-foreground leading-relaxed">
                  {fmt(progress.total)} 体素 · {job?.layers} 层
                  <br />
                  用时 {fmtTime(elapsed)} · 耗材 {job ? (job.filamentMm / 1000).toFixed(2) : 0}m
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={snapshot}
                    className="flex-1 h-8 bg-primary text-primary-foreground font-mono2 text-[10px] tracking-widest hover:brightness-110"
                  >
                    导出快照
                  </button>
                  <button
                    onClick={cancel}
                    className="flex-1 h-8 border border-border font-mono2 text-[10px] tracking-widest text-foreground/80 hover:bg-accent"
                  >
                    新作业
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 终端 */}
          <div className="h-[132px] shrink-0 bg-[#08090b]">
            <div className="h-6 border-b border-border flex items-center px-3 gap-2">
              <span className="w-2 h-2 rounded-full bg-destructive/60" />
              <span className="w-2 h-2 rounded-full bg-amber-400/60" />
              <span className="w-2 h-2 rounded-full bg-emerald-400/60" />
              <span className="label-tech ml-2">GCODE · SERIAL MONITOR</span>
            </div>
            <div className="h-[calc(100%-24px)]">
              <Terminal lines={lines} />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
