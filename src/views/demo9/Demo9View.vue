<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePackingStore } from '@/stores/packing'
import CargoListEditor from '@/components/CargoListEditor.vue'
import ResultsView from '@/components/ResultsView.vue'
import HistoryList from '@/components/HistoryList.vue'
import { fetchCargoLibrary } from '@/mock/packingApi'
import { CARGO_DIRECTIONS } from '@/mock/constants'
import type { AiOp, CargoOption, SelectedCargo } from '@/types/packing'

/**
 * 方案九 · 全宽融合工作台：
 * 页面基底为方案一(左侧配置面板 + 右侧结果)但解除全站 1400px 限宽；
 * 历史装柜 = 方案五的抽屉范式；选货物 = 方案四的快选浮层；
 * 已选货物默认卡片流(方案一)，可切到方案三式表格勾选批量调整；
 * AI 批注替换为「AI 助手」：公式栏语法 × 建议指令 chips × 状态行回执。
 */
const store = usePackingStore()
const showHistory = ref(false)

/* ── 选货物：方案四快选浮层 ── */
const loading = ref(false)
const library = ref<CargoOption[]>([])
const popVisible = ref(false)
const quickSearch = ref('')

const quickList = computed(() => {
  const kw = quickSearch.value.trim().toLowerCase()
  if (!kw) return library.value.slice(0, 6)
  return library.value.filter((c) => c.name.toLowerCase().includes(kw)).slice(0, 6)
})

onMounted(() => {
  store.loadHistory()
  loading.value = true
  fetchCargoLibrary()
    .then((data) => (library.value = data))
    .finally(() => (loading.value = false))
})

function quickAdd(option: CargoOption) {
  store.addCargo(option)
  ElMessage.success(`已加入「${option.name}」`)
}

/* ── 已选货物：卡片流 ⇄ 表格视图 ── */
const viewMode = ref<'card' | 'table'>('card')
const selectedRows = ref<SelectedCargo[]>([])

function onSelectionChange(rows: SelectedCargo[]) {
  selectedRows.value = rows
}

function batchRemove() {
  const ids = new Set(selectedRows.value.map((r) => r.id))
  store.params.cargoList = store.params.cargoList.filter((c) => !ids.has(c.id))
  ElMessage.success(`已删除 ${ids.size} 项`)
  selectedRows.value = []
}

const batchQty = ref(1)

function batchSetQty() {
  for (const r of selectedRows.value) r.quantity = Math.max(1, Math.round(batchQty.value))
  ElMessage.success(`已将 ${selectedRows.value.length} 项数量设为 ${batchQty.value}`)
}

const batchDelta = ref(1)

function batchShift(sign: 1 | -1) {
  for (const r of selectedRows.value) r.quantity = Math.max(1, r.quantity + sign * batchDelta.value)
  ElMessage.success(`已${sign > 0 ? '加' : '减'} ${batchDelta.value} 件 × ${selectedRows.value.length} 项`)
}

const batchRotation = ref<string>('')

function batchSetRotation() {
  const dir = CARGO_DIRECTIONS.find((d) => d.key === batchRotation.value)
  if (!dir) return
  for (const r of selectedRows.value) r.rotation = dir
  ElMessage.success(`已将 ${selectedRows.value.length} 项旋转方向设为「${dir.label}」`)
}

function onRotateChange(row: SelectedCargo, key: string) {
  const dir = CARGO_DIRECTIONS.find((d) => d.key === key)
  if (dir) row.rotation = dir
}

/* ── 历史装柜：方案五抽屉范式 ── */
function loadHistory(id: string) {
  if (store.restoreHistory(id)) {
    ElMessage.success('已载入历史装柜')
    showHistory.value = false
    document.querySelector('.demo9-result')?.scrollIntoView({ behavior: 'smooth' })
  }
}

async function submit() {
  const ok = await store.runPacking()
  if (ok) {
    ElMessage.success('AI 装柜完成')
    document.querySelector('.demo9-result')?.scrollIntoView({ behavior: 'smooth' })
  }
}

/* ── AI 助手：公式栏语法 × 建议指令 chips × 状态行回执 ── */
const formula = ref('')
/** 预留错误提示位(freeform 兜底后基本不会触发，保留供 AI 回执失败提示扩展) */
const formulaError = ref('')

const suggestions = computed<{ label: string; op: AiOp }[]>(() => {
  const list: { label: string; op: AiOp }[] = []
  const first = store.params.cargoList[0]
  if (first) {
    const short = first.name.split(' ').pop()!
    list.push({
      label: `${short} 再加 10 件`,
      op: { kind: 'qty', skuid: first.id, qty: first.quantity + 10 },
    })
    if (first.quantity > 10) {
      list.push({
        label: `${short} 减 10 件`,
        op: { kind: 'qty', skuid: first.id, qty: first.quantity - 10 },
      })
    }
  }
  const other = store.containerTypes.find((c) => c.id !== store.params.container.id)
  if (other) {
    list.push({ label: `换 ${other.name} 试试`, op: { kind: 'container', containerId: other.id } })
  }
  return list
})

function findCargo(fragment: string) {
  const low = fragment.trim().toLowerCase()
  if (!low) return null
  return (
    store.params.cargoList.find(
      (c) => c.name.toLowerCase().includes(low) || c.name.split(' ').pop()!.toLowerCase() === low,
    ) ?? null
  )
}

/** 解析公式：`+5 name` / `name -2` / `name=8` / `删除 name` / `柜型=40GP` / `重算` */
function parseFormula(text: string): AiOp | null {
  const t = text.trim()
  if (!t) return null
  if (/^(重算|重新生成|replan)$/i.test(t)) return { kind: 'replan' }
  const cm = t.match(/柜型\s*[=＝]?\s*(40\s?HC|40\s?GP|20\s?GP)/i)
  if (cm) {
    const id = cm[1]!.toUpperCase().replace(/\s+/g, '')
    if (store.containerTypes.some((c) => c.id === id)) return { kind: 'container', containerId: id }
  }
  const rm = t.match(/^(?:删除|移除|-)\s+(.+)$/i)
  if (rm) {
    const cargo = findCargo(rm[1]!)
    if (cargo) return { kind: 'remove', skuid: cargo.id }
  }
  const setM = t.match(/^(.+?)\s*[=＝]\s*(\d+)$/)
  if (setM) {
    const cargo = findCargo(setM[1]!)
    if (cargo) return { kind: 'qty', skuid: cargo.id, qty: Number(setM[2]) }
  }
  const pm = t.match(/^([+\-＋－])\s*(\d+)\s+(.+)$/) ?? t.match(/^(.+?)\s+([+\-＋－])\s*(\d+)$/)
  if (pm) {
    const isLeading = /^([+\-＋－])/.test(t)
    const sign = isLeading ? pm[1]! : pm[2]!
    const frag = isLeading ? pm[3]! : pm[1]!
    const cargo = findCargo(frag)
    if (cargo) {
      const delta = (sign === '-' || sign === '－' ? -1 : 1) * Number(isLeading ? pm[2] : pm[3])
      return { kind: 'qty', skuid: cargo.id, qty: Math.max(1, cargo.quantity + delta) }
    }
  }
  return null
}

/** 自由文本 → AiOp：先试公式语法，再按自然语言关键词理解，兜底重排。
 *  公式语法仅作为快捷方式，任何输入都能触发后续 AI 流程。 */
function freeformOp(text: string): AiOp {
  const strict = parseFormula(text)
  if (strict) return strict
  const nums = (text.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0)
  const add = /加|多|增|再来|plus|\+/i.test(text)
  const sub = /减|少|去掉|minus|−/.test(text)
  const low = text.toLowerCase()
  const cargo =
    store.params.cargoList.find((c) => low.includes(c.name.toLowerCase())) ??
    store.params.cargoList.find((c) => low.includes(c.name.split(' ').pop()!.toLowerCase())) ??
    store.params.cargoList.find((c) => text.includes(c.category)) ??
    null
  const container = store.containerTypes.find((c) =>
    low.toUpperCase().replace(/\s+/g, '').includes(c.id),
  )
  if (container && /柜|container/i.test(text)) return { kind: 'container', containerId: container.id }
  if (cargo && /删|移除|去掉/.test(text)) return { kind: 'remove', skuid: cargo.id }
  if (cargo && nums.length) {
    const n = nums[nums.length - 1]!
    if (add) return { kind: 'qty', skuid: cargo.id, qty: cargo.quantity + n }
    if (sub) return { kind: 'qty', skuid: cargo.id, qty: Math.max(1, cargo.quantity - n) }
    return { kind: 'qty', skuid: cargo.id, qty: n }
  }
  if (cargo && add) return { kind: 'qty', skuid: cargo.id, qty: cargo.quantity + 1 }
  if (cargo && sub) return { kind: 'qty', skuid: cargo.id, qty: Math.max(1, cargo.quantity - 1) }
  return { kind: 'replan' }
}

async function runFormula() {
  const text = formula.value.trim()
  if (!text) return
  /* 「全部/所有」批量指令：直接改清单后重排 */
  if (/全部|所有|每个|各/.test(text)) {
    const nums = (text.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0)
    const n = nums.length ? nums[nums.length - 1]! : 1
    const sub = /减|少|去掉/.test(text)
    for (const c of store.params.cargoList) {
      if (sub) c.quantity = Math.max(1, c.quantity - n)
      else if (/加|多|增|再来/.test(text)) c.quantity += n
      else if (nums.length) c.quantity = n
    }
    await store.adjustAi({ kind: 'replan' }, text)
    formula.value = ''
    return
  }
  await store.adjustAi(freeformOp(text), text)
  formula.value = ''
}

async function runSuggestion(s: { label: string; op: AiOp }) {
  formulaError.value = ''
  formula.value = s.label
  const ok = await store.adjustAi(s.op, s.label)
  if (ok) formula.value = ''
}

/* ── AI 助手双形态：嵌入页面 ⇄ 右下角聊天泡泡浮层 ── */
const consoleMode = ref<'inline' | 'float'>('inline')
const floatOpen = ref(false)

function popOutConsole() {
  consoleMode.value = 'float'
  floatOpen.value = true
}

function dockConsole() {
  consoleMode.value = 'inline'
  floatOpen.value = false
  nextTick(() => {
    document.querySelector('[data-testid="ai-console"]')?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  })
}
</script>

<template>
  <div class="demo9">
    <div class="demo9__body">
      <!-- 左侧配置面板(方案一基底) -->
      <div class="demo9__panel">
        <div class="panel-section">
          <div class="panel-section__title">
            <span>装柜列表</span>
            <div class="demo9__list-ops">
              <el-badge :value="store.history.length" :hidden="store.history.length === 0">
                <el-button size="small" data-testid="history-entry" @click="showHistory = true">
                  🕘 历史
                </el-button>
              </el-badge>
              <el-radio-group v-model="viewMode" size="small" data-testid="view-toggle">
                <el-radio-button value="card">卡片</el-radio-button>
                <el-radio-button value="table">表格</el-radio-button>
              </el-radio-group>
              <el-popover v-model:visible="popVisible" placement="bottom-end" :width="420" trigger="click">
                <template #reference>
                  <el-button type="primary" size="small" data-testid="quick-pick"> + 选货物 </el-button>
                </template>
                <div class="pick9">
                  <el-input v-model="quickSearch" placeholder="搜索货物…" size="small" clearable />
                  <div v-loading="loading" class="pick9__list">
                    <div v-for="g in quickList" :key="g.id" class="pick9-row" @click="quickAdd(g)">
                      <i :style="{ backgroundColor: g.color }" />
                      <div class="pick9-row__info">
                        <b>{{ g.name }}</b>
                        <span>{{ g.length }}×{{ g.width }}×{{ g.height }} · {{ g.weight }}kg</span>
                      </div>
                      <el-button circle size="small" type="primary">＋</el-button>
                    </div>
                    <div v-if="quickList.length === 0 && !loading" class="pick9__empty">
                      没有匹配的货物
                    </div>
                  </div>
                </div>
              </el-popover>
            </div>
          </div>

          <!-- 卡片流(默认，方案一) -->
          <CargoListEditor v-if="viewMode === 'card'" />

          <!-- 表格视图(方案三) + 批量调整 -->
          <div v-else class="demo9__table">
            <el-table :data="store.params.cargoList" border size="small" empty-text="暂未选择货物"
              @selection-change="onSelectionChange">
              <el-table-column type="selection" width="38" />
              <el-table-column type="index" label="#" width="42" />
              <el-table-column label="货物" min-width="150">
                <template #default="{ row }">
                  <div class="cell-cargo">
                    <span class="cell-cargo__swatch" :style="{ backgroundColor: row.color }" />
                    <span class="cell-cargo__name">{{ row.name }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="长" width="110">
                <template #default="{ row }">
                  <el-input-number :model-value="row.spec.length" :min="1" size="small" controls-position="right"
                    @update:model-value="(v: number | undefined) => (row.spec.length = v ?? 1)" />
                </template>
              </el-table-column>
              <el-table-column label="宽" width="110">
                <template #default="{ row }">
                  <el-input-number :model-value="row.spec.width" :min="1" size="small" controls-position="right"
                    @update:model-value="(v: number | undefined) => (row.spec.width = v ?? 1)" />
                </template>
              </el-table-column>
              <el-table-column label="高" width="110">
                <template #default="{ row }">
                  <el-input-number :model-value="row.spec.height" :min="1" size="small" controls-position="right"
                    @update:model-value="(v: number | undefined) => (row.spec.height = v ?? 1)" />
                </template>
              </el-table-column>
              <el-table-column label="数量" width="120">
                <template #default="{ row }">
                  <el-input-number :model-value="row.quantity" :min="1" size="small" controls-position="right"
                    @update:model-value="(v: number | undefined) => (row.quantity = v ?? 1)" />
                </template>
              </el-table-column>
              <el-table-column label="单件重(kg)" width="115">
                <template #default="{ row }">
                  <el-input-number :model-value="row.weight" :min="0" :step="0.1" size="small" controls-position="right"
                    @update:model-value="(v: number | undefined) => (row.weight = v ?? 0)" />
                </template>
              </el-table-column>
              <el-table-column label="旋转" width="120">
                <template #default="{ row }">
                  <el-select :model-value="row.rotation.key" size="small"
                    @update:model-value="(k: string) => onRotateChange(row, k)">
                    <el-option v-for="d in CARGO_DIRECTIONS" :key="d.key" :label="d.label" :value="d.key" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="备注" min-width="120">
                <template #default="{ row }">
                  <el-input :model-value="row.remark" size="small" placeholder="备注"
                    @update:model-value="(v: string) => (row.remark = v ?? '')" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="64" fixed="right">
                <template #default="{ $index }">
                  <el-button link type="danger" size="small" @click="store.removeCargo($index)">
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
            <!-- 批量操作条：置于表格下方 -->
            <div v-if="selectedRows.length" class="batch-bar" data-testid="batch-bar">
              <span class="batch-bar__count">已选 {{ selectedRows.length }} 项</span>
              <div class="batch-bar__ops">
                <el-input-number v-model="batchQty" :min="1" :max="999" size="small" controls-position="right"
                  style="width: 96px" />
                <el-button size="small" data-testid="batch-set" @click="batchSetQty">设为</el-button>
                <el-input-number v-model="batchDelta" :min="1" :max="999" size="small" controls-position="right"
                  style="width: 96px" />
                <el-button size="small" data-testid="batch-more" @click="batchShift(1)">＋N</el-button>
                <el-button size="small" data-testid="batch-less" @click="batchShift(-1)">−N</el-button>
                <el-select v-model="batchRotation" size="small" placeholder="旋转方向" style="width: 110px">
                  <el-option v-for="d in CARGO_DIRECTIONS" :key="d.key" :label="d.label" :value="d.key" />
                </el-select>
                <el-button size="small" :disabled="!batchRotation" data-testid="batch-rotate" @click="batchSetRotation">
                  旋转
                </el-button>
                <el-button size="small" type="danger" plain data-testid="batch-remove" @click="batchRemove">
                  删除
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <el-divider />

        <div class="panel-section">
          <div class="panel-section__title"><span>装柜参数</span></div>
          <div class="lane-params">
            <div class="lane-params__item">
              <span>柜型</span>
              <el-select :model-value="store.params.container.id" size="small" style="width: 120px" @update:model-value="
                (id: string) => {
                  const c = store.containerTypes.find((t) => t.id === id)
                  if (c) store.setContainer(c)
                }
              ">
                <el-option v-for="t in store.containerTypes" :key="t.id" :label="`${t.name} · ${t.volumeM3}m³`"
                  :value="t.id" />
              </el-select>
            </div>
            <div class="lane-params__item">
              <span>溢出 (mm)</span>
              <el-input-number v-model="store.params.overflowPerBox" :min="0" :max="200" size="small"
                controls-position="right" style="width: 96px" />
            </div>
            <div class="lane-params__item">
              <span>叠放数</span>
              <el-input-number v-model="store.params.topTableStackCount" :min="0" :max="20" size="small"
                controls-position="right" style="width: 84px" />
            </div>
            <div class="lane-params__item">
              <span>可调比例 (%)</span>
              <el-input-number v-model="store.params.maxAdjustRatio" :min="0" :max="100" size="small"
                controls-position="right" style="width: 96px" />
            </div>
          </div>
          <div class="lane-params__custom">
            <span>自定义内容</span>
            <el-input v-model="store.params.customContent" size="small" placeholder="附加装柜要求 / 备注" />
          </div>
        </div>

        <div class="panel-section__actions">
          <el-button size="large" @click="store.reset()">重置</el-button>
          <el-button type="primary" size="large" :loading="store.packing" style="flex: 1" data-testid="run-packing"
            @click="submit">
            开始装柜
          </el-button>
        </div>
      </div>

      <!-- 右侧结果区 -->
      <div class="demo9__result demo9-result">
        <ResultsView adjustable hide-download />

        <!-- AI 助手(对话记录 × 公式栏语法 × 建议 chips × 状态行回执) -->
        <section v-if="store.result && consoleMode === 'inline'" class="demo9__console" data-testid="ai-console">
          <div class="console-head">
            <span class="console-head__dot" />
            AI 助手
            <el-tag v-if="store.aiSession.round" size="small" effect="plain">
              第 {{ store.aiSession.round }} 轮
            </el-tag>
            <button class="console-head__mode" data-testid="console-pop" title="切换为右下角浮层"
              @click="popOutConsole">⤢泡泡模式</button>
          </div>
          <!-- AI 对话记录(方案五范式)：每轮指令与 AI 回复留痕 -->
          <TransitionGroup name="turn" tag="div" class="console-flow" data-testid="console-flow">
            <div v-for="t in store.aiSession.turns" :key="t.id" class="ai-turn" :class="`ai-turn--${t.role}`">
              <span class="ai-turn__who">{{ t.role === 'ai' ? '🤖 AI 装柜助手' : '我' }}</span>
              <p class="ai-turn__text">{{ t.text }}</p>
            </div>
            <div v-if="store.aiSession.thinking" key="thinking" class="ai-turn ai-turn--ai is-typing">
              <span class="ai-turn__who">🤖 AI 装柜助手 · 正在重排…</span>
              <span class="dots"><i /><i /><i /></span>
            </div>
          </TransitionGroup>
          <div class="console-chips">
            <button v-for="s in suggestions" :key="s.label" class="console-chip" data-testid="cmd-chip"
              :disabled="store.aiSession.thinking" @click="runSuggestion(s)">
              {{ s.label }}
            </button>
          </div>
          <div class="fx-bar" data-testid="cmd-bar">
            <el-input v-model="formula" class="fx-bar__input" size="small"
              placeholder="+5 桌子 · 沙发=8 · 删除 椅子 · 柜型=40GP · 重算" :disabled="store.aiSession.thinking"
              data-testid="cmd-input" @keyup.enter="runFormula" />
            <el-button type="primary" size="small" :disabled="store.aiSession.thinking" data-testid="cmd-run"
              @click="runFormula">
              执行
            </el-button>
          </div>
          <div class="fx-status" data-testid="cmd-status">
            <template v-if="store.aiSession.thinking">
              <span class="fx-status__label fx-status__label--busy">⌁ AI 计算中…</span>
            </template>
            <template v-else-if="formulaError">
              <span class="fx-status__label fx-status__label--err">✗ {{ formulaError }}</span>
            </template>
            <template v-else>
              <span class="fx-status__label fx-status__label--muted">
                输入公式指令或点击上方建议，AI 将重排当前方案
              </span>
            </template>
          </div>
        </section>
      </div>
    </div>

    <!-- 历史装柜抽屉(方案五范式) -->
    <el-drawer v-model="showHistory" title="历史装柜" size="480px">
      <HistoryList :items="store.history" :loading="store.historyLoading" @load="loadHistory"
        @remove="store.removeHistory" @clear="store.clearHistory" />
    </el-drawer>

    <!-- AI 助手 · 右下角聊天泡泡浮层 -->
    <template v-if="store.result && consoleMode === 'float'">
      <Transition name="float-pop">
        <section v-if="floatOpen" class="ai-float" data-testid="ai-float">
          <div class="console-head">
            <span class="console-head__dot" />
            AI 助手
            <el-tag v-if="store.aiSession.round" size="small" effect="plain">
              第 {{ store.aiSession.round }} 轮
            </el-tag>
            <button class="console-head__mode" data-testid="console-dock" title="嵌回页面" @click="dockConsole">
              ⤡ 嵌回页面
            </button>
          </div>
          <TransitionGroup name="turn" tag="div" class="console-flow console-flow--float" data-testid="float-flow">
            <div v-for="t in store.aiSession.turns" :key="t.id" class="ai-turn" :class="`ai-turn--${t.role}`">
              <span class="ai-turn__who">{{ t.role === 'ai' ? '🤖 AI 装柜助手' : '我' }}</span>
              <p class="ai-turn__text">{{ t.text }}</p>
            </div>
            <div v-if="store.aiSession.thinking" key="thinking" class="ai-turn ai-turn--ai is-typing">
              <span class="ai-turn__who">🤖 AI 装柜助手 · 正在重排…</span>
              <span class="dots"><i /><i /><i /></span>
            </div>
          </TransitionGroup>
          <div class="console-chips">
            <button v-for="s in suggestions" :key="s.label" class="console-chip" data-testid="float-cmd-chip"
              :disabled="store.aiSession.thinking" @click="runSuggestion(s)">
              {{ s.label }}
            </button>
          </div>
          <div class="fx-bar" data-testid="float-cmd-bar">
            <el-input v-model="formula" class="fx-bar__input" size="small"
              placeholder="+5 桌子 · 沙发=8 · 删除 椅子 · 柜型=40GP · 重算" :disabled="store.aiSession.thinking"
              data-testid="float-cmd-input" @keyup.enter="runFormula" />
            <el-button type="primary" size="small" :disabled="store.aiSession.thinking" data-testid="float-cmd-run"
              @click="runFormula">
              执行
            </el-button>
          </div>
          <div class="fx-status" data-testid="float-cmd-status">
            <template v-if="store.aiSession.thinking">
              <span class="fx-status__label fx-status__label--busy">⌁ AI 计算中…</span>
            </template>
            <template v-else-if="formulaError">
              <span class="fx-status__label fx-status__label--err">✗ {{ formulaError }}</span>
            </template>
            <template v-else>
              <span class="fx-status__label fx-status__label--muted">输入公式指令，AI 将重排当前方案</span>
            </template>
          </div>
        </section>
      </Transition>
      <!-- 泡泡入口 -->
      <button v-if="!floatOpen" class="ai-bubble" data-testid="ai-bubble" title="打开 AI 助手" @click="floatOpen = true">
        🤖
        <span v-if="store.aiSession.thinking" class="ai-bubble__pulse" />
        <span v-else-if="formulaError" class="ai-bubble__badge ai-bubble__badge--err">!</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.demo9 {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px;
}

.demo9__body {
  display: flex;
  align-items: flex-start;
  gap: 24px;
}

.demo9__panel {
  flex: 0 0 440px;
  position: sticky;
  top: 56px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 20px;
  max-height: calc(100vh - 56px);
  overflow-y: auto;
}

.panel-section__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
}

.demo9__list-ops {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-section__actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

/* 装柜参数(demo2 栏底参数表单范式) */
.lane-params {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.lane-params__item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.lane-params__item>span,
.lane-params__custom>span {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.lane-params__custom {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.demo9__result {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 表格视图 */
.demo9__table :deep(.el-input-number) {
  width: 100%;
}

.batch-bar {
  border: 1px solid var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
  border-radius: 8px;
  padding: 8px 10px;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.batch-bar__count {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.batch-bar__ops {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.batch-bar__ops .el-button+.el-button {
  margin-left: 0;
}

.cell-cargo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cell-cargo__swatch {
  width: 8px;
  height: 24px;
  border-radius: 2px;
  flex-shrink: 0;
}

.cell-cargo__name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 快选浮层(方案四) */
.pick9 {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pick9__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
  min-height: 80px;
}

.pick9-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.pick9-row:hover {
  background: var(--el-fill-color-light);
}

.pick9-row i {
  width: 10px;
  height: 28px;
  border-radius: 3px;
  flex-shrink: 0;
}

.pick9-row__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pick9-row__info b {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pick9-row__info span {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.pick9__empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 16px 0;
}

/* AI 助手 */
.demo9__console {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* AI 对话记录(方案五范式) */
.console-flow {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.ai-turn {
  max-width: 78%;
  border-radius: 10px;
  padding: 5px 10px;
  font-size: 12px;
  line-height: 1.5;
}

.ai-turn__who {
  display: block;
  font-size: 10px;
  color: var(--el-text-color-secondary);
  margin-bottom: 1px;
}

.ai-turn__text {
  margin: 0;
}

.ai-turn--ai {
  align-self: flex-start;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-top-left-radius: 4px;
}

.ai-turn--user {
  align-self: flex-end;
  background: var(--el-color-primary);
  color: #fff;
  border-top-right-radius: 4px;
}

.ai-turn--user .ai-turn__who {
  color: rgba(255, 255, 255, 0.75);
}

.dots {
  display: inline-flex;
  gap: 4px;
  padding: 2px 0;
}

.dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-text-color-secondary);
  animation: dot-bounce 1s infinite ease-in-out;
}

.dots i:nth-child(2) {
  animation-delay: 0.15s;
}

.dots i:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes dot-bounce {

  0%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }

  50% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

/* 会话轮次滑入 */
.turn-enter-active {
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.turn-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.console-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 0;
}

.console-head__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-success);
  box-shadow: 0 0 0 2px var(--el-color-success-light-8);
}

.console-head :deep(.el-tag) {
  height: 18px;
  padding: 0 6px;
  font-size: 10px;
  line-height: 16px;
}

.console-head__mode {
  margin-left: auto;
  border: 1px solid var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--el-color-primary);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.console-head__mode:hover {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}

.fx-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 6px;
  padding: 5px 10px;
  border: 1px solid var(--el-border-color-lighter);
  background: #dbdbdc;
}

.fx-bar__input :deep(.el-input__wrapper) {
  background: transparent;
  box-shadow: none;
}

.fx-bar__input :deep(.el-input__inner) {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  /* color: #e6edf3; */
  caret-color: #e811ef;
}

.fx-bar__input :deep(.el-input__inner::placeholder) {
  color: #6a7385;
}

.console-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.console-chip {
  border: 1px solid var(--el-color-primary-light-5);
  background: var(--el-bg-color);
  color: var(--el-color-primary);
  border-radius: 12px;
  font-size: 11px;
  padding: 3px 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.console-chip:hover:not(:disabled) {
  background: var(--el-color-primary);
  color: #fff;
}

.console-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fx-status {
  font-size: 11px;
  line-height: 1.5;
  min-height: 16px;
}

.fx-status__label {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: var(--el-color-success);
}

.fx-status__label--busy {
  color: var(--el-color-warning);
  animation: fx-blink 0.9s infinite;
}

.fx-status__label--err {
  color: var(--el-color-danger);
}

.fx-status__label--muted {
  color: var(--el-text-color-placeholder);
}

@keyframes fx-blink {
  50% {
    opacity: 0.4;
  }
}

/* ── AI 助手 · 右下角聊天泡泡浮层 ── */
.ai-float {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2000;
  width: 380px;
  height: 80vh;
  max-width: calc(100vw - 32px);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-float .console-head .console-head__mode {
  margin-left: auto;
}

.ai-float .console-flow--float {
  flex: 1;
  min-height: 0;
  max-height: none;
}

.ai-bubble {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2000;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(64, 128, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s;
}

.ai-bubble:hover {
  transform: scale(1.08);
}

.ai-bubble__pulse {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid var(--el-color-primary);
  animation: bubble-pulse 1.2s infinite ease-out;
}

.ai-bubble__badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  background: var(--el-color-danger);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

@keyframes bubble-pulse {
  from {
    transform: scale(1);
    opacity: 0.8;
  }

  to {
    transform: scale(1.5);
    opacity: 0;
  }
}

/* 浮层出入场 */
.float-pop-enter-active,
.float-pop-leave-active {
  transition: all 0.25s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.float-pop-enter-from,
.float-pop-leave-to {
  opacity: 0;
  transform: translateY(24px) scale(0.92);
}

/* 窄屏适配 */
@media (max-width: 1200px) {
  .demo9__panel {
    flex: 0 0 380px;
  }
}

@media (max-width: 980px) {
  .demo9__body {
    flex-direction: column;
  }

  .demo9__panel {
    flex: none;
    width: 100%;
    position: static;
    max-height: none;
  }

  .demo9__result {
    width: 100%;
  }
}
</style>
