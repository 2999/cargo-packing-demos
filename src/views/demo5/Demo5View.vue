<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePackingStore } from '@/stores/packing'
import CargoListEditor from '@/components/CargoListEditor.vue'
import PackingFormFields from '@/components/PackingFormFields.vue'
import ResultsView from '@/components/ResultsView.vue'
import HistoryList from '@/components/HistoryList.vue'
import { fetchCargoLibrary } from '@/mock/packingApi'
import type { AiOp, CargoOption } from '@/types/packing'

/**
 * 方案五 · 分步向导：
 * 选货=内嵌货架网格；结果步引入「AI 建议卡片对话」——
 * AI 每轮回复后给出 2~3 个建议操作按钮，点选即发意图重排，
 * 也支持自然语言输入兜底。
 */
const store = usePackingStore()
const step = ref(1)
const showHistory = ref(false)

const loading = ref(false)
const library = ref<CargoOption[]>([])
const selectedMap = computed(() => {
  const map = new Map<number, number>()
  for (const c of store.params.cargoList) map.set(c.id, c.quantity)
  return map
})

onMounted(() => {
  store.loadHistory()
  loading.value = true
  fetchCargoLibrary()
    .then((data) => (library.value = data))
    .finally(() => (loading.value = false))
})

function addOrBump(option: CargoOption) {
  store.addCargo(option)
  const n = selectedMap.value.get(option.id) ?? 0
  ElMessage.success(`已加入「${option.name}」×${n + 1}`)
}

const totalWeight = computed(() =>
  store.params.cargoList.reduce((sum, c) => sum + c.weight * c.quantity, 0),
)

function loadHistory(id: string) {
  if (store.restoreHistory(id)) {
    ElMessage.success('已载入历史装柜')
    showHistory.value = false
    step.value = 3
  }
}

async function submitAndNext() {
  const ok = await store.runPacking()
  if (ok) {
    ElMessage.success('AI 装柜完成')
    step.value = 3
  } else {
    step.value = 1
  }
}

function restart() {
  store.reset()
  step.value = 1
}

/* ── 顶部步骤条点击跳转(按流程校验，不可达时提示) ── */
const canGo = (n: number) =>
  n === 1 || (n === 2 && store.params.cargoList.length > 0) || (n === 3 && !!store.result)

function gotoStep(n: number) {
  if (canGo(n)) {
    step.value = n
    return
  }
  ElMessage.info(n === 2 ? '请先在第一步选择货物' : '请先提交装柜生成结果')
}

/* ── AI 建议卡片对话 ── */
const freeText = ref('')

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

function findCargo(text: string) {
  const low = text.toLowerCase()
  return store.params.cargoList.find(
    (c) => low.includes(c.name.toLowerCase()) || low.includes(c.name.split(' ')[0]!.toLowerCase()),
  )
}

/** 极简自然语言解析：换柜型 / ±N 件 / =N 件 */
function parseFree(text: string): AiOp | null {
  const t = text.trim()
  if (!t) return null
  const cm = t.match(/40\s?HC|40\s?GP|20\s?GP/i)
  if (cm && /换|改|柜型|用/.test(t)) {
    const id = cm[0]!.toUpperCase().replace(/\s+/g, '')
    if (store.containerTypes.some((c) => c.id === id)) {
      return { kind: 'container', containerId: id }
    }
  }
  const cargo = findCargo(t)
  if (!cargo) return null
  const setM = t.match(/=\s*(\d+)/)
  if (setM) return { kind: 'qty', skuid: cargo.id, qty: Number(setM[1]) }
  const dm = t.match(/(?:加|多|[+＋])\s*(\d+)|(?:减|少|[-−－])\s*(\d+)/)
  if (dm) {
    const down = /减|少|[-−－]/.test(dm[0]!)
    const delta = (down ? -1 : 1) * Number(down ? dm[2] : dm[1])
    return { kind: 'qty', skuid: cargo.id, qty: Math.max(1, cargo.quantity + delta) }
  }
  return null
}

async function onSuggest(s: { label: string; op: AiOp }) {
  await store.adjustAi(s.op, s.label)
}

async function onFree() {
  const text = freeText.value.trim()
  if (!text) return
  freeText.value = ''
  const op = parseFree(text)
  if (op) {
    await store.adjustAi(op, text)
  } else {
    store.aiFallback(
      text,
      '这条我还没学会 😅 试试点击下面的建议按钮，或输入「货物名 +10 / -10 / =数字」。',
    )
  }
}
</script>

<template>
  <div class="demo2">
    <div class="demo2__topbar">
      <el-badge :value="store.history.length" :hidden="store.history.length === 0">
        <el-button @click="showHistory = true">🕘 历史装柜</el-button>
      </el-badge>
    </div>

    <el-steps :active="step" align-center finish-status="success" class="demo2__steps">
      <el-step
        title="选择货物"
        description="添加并设置待装货物"
        class="is-clickable"
        @click="gotoStep(1)"
      />
      <el-step
        title="柜型与参数"
        description="柜型、溢出量、叠放等"
        :class="{ 'is-clickable': canGo(2) }"
        @click="gotoStep(2)"
      />
      <el-step
        title="查看结果"
        description="装柜效果与利用情况"
        :class="{ 'is-clickable': canGo(3) }"
        @click="gotoStep(3)"
      />
    </el-steps>

    <!-- Step 1: 选货物(内嵌货架网格) -->
    <div v-if="step === 1" class="demo2__panel">
      <div class="demo2__panel-head">
        <h3>选择货物</h3>
        <el-tag type="info">已选 {{ store.params.cargoList.length }} 项</el-tag>
      </div>
      <div class="demo2__pick">
        <div class="demo2__shelf">
          <div class="demo2__shelf-title">货物库 · 点击卡片加入，再点数量 +1</div>
          <div v-loading="loading" class="shelf-grid">
            <div
              v-for="g in library"
              :key="g.id"
              class="shelf-card"
              :class="{ 'is-on': selectedMap.has(g.id) }"
              @click="addOrBump(g)"
            >
              <span class="shelf-card__thumb" :style="{ backgroundColor: g.color }">
                {{ g.name.slice(0, 2) }}
              </span>
              <span class="shelf-card__name">{{ g.name }}</span>
              <span class="shelf-card__meta">
                {{ g.length }}×{{ g.width }}×{{ g.height }} · {{ g.weight }}kg/{{ g.unit }}
              </span>
              <span v-if="selectedMap.has(g.id)" class="shelf-card__qty">
                ×{{ selectedMap.get(g.id) }}
              </span>
              <span v-else class="shelf-card__plus">＋</span>
            </div>
          </div>
        </div>
        <div class="demo2__chosen">
          <div class="demo2__shelf-title">已选清单 · 可改数量与规格</div>
          <CargoListEditor />
        </div>
      </div>
      <div class="demo2__panel-foot">
        <el-button type="primary" :disabled="store.params.cargoList.length === 0" @click="step = 2">
          下一步：柜型与参数
        </el-button>
      </div>
    </div>

    <!-- Step 2: 柜型与参数 -->
    <div v-else-if="step === 2" class="demo2__panel">
      <div class="demo2__panel-head">
        <h3>柜型与装柜参数</h3>
        <el-tag v-if="store.params.cargoList.length" type="info">
          已选 {{ store.params.cargoList.length }} 项货物
        </el-tag>
      </div>
      <div class="demo2__summary">
        <span v-for="c in store.params.cargoList" :key="c.id" class="demo2__chip">
          <i :style="{ backgroundColor: c.color }" /> {{ c.name }} ×{{ c.quantity }}
        </span>
        <span v-if="!store.params.cargoList.length" class="demo2__muted">还没有货物</span>
        <span class="demo2__weight">合计约 {{ totalWeight.toFixed(1) }} kg</span>
      </div>
      <PackingFormFields />
      <div class="demo2__panel-foot">
        <el-button @click="step = 1">上一步</el-button>
        <el-button type="primary" :loading="store.packing || store.aiSession.thinking" @click="submitAndNext">
          {{ store.result ? '重新提交装柜' : '提交装柜' }}
        </el-button>
      </div>
    </div>

    <!-- Step 3: 结果 + AI 建议卡片对话 -->
    <div v-else class="demo2__panel demo2__panel--result">
      <div class="demo2__panel-head">
        <h3>装柜结果 · AI 对话调整</h3>
        <div class="demo2__head-ops">
          <el-button @click="step = 2">返回上一步调整</el-button>
          <el-button data-testid="restart" @click="restart">重新开始</el-button>
        </div>
      </div>

      <!-- AI 会话卡片 -->
      <section class="demo2__ai" data-testid="ai-chat">
        <TransitionGroup name="turn" tag="div" class="ai-flow">
          <div
            v-for="t in store.aiSession.turns"
            :key="t.id"
            class="ai-turn"
            :class="`ai-turn--${t.role}`"
          >
            <span class="ai-turn__who">{{ t.role === 'ai' ? '🤖 AI 装柜助手' : '我' }}</span>
            <p class="ai-turn__text">{{ t.text }}</p>
          </div>
          <div v-if="store.aiSession.thinking" key="thinking" class="ai-turn ai-turn--ai is-typing">
            <span class="ai-turn__who">🤖 AI 装柜助手 · 正在重排…</span>
            <span class="dots"><i /><i /><i /></span>
          </div>
        </TransitionGroup>
        <div class="ai-suggest">
          <button
            v-for="s in suggestions"
            :key="s.label"
            class="ai-suggest__btn"
            data-testid="ai-suggest"
            :disabled="store.aiSession.thinking"
            @click="onSuggest(s)"
          >
            {{ s.label }}
          </button>
        </div>
        <div class="ai-free">
          <el-input
            v-model="freeText"
            placeholder="也可以直接输入，如「Table +10」「换 20GP」"
            :disabled="store.aiSession.thinking"
            @keyup.enter="onFree"
          />
          <el-button type="primary" :disabled="store.aiSession.thinking" @click="onFree">
            发送
          </el-button>
        </div>
      </section>

      <ResultsView visual />
    </div>

    <!-- 历史装柜抽屉 -->
    <el-drawer v-model="showHistory" title="历史装柜" size="480px">
      <HistoryList
        :items="store.history"
        :loading="store.historyLoading"
        @load="loadHistory"
        @remove="store.removeHistory"
        @clear="store.clearHistory"
      />
    </el-drawer>
  </div>
</template>

<style scoped>
.demo2 {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.demo2__topbar {
  display: flex;
  justify-content: flex-end;
}
.demo2__steps {
  margin-bottom: 8px;
}
.demo2__steps :deep(.el-step.is-clickable) {
  cursor: pointer;
}
.demo2__steps :deep(.el-step.is-clickable:hover .el-step__title) {
  color: var(--el-color-primary);
}
.demo2__panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 24px;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}
.demo2__panel--result {
  max-width: none;
}
.demo2__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.demo2__panel-head h3 {
  font-size: 18px;
}
.demo2__head-ops {
  display: flex;
  gap: 10px;
}
/* AI 建议卡片对话 */
.demo2__ai {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-fill-color-lighter);
  padding: 14px 16px;
  margin-bottom: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ai-flow {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 280px;
  overflow-y: auto;
}
.ai-turn {
  max-width: 78%;
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.6;
}
.ai-turn__who {
  display: block;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-bottom: 2px;
}
.ai-turn__text {
  margin: 0;
}
.ai-turn--ai {
  align-self: flex-start;
  background: var(--el-bg-color);
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
  padding: 4px 0;
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
.ai-suggest {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ai-suggest__btn {
  border: 1px solid var(--el-color-primary-light-5);
  background: var(--el-bg-color);
  color: var(--el-color-primary);
  border-radius: 16px;
  font-size: 12px;
  padding: 5px 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.ai-suggest__btn:hover:not(:disabled) {
  background: var(--el-color-primary);
  color: #fff;
}
.ai-suggest__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ai-free {
  display: flex;
  gap: 10px;
}
.ai-free .el-input {
  flex: 1;
}
/* 会话轮次滑入 */
.turn-enter-active {
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.turn-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.demo2__panel-foot {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}
.demo2__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  margin-bottom: 18px;
}
.demo2__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 20px;
  padding: 3px 10px;
}
.demo2__chip i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.demo2__weight {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.demo2__muted {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}
/* Step1 内嵌货架 */
.demo2__pick {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 20px;
  align-items: start;
}
.demo2__shelf-title {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}
.shelf-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  min-height: 120px;
}
.shelf-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  user-select: none;
}
.shelf-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
}
.shelf-card.is-on {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.shelf-card__thumb {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.shelf-card__name {
  font-size: 13px;
  font-weight: 600;
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.shelf-card__meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.shelf-card__plus {
  position: absolute;
  right: 10px;
  top: 10px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px dashed var(--el-border-color);
  color: var(--el-text-color-secondary);
  font-size: 14px;
  line-height: 20px;
  text-align: center;
  transition: all 0.15s;
}
.shelf-card:hover .shelf-card__plus {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.shelf-card__qty {
  position: absolute;
  right: 10px;
  top: 10px;
  min-width: 22px;
  height: 22px;
  border-radius: 11px;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 12px;
  line-height: 22px;
  text-align: center;
  padding: 0 5px;
}
</style>
