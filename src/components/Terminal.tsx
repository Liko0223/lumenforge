import { useEffect, useRef } from 'react'

export default function Terminal({ lines }: { lines: string[] }) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <div ref={box} className="term-scroll h-full overflow-y-auto px-3 py-2 font-mono2 text-[10.5px] leading-[1.7]">
      {lines.map((l, i) => (
        <div key={i} className="flex gap-2 whitespace-nowrap">
          <span className="text-muted-foreground/50 select-none w-6 text-right shrink-0">{i + 1}</span>
          <span className={l.startsWith(';') ? 'text-emerald-400/80' : l.startsWith('M') ? 'text-sky-300/80' : 'text-foreground/70'}>
            {l}
          </span>
        </div>
      ))}
      <div className="flex gap-2">
        <span className="w-6 shrink-0" />
        <span className="text-primary animate-pulse">▊</span>
      </div>
    </div>
  )
}
