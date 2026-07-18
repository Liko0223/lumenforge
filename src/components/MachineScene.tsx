import { useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, ContactShadows, Line, Edges } from '@react-three/drei'
import * as THREE from 'three'
import type { PrintJob } from '../lib/voxel'

export type MachineStatus = 'idle' | 'slicing' | 'printing' | 'done'

export interface HudScreen {
  l1: string
  l2: string
  pct: number
}

interface SceneProps {
  job: PrintJob | null
  status: MachineStatus
  speed: number
  screen: HudScreen
  onProgress: (info: { done: number; total: number; layer: number; layers: number }) => void
  onLog: (line: string) => void
  onComplete: () => void
  onCanvasReady: (canvas: HTMLCanvasElement) => void
}

const BED_SIZE = 2.3
const BED_TOP_Y = 0.6
const MODEL_HEIGHT = 1.15
const TIP = 0.34 // 喷头顶点到龙门架原点的距离
const BASE_VPS = 240

const C = {
  frame: '#363b46',
  frameDark: '#262a32',
  metal: '#8a8f98',
  brass: '#c8973a',
  accent: '#ff5c1f',
  bedGlass: '#16181d',
}

/* ---------------- 机身材质小工具 ---------------- */
function mat(color: string, rough = 0.55, metal = 0.25) {
  return <meshStandardMaterial color={color} roughness={rough} metalness={metal} />
}

/* ---------------- 机身屏幕（帆布纹理） ---------------- */
function MachineScreen({ screen }: { screen: HudScreen }) {
  const tex = useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = 256
    cv.height = 128
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  const last = useRef('')

  useFrame(() => {
    const key = `${screen.l1}|${screen.l2}|${screen.pct.toFixed(2)}`
    if (key === last.current) return
    last.current = key
    const cv = tex.image as HTMLCanvasElement
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#0a0c0a'
    ctx.fillRect(0, 0, 256, 128)
    ctx.strokeStyle = '#2a3f2a'
    ctx.strokeRect(4, 4, 248, 120)
    ctx.fillStyle = '#ffb38a'
    ctx.font = '700 22px "JetBrains Mono", monospace'
    ctx.fillText(screen.l1.slice(0, 16), 14, 40)
    ctx.fillStyle = '#7ee2a0'
    ctx.font = '500 17px "JetBrains Mono", monospace'
    ctx.fillText(screen.l2.slice(0, 20), 14, 70)
    // 进度条
    ctx.fillStyle = '#1c2a1c'
    ctx.fillRect(14, 92, 228, 12)
    ctx.fillStyle = '#ff5c1f'
    ctx.fillRect(14, 92, 228 * Math.min(1, screen.pct), 12)
    tex.needsUpdate = true
  })

  return (
    <mesh position={[-0.82, 0.28, 1.706]}>
      <boxGeometry args={[0.66, 0.36, 0.02]} />
      <meshStandardMaterial color="#050505" roughness={0.4} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.9} map={tex} />
    </mesh>
  )
}

/* ---------------- 顶部警示灯 ---------------- */
const BEACON: Record<MachineStatus, { color: string; speed: number }> = {
  idle: { color: '#3b82f6', speed: 1.2 },
  slicing: { color: '#ffb020', speed: 5 },
  printing: { color: '#ff5c1f', speed: 7 },
  done: { color: '#34d399', speed: 2 },
}

function Beacon({ status, position }: { status: MachineStatus; position: [number, number, number] }) {
  const dome = useRef<THREE.Mesh>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const m = BEACON[status]
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const pulse = 0.55 + 0.45 * Math.sin(t * m.speed)
    ;(dome.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7 + pulse * 1.8
    light.current.intensity = pulse * 1.4
    light.current.color.set(m.color)
    ;(dome.current.material as THREE.MeshStandardMaterial).emissive.set(m.color)
  })
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.055, 0.07, 0.05, 16]} />
        {mat('#2c2f35', 0.4, 0.7)}
      </mesh>
      <mesh ref={dome} position={[0, 0.055, 0]}>
        <sphereGeometry args={[0.055, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#111" emissive={m.color} roughness={0.3} />
      </mesh>
      <pointLight ref={light} position={[0, 0.16, 0]} distance={2.6} color={m.color} intensity={0.8} />
    </group>
  )
}

/* ---------------- 料盘 ---------------- */
function Spool({ status, position }: { status: MachineStatus; position: [number, number, number] }) {
  const g = useRef<THREE.Group>(null!)
  useFrame((_, dt) => {
    if (status === 'printing') g.current.rotation.z -= dt * 1.6
  })
  return (
    <group position={position}>
      {/* 挂臂 */}
      <mesh position={[0, 0, -0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.34, 10]} />
        {mat('#3a3d44', 0.4, 0.8)}
      </mesh>
      <group ref={g}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.05, 32]} />
          {mat('#26282d', 0.5, 0.4)}
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.09]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.05, 32]} />
          {mat('#26282d', 0.5, 0.4)}
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.045]}>
          <cylinderGeometry args={[0.235, 0.235, 0.085, 32]} />
          <meshStandardMaterial color={C.accent} roughness={0.55} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.045]}>
          <cylinderGeometry args={[0.07, 0.07, 0.2, 16]} />
          {mat('#3a3d44', 0.4, 0.8)}
        </mesh>
      </group>
    </group>
  )
}

/* ---------------- 线缆（随龙门架移动） ---------------- */
function Cable({ gantry }: { gantry: React.RefObject<THREE.Group> }) {
  const line = useRef<any>(null)
  const pts = useMemo(() => new Float32Array(14 * 3), [])
  useFrame(() => {
    const gy = gantry.current ? gantry.current.position.y : 1
    const a = new THREE.Vector3(1.52, 3.02, -0.18)
    const b = new THREE.Vector3(1.5, gy + 0.1, -0.18)
    for (let i = 0; i < 14; i++) {
      const t = i / 13
      const sag = Math.sin(t * Math.PI) * 0.34
      pts[i * 3] = THREE.MathUtils.lerp(a.x, b.x, t) - sag * 0.3
      pts[i * 3 + 1] = THREE.MathUtils.lerp(a.y, b.y, t) - sag * 0.35
      pts[i * 3 + 2] = THREE.MathUtils.lerp(a.z, b.z, t)
    }
    line.current?.geometry.setPositions(pts)
  })
  return <Line ref={line} points={[[0, 0, 0], [0, 1, 0]]} color="#0e0f12" lineWidth={3} />
}

/* ---------------- 打印作业（体素 + 运动机构） ---------------- */
function PrintRig({
  job,
  status,
  speed,
  screen,
  onProgress,
  onLog,
  onComplete,
}: Omit<SceneProps, 'onCanvasReady'>) {
  const bed = useRef<THREE.Group>(null!)
  const gantry = useRef<THREE.Group>(null!)
  const carriage = useRef<THREE.Group>(null!)
  const nozzleGlow = useRef<THREE.PointLight>(null!)
  const filament = useRef<THREE.Mesh>(null!)
  const mesh = useRef<THREE.InstancedMesh>(null!)

  const prog = useRef(0)
  const idx = useRef(0)
  const lastLayer = useRef(-1)
  const lastReport = useRef(0)
  const lastGcode = useRef(0)
  const finished = useRef(false)

  // 初始化 / 重置
  useLayoutEffect(() => {
    prog.current = 0
    idx.current = 0
    lastLayer.current = -1
    finished.current = false
    if (!mesh.current) return
    mesh.current.count = 0
    if (job) {
      const c = new THREE.Color()
      for (let i = 0; i < job.totalVoxels; i++) {
        c.setRGB(job.colors[i * 3], job.colors[i * 3 + 1], job.colors[i * 3 + 2], THREE.SRGBColorSpace)
        mesh.current.setColorAt(i, c)
      }
      if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
    }
  }, [job])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = clock.elapsedTime

    let targetX = -(BED_SIZE / 2) - 0.18 // 停靠位
    let targetBedZ = 0
    let targetGantryY = BED_TOP_Y + 0.06 + TIP

    if (job && (status === 'printing' || status === 'done')) {
      if (status === 'printing') {
        prog.current += speed * BASE_VPS * dt
        const n = Math.min(job.totalVoxels, Math.floor(prog.current))
        while (idx.current < n) {
          const i = idx.current
          dummy.position.set(job.px[i], job.py[i], job.pz[i])
          dummy.scale.set(job.voxelSize * 0.94, job.layerHeight, job.voxelSize * 0.94)
          dummy.updateMatrix()
          mesh.current.setMatrixAt(i, dummy.matrix)
          idx.current++
        }
        mesh.current.count = idx.current
        mesh.current.instanceMatrix.needsUpdate = true

        const cur = Math.min(idx.current, job.totalVoxels - 1)
        const layer = Math.round((job.py[cur] - BED_TOP_Y) / job.layerHeight - 0.5)

        // 运动目标：喷嘴对准当前体素，热床把当前行送到喷嘴下
        targetX = job.px[cur]
        targetBedZ = -job.pz[cur]
        targetGantryY = job.py[cur] + job.layerHeight / 2 + TIP

        // 日志
        if (layer !== lastLayer.current) {
          lastLayer.current = layer
          onLog(`; ── LAYER ${layer + 1}/${job.layers}  Z=${((layer + 1) * job.layerHeight).toFixed(2)}`)
        }
        if (idx.current - lastGcode.current > 50) {
          lastGcode.current = idx.current
          const e = ((idx.current * job.voxelSize * job.voxelSize * job.layerHeight) / 2.405).toFixed(2)
          onLog(`G1 X${job.px[cur].toFixed(2)} Y${job.pz[cur].toFixed(2)} E${e} F${Math.round(speed * 4200)}`)
        }
        if (t - lastReport.current > 0.12) {
          lastReport.current = t
          onProgress({ done: idx.current, total: job.totalVoxels, layer: layer + 1, layers: job.layers })
          screen.l1 = `LAYER ${layer + 1}/${job.layers}`
          screen.l2 = `${idx.current}/${job.totalVoxels} vox`
          screen.pct = idx.current / job.totalVoxels
        }

        if (idx.current >= job.totalVoxels && !finished.current) {
          finished.current = true
          onComplete()
        }
      } else {
        // done：抬升归位
        targetGantryY = BED_TOP_Y + MODEL_HEIGHT + 0.3 + TIP
      }
    }

    // 平滑运动
    const k = 1 - Math.exp(-9 * dt)
    const kg = 1 - Math.exp(-6 * dt)
    carriage.current.position.x += (targetX - carriage.current.position.x) * k
    bed.current.position.z += (targetBedZ - bed.current.position.z) * k
    gantry.current.position.y += (targetGantryY - gantry.current.position.y) * kg

    // 喷头工作灯 & 熔丝
    const active = status === 'printing' && !!job
    nozzleGlow.current.intensity = active ? 0.85 + Math.sin(t * 31) * 0.2 : 0
    filament.current.visible = active
    if (active) filament.current.scale.y = 0.8 + Math.sin(t * 47) * 0.25
  })

  return (
    <group>
      {/* ===== 热床（沿 Z 移动，打印产物随床移动） ===== */}
      <group ref={bed} position={[0, 0, 0]}>
        <mesh position={[0, 0.545, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.7, 0.07, 2.7]} />
          {mat('#1d1f24', 0.4, 0.6)}
        </mesh>
        <mesh position={[0, 0.59, 0]} receiveShadow>
          <boxGeometry args={[BED_SIZE + 0.06, 0.02, BED_SIZE + 0.06]} />
          <meshStandardMaterial color={C.bedGlass} roughness={0.15} metalness={0.4} />
        </mesh>
        {/* 床面刻度 */}
        <gridHelper args={[BED_SIZE, 10, '#2c2f36', '#22252b']} position={[0, 0.602, 0]} />
        {/* 长尾夹 */}
        {[[-1.05, -1.05], [1.05, -1.05], [-1.05, 1.05], [1.05, 1.05]].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.615, z]}>
            <boxGeometry args={[0.1, 0.03, 0.05]} />
            {mat('#0c0d10', 0.35, 0.7)}
          </mesh>
        ))}
        {/* 打印产物 */}
        {job && (
          <instancedMesh
            key={job.totalVoxels}
            ref={mesh}
            args={[undefined, undefined, job.totalVoxels]}
            castShadow
            receiveShadow
            frustumCulled={false}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial roughness={0.6} metalness={0.05} />
          </instancedMesh>
        )}
      </group>

      {/* ===== 龙门架（沿 Y 升降） ===== */}
      <group ref={gantry} position={[0, BED_TOP_Y + 0.06 + TIP, 0]}>
        {/* 横梁 */}
        <mesh castShadow>
          <boxGeometry args={[3.1, 0.12, 0.16]} />
          {mat(C.frame, 0.45, 0.6)}
        </mesh>
        <mesh position={[0, 0.075, 0]}>
          <boxGeometry args={[3.1, 0.03, 0.06]} />
          {mat('#3a3d44', 0.35, 0.8)}
        </mesh>
        {/* 两侧滑块 */}
        {[-1.46, 1.46].map((x) => (
          <mesh key={x} position={[x, 0, 0]} castShadow>
            <boxGeometry args={[0.14, 0.22, 0.2]} />
            {mat('#2b2e34', 0.4, 0.7)}
          </mesh>
        ))}
        {/* ===== 挤出头（沿 X 移动） ===== */}
        <group ref={carriage} position={[-(BED_SIZE / 2) - 0.18, 0, 0]}>
          <mesh position={[0, -0.02, 0.12]} castShadow>
            <boxGeometry args={[0.24, 0.2, 0.12]} />
            {mat('#2b2e34', 0.4, 0.7)}
          </mesh>
          {/* 步进电机 */}
          <mesh position={[0, 0.06, 0.2]} castShadow>
            <boxGeometry args={[0.17, 0.17, 0.1]} />
            {mat('#33363d', 0.35, 0.75)}
          </mesh>
          {/* 散热风扇 + 蓝色灯条 */}
          <mesh position={[0, -0.1, 0.19]}>
            <boxGeometry args={[0.14, 0.14, 0.05]} />
            {mat('#17181c', 0.5, 0.3)}
          </mesh>
          <mesh position={[0, -0.1, 0.218]}>
            <circleGeometry args={[0.045, 20]} />
            <meshStandardMaterial color="#0a0a0c" emissive="#4aa3ff" emissiveIntensity={1.6} />
          </mesh>
          {/* 加热块 */}
          <mesh position={[0, -0.19, 0.12]}>
            <boxGeometry args={[0.09, 0.08, 0.09]} />
            {mat(C.metal, 0.3, 0.9)}
          </mesh>
          {/* 黄铜喷嘴 */}
          <mesh position={[0, -0.27, 0.12]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.032, 0.08, 16]} />
            {mat(C.brass, 0.25, 0.95)}
          </mesh>
          {/* 熔丝 */}
          <mesh ref={filament} position={[0, -0.325, 0.12]}>
            <cylinderGeometry args={[0.006, 0.006, 0.03, 6]} />
            <meshStandardMaterial color="#ffb46a" emissive="#ff7a2a" emissiveIntensity={2.4} />
          </mesh>
          <pointLight ref={nozzleGlow} position={[0, -0.3, 0.12]} distance={0.85} color="#ff8a3a" intensity={0} />
        </group>
      </group>

      {/* 把龙门架 ref 传给线缆 */}
      <Cable gantry={gantry} />
    </group>
  )
}

/* ---------------- 静态机身 ---------------- */
function Frame({ status, screen }: { status: MachineStatus; screen: HudScreen }) {
  return (
    <group>
      {/* 底脚 */}
      {[[-1.45, -1.45], [1.45, -1.45], [-1.45, 1.45], [1.45, 1.45]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.04, z]}>
          <cylinderGeometry args={[0.09, 0.11, 0.08, 16]} />
          {mat('#0d0e11', 0.6, 0.2)}
        </mesh>
      ))}
      {/* 机箱 */}
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 0.4, 3.4]} />
        {mat('#282b33', 0.5, 0.45)}
      </mesh>
      <mesh position={[0, 0.485, 0]}>
        <boxGeometry args={[3.3, 0.015, 3.3]} />
        {mat('#222429', 0.4, 0.5)}
      </mesh>
      {/* 前面板散热孔 */}
      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={i} position={[0.35 + i * 0.16, 0.2, 1.706]}>
          <boxGeometry args={[0.09, 0.012, 0.01]} />
          {mat('#0c0d10', 0.6, 0.3)}
        </mesh>
      ))}
      {/* 急停按钮 */}
      <group position={[1.28, 0.3, 1.71]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.03, 20]} />
          {mat('#d8b93a', 0.4, 0.4)}
        </mesh>
        <mesh position={[0, 0, 0.035]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.055, 0.05, 20]} />
          <meshStandardMaterial color="#c23327" roughness={0.35} />
        </mesh>
      </group>
      {/* 屏幕 + 旋钮 */}
      <MachineScreen screen={screen} />
      <mesh position={[-0.32, 0.28, 1.71]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.05, 20]} />
        {mat('#33363d', 0.3, 0.8)}
      </mesh>

      {/* 床导轨 */}
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} position={[x, 0.52, 0]}>
          <boxGeometry args={[0.08, 0.05, 3.1]} />
          {mat('#33363d', 0.3, 0.85)}
        </mesh>
      ))}

      {/* 立柱 */}
      {[-1.55, 1.55].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.74, 0]} castShadow>
            <boxGeometry args={[0.12, 2.52, 0.14]} />
            {mat(C.frame, 0.45, 0.6)}
          </mesh>
          {/* 丝杆 */}
          <mesh position={[x * 0.945, 1.74, 0]}>
            <cylinderGeometry args={[0.028, 0.028, 2.42, 12]} />
            {mat('#6d727c', 0.25, 0.95)}
          </mesh>
        </group>
      ))}
      {/* 顶部横梁 */}
      <mesh position={[0, 3.0, 0]} castShadow>
        <boxGeometry args={[3.22, 0.12, 0.14]} />
        {mat(C.frame, 0.45, 0.6)}
      </mesh>
      <Beacon status={status} position={[1.38, 3.09, 0]} />
      <Spool status={status} position={[-1.15, 3.22, 0]} />
    </group>
  )
}

/* ---------------- 待机全息框 ---------------- */
function HoloFrame({ visible }: { visible: boolean }) {
  const g = useRef<THREE.Group>(null!)
  useFrame(({ clock }) => {
    if (!g.current) return
    const t = clock.elapsedTime
    g.current.position.y = BED_TOP_Y + 0.45 + Math.sin(t * 1.4) * 0.05
    g.current.rotation.y = t * 0.35
    const s = 1 + Math.sin(t * 2.2) * 0.015
    g.current.scale.set(s, 1, s)
  })
  if (!visible) return null
  return (
    <group ref={g}>
      <mesh>
        <boxGeometry args={[1.5, 0.8, 1.5]} />
        <meshStandardMaterial color={C.accent} transparent opacity={0.04} depthWrite={false} />
        <Edges scale={1.001} color={C.accent} />
      </mesh>
    </group>
  )
}

/* ---------------- 场景 ---------------- */
export default function MachineScene(props: SceneProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      camera={{ position: [3.9, 2.8, 4.7], fov: 38 }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.28
        props.onCanvasReady(gl.domElement)
      }}
    >
      <color attach="background" args={['#0d0e12']} />
      <fog attach="fog" args={['#0d0e12', 10, 20]} />

      <hemisphereLight args={['#a8b1c4', '#23252c', 1.25]} />
      <directionalLight
        position={[4.5, 6.5, 3.5]}
        intensity={2.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={5}
        shadow-camera-bottom={-2}
      />
      <directionalLight position={[-5, 3.5, -4]} intensity={0.9} color="#7ea8ff" />
      <pointLight position={[0, 4.6, 2.6]} intensity={1.15} distance={9} color="#ffd9b0" />
      <pointLight position={[0, 0.9, 3.4]} intensity={0.5} color="#ff8a4a" />

      <Frame status={props.status} screen={props.screen} />
      <PrintRig {...props} />
      <HoloFrame visible={!props.job && props.status === 'idle'} />

      {/* 地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0d0e12" roughness={0.9} metalness={0} />
      </mesh>
      <Grid
        position={[0, 0.002, 0]}
        args={[40, 40]}
        cellSize={0.5}
        cellColor="#1b1e24"
        sectionSize={2.5}
        sectionColor="#272c35"
        fadeDistance={15}
        infiniteGrid
      />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.55} scale={12} blur={2.2} far={4} />

      <OrbitControls
        makeDefault
        target={[0, 1.2, 0]}
        minDistance={2.4}
        maxDistance={10}
        maxPolarAngle={Math.PI * 0.495}
        enableDamping
        dampingFactor={0.08}
        autoRotate={props.status === 'done'}
        autoRotateSpeed={0.9}
      />
    </Canvas>
  )
}
