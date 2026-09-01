import type {
  CargoOption,
  ContainerType,
  PackingParams,
  PackingRequest,
  PackingResult,
  PackingHistoryItem,
} from '@/types/packing'
import { CARGO_LIBRARY, CONTAINER_TYPES, CARGO_DIRECTIONS } from '@/mock/constants'
import { planPacking } from '@/mock/mockResult'

/** 模拟网络延迟 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 货物列表(内置 mock 库通过 promise 返回)
 */
export function fetchCargoLibrary(): Promise<CargoOption[]> {
  return delay(100).then(() => CARGO_LIBRARY)
}

/**
 * 柜型列表(通过 promise 返回)
 */
export function fetchContainerTypes(): Promise<ContainerType[]> {
  return delay(100).then(() => CONTAINER_TYPES)
}

/**
 * 提交拼柜(mock)。按货物清单确定性规划装柜结果。
 */
export function submitPacking(request: PackingRequest): Promise<PackingResult> {
  return delay(200).then(() => planPacking(request.params))
}

/**
 * 生成装柜顺序 PDF(mock)。返回一个伪下载链接。
 */
export function downloadPackingOrder(_request: PackingRequest): Promise<{ url: string }> {
  return delay(200).then(() => ({
    url: `https://mock.example.com/packing-order-${Date.now()}.pdf`,
  }))
}

/**
 * 生成装柜结果 PDF(单个柜,mock)。返回一个伪下载链接。
 */
export function downloadPackingResult(
  _params: PackingParams,
  containerIndex: number,
): Promise<{ url: string }> {
  return delay(200).then(() => ({
    url: `https://mock.example.com/packing-result-${containerIndex}-${Date.now()}.pdf`,
  }))
}

/** 把货物库中的一项转成已选货物(数量可指定) */
function pickCargo(optionId: number, quantity: number) {
  const option = CARGO_LIBRARY.find((c) => c.id === optionId)
  if (!option) return null
  return {
    id: option.id,
    name: option.name,
    category: option.category,
    unit: option.unit,
    spec: { length: option.length, width: option.width, height: option.height },
    weight: option.weight,
    quantity,
    rotation: { ...CARGO_DIRECTIONS[0]! },
    color: option.color,
    remark: '',
  }
}

/** 由货物勾选生成一份参数(其余参数取默认) */
function buildParams(containerId: string, picks: [number, number][]): PackingParams {
  const container = CONTAINER_TYPES.find((t) => t.id === containerId) ?? CONTAINER_TYPES[0]!
  return {
    cargoList: picks
      .map(([id, qty]) => pickCargo(id, qty))
      .filter((c): c is NonNullable<typeof c> => c !== null),
    container,
    overflowPerBox: 10,
    topTableStackCount: 2,
    maxAdjustRatio: 5,
    customContent: '',
  }
}

/** 由参数生成一条历史装柜记录(mock) */
function buildHistoryItem(
  id: string,
  time: number,
  containerId: string,
  picks: [number, number][],
): PackingHistoryItem {
  const params = buildParams(containerId, picks)
  const result = planPacking(params)
  return {
    id,
    time,
    containerName: params.container.name,
    cargoCount: params.cargoList.length,
    piecesTotal: result.containers.reduce((sum, c) => sum + c.pieces_total, 0),
    weightKg:
      Math.round(params.cargoList.reduce((sum, c) => sum + c.weight * c.quantity, 0) * 10) / 10,
    containerCount: result.container_count,
    avgUsedPercent:
      Math.round(
        result.containers.reduce((sum, c) => sum + c.cubic_meter.used_percent, 0) /
          result.containers.length,
      ) || 0,
    cargoSummary: params.cargoList.slice(0, 3).map((c) => `${c.name} ×${c.quantity}`),
    round: 1,
    params,
    result,
  }
}

/**
 * 历史装柜列表(mock)。预置三条历史记录，时间由近及远。
 * 货物量经过校准，三条记录在各自柜型下均为 3 柜结果。
 */
export function fetchPackingHistory(): Promise<PackingHistoryItem[]> {
  const now = Date.now()
  return delay(100).then(() => [
    buildHistoryItem('h-1', now - 2 * 3600_000, '40HC', [
      [4, 60],
      [11, 6],
    ]),
    buildHistoryItem('h-2', now - 26 * 3600_000, '20GP', [
      [10, 26],
      [3, 12],
      [12, 40],
      [14, 30],
    ]),
    buildHistoryItem('h-3', now - 3 * 24 * 3600_000, '40GP', [
      [4, 50],
      [7, 10],
      [1, 12],
    ]),
  ])
}
