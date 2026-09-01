import type { ContainerType, SelectedCargo } from '@/types/packing'

/** 可视化用箱体：x/y/z 为放置位置，d/w/h 为沿柜长/柜宽/高的尺寸(mm) */
export interface VisualBox {
  x: number
  y: number
  z: number
  d: number
  w: number
  h: number
  color: string
  name: string
}

/** 按旋转方向推导箱体三向尺寸：w 沿柜宽、d 沿柜长、h 竖直 */
export function boxDims(c: SelectedCargo): { d: number; w: number; h: number } {
  const spec: Record<string, number> = {
    length: c.spec.length,
    width: c.spec.width,
    height: c.spec.height,
  }
  const a = c.rotation.widthAxis
  const b = c.rotation.depthAxis
  const vert = (['length', 'width', 'height'] as const).find((k) => k !== a && k !== b) ?? 'height'
  return { w: spec[a]!, d: spec[b]!, h: spec[vert]! }
}

/**
 * 极点贪心装箱(mock 可视化用)：确定性算法，同一输入恒产生同一排布。
 * 依据真实货物规格与柜型内尺寸，生成柜内堆放位置，供 SVG 立体图渲染。
 */
export function buildPackingBoxes(
  container: ContainerType,
  cargoList: SelectedCargo[],
  seed = 0,
  maxBoxes = 160,
): VisualBox[] {
  const L = container.innerLength
  const W = container.innerWidth
  const H = container.innerHeight

  // 底面积大的先放，再按 seed 轮转起点，使各柜排布不同
  const items = cargoList
    .map((c, i) => ({ c, i, dims: boxDims(c) }))
    .sort((a, b) => b.dims.d * b.dims.w - a.dims.d * a.dims.w || a.i - b.i)
  const offset = items.length ? seed % items.length : 0
  const ordered = offset ? [...items.slice(offset), ...items.slice(0, offset)] : items

  const placed: VisualBox[] = []
  const hit = (b: VisualBox) =>
    placed.some(
      (p) =>
        b.x < p.x + p.d &&
        b.x + b.d > p.x &&
        b.y < p.y + p.w &&
        b.y + b.w > p.y &&
        b.z < p.z + p.h &&
        b.z + b.h > p.z,
    )
  const fits = (b: VisualBox) =>
    b.x >= 0 &&
    b.y >= 0 &&
    b.z >= 0 &&
    b.x + b.d <= L + 1 &&
    b.y + b.w <= W + 1 &&
    b.z + b.h <= H + 1

  outer: for (const { c, dims } of ordered) {
    for (let n = 0; n < c.quantity; n++) {
      // 候选位置：原点 + 每个已放箱体的三个扩展极点
      const cands: Array<[number, number, number]> = [[0, 0, 0]]
      for (const p of placed) {
        cands.push([p.x + p.d, p.y, p.z], [p.x, p.y + p.w, p.z], [p.x, p.y, p.z + p.h])
      }
      let ok = false
      for (const [x, y, z] of cands) {
        const box: VisualBox = { x, y, z, d: dims.d, w: dims.w, h: dims.h, color: c.color, name: c.name }
        if (fits(box) && !hit(box)) {
          placed.push(box)
          ok = true
          break
        }
      }
      if (!ok) break // 该货物已放不进，跳过剩余数量
      if (placed.length >= maxBoxes) break outer
    }
  }
  return placed
}

/** 等轴测投影：x=柜长(向右下)，y=柜宽(向左下)，z=向上 */
export function isoProject(x: number, y: number, z: number): [number, number] {
  return [(x - y) * Math.cos(Math.PI / 6), (x + y) * 0.5 - z]
}

/** 颜色提亮/加深：ratio > 0 提亮，< 0 加深 */
export function shade(hex: string, ratio: number): string {
  const m = hex.replace('#', '')
  const full = m.length === 3 ? m.split('').map((s) => s + s).join('') : m
  const num = parseInt(full, 16)
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  const t = ratio > 0 ? 255 : 0
  const p = Math.abs(ratio)
  const to2 = (v: number) => clamp(v + (t - v) * p).toString(16).padStart(2, '0')
  return `#${to2(r)}${to2(g)}${to2(b)}`
}
