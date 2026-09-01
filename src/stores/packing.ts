import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  AiOp,
  AiSession,
  ContainerType,
  PackingParams,
  PackingResult,
  SelectedCargo,
  PackingHistoryItem,
} from '@/types/packing'
import { CONTAINER_TYPES, CARGO_DIRECTIONS } from '@/mock/constants'
import { fetchContainerTypes, fetchPackingHistory } from '@/mock/packingApi'
import { startAiPacking, adjustAiPacking, describeAiOp } from '@/mock/aiPacking'
import { ElMessage } from 'element-plus'

/** 一份默认装柜配置 */
export function createDefaultParams(): PackingParams {
  return {
    cargoList: [],
    container: CONTAINER_TYPES[0]!,
    overflowPerBox: 10,
    topTableStackCount: 2,
    maxAdjustRatio: 5,
    customContent: '',
  }
}

/** 历史记录时间格式化 */
export function formatHistoryTime(time: number): string {
  const d = new Date(time)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const usePackingStore = defineStore('packing', () => {
  /** 当前装柜配置 */
  const params = ref<PackingParams>(createDefaultParams())
  /** 最近一次装柜结果 */
  const result = ref<PackingResult | null>(null)
  /** 提交中状态 */
  const packing = ref(false)
  /** 柜型列表 */
  const containerTypes = ref<ContainerType[]>([...CONTAINER_TYPES])
  /** 是否已加载柜型 */
  const containersLoaded = ref(false)
  /** 历史装柜列表 */
  const history = ref<PackingHistoryItem[]>([])
  /** 是否已加载历史 */
  const historyLoaded = ref(false)
  /** 历史加载中 */
  const historyLoading = ref(false)
  /** AI 多轮会话状态 */
  const aiSession = ref<AiSession>({
    sessionId: null,
    round: 0,
    thinking: false,
    turns: [],
  })
  let turnSeq = 0

  function pushAiTurn(role: 'user' | 'ai', text: string): void {
    aiSession.value.turns.push({ id: ++turnSeq, role, text, time: Date.now() })
  }

  function freshAiSession(): AiSession {
    return { sessionId: null, round: 0, thinking: false, turns: [] }
  }

  /** 会话中插入一轮兜底问答(不触发重排)，用于无法识别的指令 */
  function aiFallback(userText: string, aiText: string): void {
    pushAiTurn('user', userText)
    pushAiTurn('ai', aiText)
  }

  async function loadContainerTypes(): Promise<void> {
    if (containersLoaded.value) return
    try {
      containerTypes.value = await fetchContainerTypes()
    } finally {
      containersLoaded.value = true
    }
  }

  /** 加载历史装柜列表(mock,只加载一次) */
  async function loadHistory(): Promise<void> {
    if (historyLoaded.value || historyLoading.value) return
    historyLoading.value = true
    try {
      history.value = await fetchPackingHistory()
      historyLoaded.value = true
    } finally {
      historyLoading.value = false
    }
  }

  /** 从货物库添加一条货物到装柜列表(默认参数) */
  function addCargo(option: import('@/types/packing').CargoOption) {
    const existing = params.value.cargoList.find((c) => c.id === option.id)
    if (existing) {
      existing.quantity += 1
      return
    }
    const newItem: SelectedCargo = {
      id: option.id,
      name: option.name,
      category: option.category,
      unit: option.unit,
      spec: {
        length: option.length,
        width: option.width,
        height: option.height,
      },
      weight: option.weight,
      quantity: 1,
      rotation: CARGO_DIRECTIONS[0]!,
      color: option.color,
      imageUrl: option.imageUrl,
      remark: '',
    }
    params.value.cargoList.push(newItem)
  }

  function removeCargo(index: number) {
    params.value.cargoList.splice(index, 1)
  }

  function clearCargo() {
    params.value.cargoList = []
  }

  function setContainer(container: ContainerType) {
    params.value.container = container
  }

  /** 载入一条历史记录：恢复当时的参数与结果，并续接 AI 会话 */
  function restoreHistory(id: string): boolean {
    const item = history.value.find((h) => h.id === id)
    if (!item) return false
    params.value = JSON.parse(JSON.stringify(item.params)) as PackingParams
    result.value = JSON.parse(JSON.stringify(item.result)) as PackingResult
    aiSession.value = {
      sessionId: null,
      round: item.round ?? 1,
      thinking: false,
      turns: [],
    }
    pushAiTurn('ai', `已载入历史装柜方案（${item.containerName} · ${item.containerCount} 柜），可在此基础上继续调整。`)
    return true
  }

  /** 删除一条历史记录 */
  function removeHistory(id: string) {
    const idx = history.value.findIndex((h) => h.id === id)
    if (idx >= 0) history.value.splice(idx, 1)
  }

  /** 清空历史记录 */
  function clearHistory() {
    history.value = []
  }

  /** 重置整个配置 */
  function reset() {
    params.value = createDefaultParams()
    result.value = null
    packing.value = false
    aiSession.value = freshAiSession()
  }

  /**
   * AI 装柜(首轮)：把当前清单交给 AI 规划，结果与会话一并写入。
   */
  async function runPacking(): Promise<boolean> {
    if (params.value.cargoList.length === 0) {
      ElMessage.warning('请先选择货物')
      return false
    }
    packing.value = true
    aiSession.value.thinking = true
    try {
      const pieceCount = params.value.cargoList.reduce((s, c) => s + c.quantity, 0)
      pushAiTurn('user', `开始装柜：${params.value.cargoList.length} 项货物 / ${pieceCount} 件，柜型 ${params.value.container.name}`)
      const reply = await startAiPacking(JSON.parse(JSON.stringify(params.value)))
      params.value = reply.params
      result.value = reply.result
      aiSession.value.sessionId = reply.sessionId
      aiSession.value.round = 1
      pushAiTurn('ai', reply.reply)
      pushHistory(params.value, result.value, 1)
      return true
    } catch {
      ElMessage.error('AI 装柜失败，请稍后重试')
      return false
    } finally {
      packing.value = false
      aiSession.value.thinking = false
    }
  }

  /**
   * AI 调整(后续轮)：发送一条结构化意图，AI 应用后重排。
   * 成功返回 true；失败时参数保持原样。
   */
  async function adjustAi(op: AiOp, label?: string): Promise<boolean> {
    if (aiSession.value.thinking || packing.value) return false
    if (!result.value) {
      ElMessage.warning('请先生成一次装柜结果')
      return false
    }
    aiSession.value.thinking = true
    try {
      const sessionId = aiSession.value.sessionId ?? 'ai-resumed'
      const desc = label ?? describeAiOp(op, params.value)
      pushAiTurn('user', desc)
      const reply = await adjustAiPacking(sessionId, op, JSON.parse(JSON.stringify(params.value)))
      if ('error' in reply) {
        ElMessage.warning(reply.error)
        // 撤回这条用户轮次
        aiSession.value.turns.pop()
        return false
      }
      params.value = reply.params
      result.value = reply.result
      aiSession.value.round += 1
      pushAiTurn('ai', reply.reply)
      pushHistory(params.value, result.value, aiSession.value.round)
      return true
    } catch {
      ElMessage.error('AI 调整失败，请稍后重试')
      return false
    } finally {
      aiSession.value.thinking = false
    }
  }

  /** 把一次装柜写入历史(置顶,最多保留 20 条) */
  function pushHistory(
    paramsSnapshot: PackingParams,
    resultSnapshot: PackingResult,
    round: number,
  ) {
    const item: PackingHistoryItem = {
      id: `h-${Date.now()}`,
      time: Date.now(),
      containerName: paramsSnapshot.container.name,
      cargoCount: paramsSnapshot.cargoList.length,
      piecesTotal: resultSnapshot.containers.reduce((sum, c) => sum + c.pieces_total, 0),
      weightKg:
        Math.round(
          paramsSnapshot.cargoList.reduce((sum, c) => sum + c.weight * c.quantity, 0) * 10,
        ) / 10,
      containerCount: resultSnapshot.container_count,
      avgUsedPercent:
        resultSnapshot.containers.length > 0
          ? Math.round(
              resultSnapshot.containers.reduce((sum, c) => sum + c.cubic_meter.used_percent, 0) /
                resultSnapshot.containers.length,
            )
          : 0,
      cargoSummary: paramsSnapshot.cargoList.slice(0, 3).map((c) => `${c.name} ×${c.quantity}`),
      round,
      params: JSON.parse(JSON.stringify(paramsSnapshot)) as PackingParams,
      result: JSON.parse(JSON.stringify(resultSnapshot)) as PackingResult,
    }
    history.value.unshift(item)
    if (history.value.length > 20) history.value.pop()
  }

  return {
    params,
    result,
    packing,
    containerTypes,
    containersLoaded,
    history,
    historyLoaded,
    historyLoading,
    aiSession,
    loadContainerTypes,
    loadHistory,
    addCargo,
    removeCargo,
    clearCargo,
    setContainer,
    reset,
    runPacking,
    adjustAi,
    aiFallback,
    restoreHistory,
    removeHistory,
    clearHistory,
  }
})
