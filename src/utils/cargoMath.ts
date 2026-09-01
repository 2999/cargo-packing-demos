import type { SelectedCargo } from '@/types/packing'

/** 单条货物总体积(m³) */
export function cargoVolumeM3(c: SelectedCargo): number {
  const { length, width, height } = c.spec
  return ((length * width * height) / 1e9) * c.quantity
}

/** 单条货物总重(kg) */
export function cargoWeightKg(c: SelectedCargo): number {
  return c.weight * c.quantity
}

export interface CargoTotals {
  items: number
  pieces: number
  weightKg: number
  volumeM3: number
}

/** 已选货物合计(件数/重量/体积) */
export function cargoTotals(list: SelectedCargo[]): CargoTotals {
  return {
    items: list.length,
    pieces: list.reduce((s, c) => s + c.quantity, 0),
    weightKg: Math.round(list.reduce((s, c) => s + cargoWeightKg(c), 0) * 10) / 10,
    volumeM3: Math.round(list.reduce((s, c) => s + cargoVolumeM3(c), 0) * 100) / 100,
  }
}
