import type { AiOp, PackingParams, PackingResult } from '@/types/packing'
import { CONTAINER_TYPES } from '@/mock/constants'
import { planPacking } from '@/mock/mockResult'
import { delay } from '@/mock/packingApi'

/** AI 思考时间(mock)：150~250ms */
function thinkMs(): number {
  return 150 + Math.round(Math.random() * 100)
}

/** 柜型名称简写(去空格)，如 "40 HC" -> "40HC" */
function containerLabel(params: PackingParams): string {
  return params.container.name.replace(/\s+/g, '')
}

/** 一句结果摘要 */
function summarize(result: PackingResult): string {
  const pieces = result.containers.reduce((s, c) => s + c.pieces_total, 0)
  const avg =
    result.containers.reduce((s, c) => s + c.cubic_meter.used_percent, 0) /
    result.containers.length
  return `重排完成：共 ${result.container_count} 柜 / ${pieces} 件，平均利用率 ${avg.toFixed(1)}%`
}

/** 根据意图生成用户侧一句话描述(供会话记录使用) */
export function describeAiOp(op: AiOp, params: PackingParams): string {
  switch (op.kind) {
    case 'qty': {
      const item = params.cargoList.find((c) => c.id === op.skuid)
      return `「${item?.name ?? '货物'}」数量调整为 ${op.qty}`
    }
    case 'add': {
      const item = params.cargoList.find((c) => c.id === op.optionId)
      return `追加「${item?.name ?? '货物'}」×${op.qty ?? 1}`
    }
    case 'remove': {
      const item = params.cargoList.find((c) => c.id === op.skuid)
      return `移除「${item?.name ?? '货物'}」`
    }
    case 'container':
      return `柜型切换为 ${op.containerId}`
    case 'replan':
      return '按最新配置重新规划'
  }
}

export interface AiStartReply {
  sessionId: string
  result: PackingResult
  /** AI 应用意图后的完整参数(由调用方写回 store) */
  params: PackingParams
  reply: string
}

/**
 * 首次装柜：AI 接收完整参数，规划装柜方案并给出说明。
 */
export async function startAiPacking(params: PackingParams): Promise<AiStartReply> {
  await delay(thinkMs())
  const result = planPacking(params)
  const avg =
    result.containers.reduce((s, c) => s + c.cubic_meter.used_percent, 0) /
    result.containers.length
  const weightKg = params.cargoList.reduce((s, c) => s + c.weight * c.quantity, 0)
  const reply =
    `已按 ${containerLabel(params)} 完成规划：${params.cargoList.length} 项货物、` +
    `${weightKg.toFixed(1)}kg，用 ${result.container_count} 柜装完，平均体积利用率 ${avg.toFixed(1)}%。` +
    `可以直接在结果上继续调整（数量 / 追加 / 移除 / 换柜型），我会实时重排。`
  return {
    sessionId: `ai-${Date.now()}`,
    result,
    params: JSON.parse(JSON.stringify(params)) as PackingParams,
    reply,
  }
}

export type AiAdjustReply =
  | { result: PackingResult; params: PackingParams; reply: string }
  | { error: string }

/**
 * 后续调整：AI 在参数副本上应用一轮意图，重排并回复。
 * 成功时返回调整后的完整参数与结果，由调用方写回 store；
 * 失败时返回 error，store 原参数保持不变。
 */
export async function adjustAiPacking(
  _sessionId: string,
  op: AiOp,
  params: PackingParams,
): Promise<AiAdjustReply> {
  await delay(thinkMs())
  const draft = JSON.parse(JSON.stringify(params)) as PackingParams
  let desc: string

  switch (op.kind) {
    case 'qty': {
      const item = draft.cargoList.find((c) => c.id === op.skuid)
      if (!item) return { error: '装柜列表中没有找到该货物，无法调整数量。' }
      const qty = Math.floor(op.qty)
      if (!Number.isFinite(qty) || qty < 1) {
        return { error: '数量至少为 1，如需去掉该货物请使用移除。' }
      }
      item.quantity = qty
      desc = `已将「${item.name}」数量调整为 ${qty}`
      break
    }
    case 'add': {
      const item = draft.cargoList.find((c) => c.id === op.optionId)
      if (!item) return { error: '该货物不在装柜列表中，无法追加。' }
      const add = Math.max(1, Math.floor(op.qty ?? 1))
      item.quantity += add
      desc = `已追加「${item.name}」×${add}`
      break
    }
    case 'remove': {
      const idx = draft.cargoList.findIndex((c) => c.id === op.skuid)
      if (idx < 0) return { error: '该货物已不在装柜列表中。' }
      const gone = draft.cargoList[idx]!
      draft.cargoList.splice(idx, 1)
      desc = `已移除「${gone.name}」`
      break
    }
    case 'container': {
      const cont = CONTAINER_TYPES.find((t) => t.id === op.containerId)
      if (!cont) return { error: '未知的柜型。' }
      draft.container = cont
      desc = `柜型已切换为 ${cont.name}（容积 ${cont.volumeM3}m³）`
      break
    }
    case 'replan': {
      desc = '已按最新配置重新规划'
      break
    }
  }

  const result = planPacking(draft)
  return { result, params: draft, reply: `${desc}。${summarize(result)}` }
}
