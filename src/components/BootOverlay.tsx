import { useEffect, useRef, useState } from 'react'

const BOOT_LINES = [
  'LUMENFORGE BIOS v2.4.1 — 影像打印工作站',
  'CPU ...... OK   MEM ...... 512K OK',
  'X 轴 ..... OK   Y 轴 ..... OK   Z 轴 ..... OK',
  '热床 60°C .......... OK',
  '喷头 215°C ......... OK',
  '光学标定 ........... OK',
  '料盘 LF-PLA ........ 已装载',
  '系统就绪，等待介质仓放入相片',
]

export default function BootOverlay({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    BOOT_LINES.forEach((_, i) => {
      timers.push(setTimeout(() => setShown(i + 1), 220 + i * 190))
    })
    timers.push(setTimeout(() => setLeaving(true), 220 + BOOT_LINES.length * 190 + 420))
    timers.push(setTimeout(() => doneRef.current(), 220 + BOOT_LINES.length * 190 + 1000))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`absolute inset-0 z-50 bg-[#07080a] flex items-center justify-center transition-opacity duration-500 ${
        leaving ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="w-[min(480px,86vw)]">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 border border-primary/70 grid place-items-center">
            <div className="w-3.5 h-3.5 bg-primary" />
          </div>
          <div>
            <div className="font-bold tracking-[0.3em] text-sm">LUMENFORGE</div>
            <div className="label-tech mt-0.5">LF-1 IMAGE PRINTER</div>
          </div>
        </div>
        <div className="font-mono2 text-[11px] leading-[2] text-foreground/75 min-h-[176px]">
          {BOOT_LINES.slice(0, shown).map((l, i) => (
            <div key={i} className="boot-line">
              <span className="text-primary mr-2">›</span>
              {l}
            </div>
          ))}
        </div>
        <div className="h-px bg-border mt-4 relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-primary transition-all duration-200"
            style={{ width: `${(shown / BOOT_LINES.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
