import type { PackingParams, PackingResult, ContainerResult } from '@/types/packing'

/**
 * 装柜效果图(mock,由需求方提供)。
 * 所有柜子统一使用同一张装柜效果图。
 */
export const PACKING_DIAGRAM_URL =
  'https://common-1317863220.cos.accelerate.myqcloud.com/application/portal/packing_diagram/portal_test_703_container_0.gif'

/** 包装系数：每件货物按原尺寸 +15% 的包装体积计 */
const PACKAGE_RATIO = 1.15

interface BinLine {
  skuid: number
  cargo_name: string
  color: string
  pieces_total: number
  pieces: number
}

interface Bin {
  volume: number
  lines: BinLine[]
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

/** 估算一组货物行的体积(m³) */
function linesVolume(lines: BinLine[], params: PackingParams): number {
  return lines.reduce((sum, l) => {
    const item = params.cargoList.find((c) => c.id === l.skuid)
    if (!item) return sum
    const unitVol = (item.spec.length * item.spec.width * item.spec.height) / 1e9 * PACKAGE_RATIO
    return sum + unitVol * l.pieces
  }, 0)
}

/** 只有一柜且总件数 ≥2 时轮流拆成两柜，保证 demo 常态化展示多柜结果 */
function ensureMultipleBins(bins: Bin[], params: PackingParams): void {
  if (bins.length !== 1) return
  const total = bins[0]!.lines.reduce((s, l) => s + l.pieces, 0)
  if (total < 2) return
  const a: BinLine[] = []
  const b: BinLine[] = []
  for (const l of bins[0]!.lines) {
    for (let i = 0; i < l.pieces; i++) {
      const target = (a.length + b.length) % 2 === 0 ? a : b
      const line = target.find((x) => x.skuid === l.skuid)
      if (line) line.pieces += 1
      else target.push({ ...l, pieces: 1 })
    }
  }
  bins.splice(
    0,
    1,
    { volume: linesVolume(a, params), lines: a },
    { volume: linesVolume(b, params), lines: b },
  )
}

/**
 * 按当前货物清单确定性排柜：
 * 单件体积 = 规格(m³) × 包装系数；按可叠放层数分层贪心装入柜中，
 * 每柜装载到约半柜多即换下一柜，保证常态化产出 2~3 柜的多结果演示。
 * 同样的输入永远得到同样的结果，调整数量 / 柜型后结果随之变化。
 */
export function planPacking(params: PackingParams): PackingResult {
  const cont = params.container
  const usableVol = cont.volumeM3 * 0.82

  const bins: Bin[] = []
  let cur: Bin = { volume: 0, lines: [] }

  for (const item of params.cargoList) {
    const unitVol =
      (item.spec.length * item.spec.width * item.spec.height) / 1e9 * PACKAGE_RATIO
    // 可叠放层数：按柜内高与货高估算，至少 1 层
    const stackable = Math.max(1, Math.floor(cont.innerHeight / (item.spec.height * 1.15)))
    // 单柜对该货物的件数上限：可装总件数 × 收敛系数(≈0.55，即约半柜多)
    const cap = Math.max(1, Math.ceil(stackable * (usableVol / stackable / unitVol) * 0.55))
    let left = item.quantity
    while (left > 0) {
      let fit = Math.min(cap, Math.floor((usableVol - cur.volume) / unitVol))
      if (fit <= 0) {
        if (cur.lines.length === 0) {
          fit = 1
        } else {
          bins.push(cur)
          cur = { volume: 0, lines: [] }
          continue
        }
      }
      const take = Math.min(left, fit)
      let line = cur.lines.find((l) => l.skuid === item.id)
      if (!line) {
        line = {
          skuid: item.id,
          cargo_name: item.name,
          color: item.color,
          pieces_total: item.quantity,
          pieces: 0,
        }
        cur.lines.push(line)
      }
      line.pieces += take
      cur.volume += take * unitVol
      left -= take
    }
  }
  if (cur.lines.length > 0) bins.push(cur)
  if (bins.length === 0) {
    bins.push({ volume: 0, lines: [] })
  }
  ensureMultipleBins(bins, params)

  const containers: ContainerResult[] = bins.map((bin, i) => {
    const usedPercent = round1((bin.volume / cont.volumeM3) * 100)
    return {
      container_index: i,
      equipment_title: cont.title,
      pieces_total: bin.lines.reduce((s, l) => s + l.pieces, 0),
      cubic_meter: {
        used_volume_m3: round1(bin.volume),
        used_percent: usedPercent,
        free_volume_m3: round1(cont.volumeM3 - bin.volume),
        total_volume_m3: round1(cont.volumeM3),
      },
      packing_diagram_url: PACKING_DIAGRAM_URL,
      cargo_lines: bin.lines.map((l) => ({
        skuid: l.skuid,
        cargo_name: l.cargo_name,
        pieces_total: l.pieces_total,
        pieces: l.pieces,
        color: l.color,
      })),
    }
  })

  return {
    status: 3,
    container_count: containers.length,
    is_full: containers.every((c) => c.cubic_meter.used_percent >= 60),
    containers,
  }
}
