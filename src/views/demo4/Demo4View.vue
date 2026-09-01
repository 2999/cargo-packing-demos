<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePackingStore } from '@/stores/packing'
import CargoListEditor from '@/components/CargoListEditor.vue'
import ResultsView from '@/components/ResultsView.vue'
import { formatHistoryTime } from '@/stores/packing'
import { fetchCargoLibrary } from '@/mock/packingApi'
import type { AiOp, CargoOption } from '@/types/packing'

/**
 * 方案四 · 单页磁贴 + AI 回执通知流：
 * 结果磁贴上内嵌货物 chips(−/＋/×)直接发意图，
 * AI 每轮调整以「小票回执」滑入右上角堆叠，几秒后自动收起。
 */
const store = usePackingStore()

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

function add(option: CargoOption) {
  store.addCargo(option)
  ElMessage.success(`已加入「${option.name}」`)
}

function loadHistory(id: string) {
  store.restoreHistory(id)
}

async function submit() {
  await store.runPacking()
}

/* ── AI 回执通知流 ── */
interface Receipt {
  id: number
  text: string
}
const receipts = ref<Receipt[]>([])
let receiptSeq = 0

function lastAiText(): string | null {
  const turns = store.aiSession.turns
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]!.role === 'ai') return turns[i]!.text
  }
  return null
}

async function adjust(op: AiOp) {
  const ok = await store.adjustAi(op)
  if (!ok) return
  const text = lastAiText()
  if (!text) return
  const id = ++receiptSeq
  receipts.value.push({ id, text })
  if (receipts.value.length > 3) receipts.value.shift()
  window.setTimeout(() => {
    receipts.value = receipts.value.filter((r) => r.id !== id)
  }, 3600)
}
</script>

<template>
  <div class="demo3">
    <!-- 主标题与提交操作 -->
    <div class="demo3__hero">
      <div>
        <h1>货柜装柜</h1>
        <p>配置货物与柜型，一键生成装柜效果与利用情况。</p>
      </div>
      <div class="demo3__hero-actions">
        <el-button size="large" @click="store.reset()">重置</el-button>
        <el-button type="primary" size="large" :loading="store.packing" @click="submit">
          开始装柜
        </el-button>
      </div>
    </div>

    <!-- 装柜列表磁贴 -->
    <section class="tile">
      <header class="tile__head">
        <span class="tile__title">装柜列表</span>
        <el-popover v-model:visible="popVisible" placement="bottom-end" :width="420" trigger="click">
          <template #reference>
            <el-button type="primary" size="small" data-testid="quick-pick">+ 选货物</el-button>
          </template>
          <div class="pick3">
            <el-input v-model="quickSearch" placeholder="搜索货物…" size="small" clearable />
            <div v-loading="loading" class="pick3__list">
              <div
                v-for="g in quickList"
                :key="g.id"
                class="pick3-row"
                @click="add(g)"
              >
                <i :style="{ backgroundColor: g.color }" />
                <div class="pick3-row__info">
                  <b>{{ g.name }}</b>
                  <span>{{ g.length }}×{{ g.width }}×{{ g.height }} · {{ g.weight }}kg</span>
                </div>
                <el-button circle size="small" type="primary">＋</el-button>
              </div>
              <div v-if="quickList.length === 0 && !loading" class="pick3__empty">
                没有匹配的货物
              </div>
            </div>
          </div>
        </el-popover>
      </header>
      <CargoListEditor />
    </section>

    <!-- 参数磁贴 -->
    <div class="demo3__params">
      <section class="tile">
        <header class="tile__head"><span class="tile__title">柜型</span></header>
        <el-select
          :model-value="store.params.container.id"
          size="large"
          style="width: 100%"
          @update:model-value="
            (id: string) => {
              const c = store.containerTypes.find((t) => t.id === id)
              if (c) store.setContainer(c)
            }
          "
        >
          <el-option
            v-for="t in store.containerTypes"
            :key="t.id"
            :label="`${t.name} · 容积 ${t.volumeM3} m³`"
            :value="t.id"
          />
        </el-select>
        <div class="tile__hint">
          内尺寸 {{ store.params.container.innerLength }}×{{ store.params.container.innerWidth }}×{{
            store.params.container.innerHeight
          }}
          mm
        </div>
      </section>

      <section class="tile">
        <header class="tile__head"><span class="tile__title">每箱溢出量 (mm)</span></header>
        <el-input-number
          v-model="store.params.overflowPerBox"
          :min="0"
          :max="200"
          size="large"
          controls-position="right"
          style="width: 100%"
        />
      </section>

      <section class="tile">
        <header class="tile__head"><span class="tile__title">最上层桌子叠放数</span></header>
        <el-input-number
          v-model="store.params.topTableStackCount"
          :min="0"
          :max="20"
          size="large"
          controls-position="right"
          style="width: 100%"
        />
      </section>

      <section class="tile">
        <header class="tile__head"><span class="tile__title">尺寸最大可调比例 (%)</span></header>
        <el-input-number
          v-model="store.params.maxAdjustRatio"
          :min="0"
          :max="100"
          size="large"
          controls-position="right"
          style="width: 100%"
        />
      </section>

      <section class="tile tile--wide">
        <header class="tile__head"><span class="tile__title">自定义内容</span></header>
        <el-input
          v-model="store.params.customContent"
          type="textarea"
          :rows="2"
          placeholder="请输入附加的装柜要求 / 备注"
        />
      </section>
    </div>

    <!-- 结果磁贴 + 微调 chips + AI 回执 -->
    <section class="tile tile--result">
      <header class="tile__head">
        <span class="tile__title">装柜结果</span>
      </header>

      <!-- AI 微调 chips：直接在结果上发意图 -->
      <div v-if="store.result" class="adj-chips" data-testid="adj-chips">
        <span class="adj-chips__label">AI 微调：</span>
        <div v-for="c in store.params.cargoList" :key="c.id" class="adj-chip">
          <i :style="{ backgroundColor: c.color }" />
          <span class="adj-chip__name">{{ c.name }}</span>
          <b>×{{ c.quantity }}</b>
          <button
            class="adj-chip__btn"
            data-testid="chip-less"
            :disabled="store.aiSession.thinking"
            title="减一件"
            @click="adjust({ kind: 'qty', skuid: c.id, qty: c.quantity - 1 })"
          >
            −
          </button>
          <button
            class="adj-chip__btn"
            data-testid="chip-more"
            :disabled="store.aiSession.thinking"
            title="加一件"
            @click="adjust({ kind: 'qty', skuid: c.id, qty: c.quantity + 1 })"
          >
            ＋
          </button>
          <button
            class="adj-chip__btn adj-chip__btn--danger"
            data-testid="chip-remove"
            :disabled="store.aiSession.thinking"
            title="移除"
            @click="adjust({ kind: 'remove', skuid: c.id })"
          >
            ×
          </button>
        </div>
      </div>

      <ResultsView />

      <!-- AI 回执堆叠 -->
      <div class="receipt-stack" data-testid="ai-receipts">
        <TransitionGroup name="receipt">
          <div v-if="store.aiSession.thinking" key="thinking" class="receipt receipt--thinking">
            <span class="receipt__title">AI 装柜助手 · 重排中</span>
            <span class="receipt__line" />
            <span class="receipt__line receipt__line--short" />
          </div>
          <div v-for="r in receipts" :key="r.id" class="receipt" data-testid="ai-receipt">
            <span class="receipt__title">🤖 AI 已处理</span>
            <span class="receipt__text">{{ r.text }}</span>
          </div>
        </TransitionGroup>
      </div>
    </section>

    <!-- 历史装柜磁贴(时间线) -->
    <section class="tile">
      <header class="tile__head">
        <span class="tile__title">历史装柜</span>
        <el-button
          v-if="store.history.length"
          link
          type="danger"
          size="small"
          @click="store.clearHistory()"
        >
          清空
        </el-button>
      </header>
      <el-timeline v-loading="store.historyLoading" class="demo3__timeline">
        <el-timeline-item
          v-for="item in store.history"
          :key="item.id"
          :timestamp="formatHistoryTime(item.time)"
          placement="top"
          :type="item.containerCount > 1 ? 'primary' : 'success'"
        >
          <div class="tl-card" @click="loadHistory(item.id)">
            <div class="tl-card__head">
              <el-tag size="small" effect="plain">{{ item.containerName }}</el-tag>
              <b>{{ item.containerCount }} 个柜</b>
              <span class="tl-card__util">均 {{ item.avgUsedPercent }}%</span>
              <el-button link type="primary" size="small">载入</el-button>
              <el-button link type="danger" size="small" @click.stop="store.removeHistory(item.id)">
                删除
              </el-button>
            </div>
            <div class="tl-card__meta">
              {{ item.cargoCount }} 项 / {{ item.piecesTotal }} 件 · {{ item.weightKg }} kg
            </div>
            <div class="tl-card__summary">{{ item.cargoSummary.join('、') }}</div>
          </div>
        </el-timeline-item>
      </el-timeline>
      <el-empty
        v-if="store.history.length === 0 && !store.historyLoading"
        description="暂无历史装柜"
        :image-size="60"
      />
    </section>

  </div>
</template>

<style scoped>
.demo3 {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.demo3__hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}
.demo3__hero h1 {
  font-size: 24px;
}
.demo3__hero p {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.demo3__hero-actions {
  display: flex;
  gap: 12px;
}
.tile {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 18px;
}
.tile__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.tile__title {
  font-size: 15px;
  font-weight: 600;
}
.tile__hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.demo3__params {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.tile--wide {
  grid-column: span 4;
}
.demo3__timeline {
  padding-left: 4px;
}
.tl-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color 0.15s;
  background: var(--el-bg-color);
}
.tl-card:hover {
  border-color: var(--el-color-primary-light-5);
}
.tl-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tl-card__head b {
  font-size: 13px;
}
.tl-card__util {
  font-size: 12px;
  color: var(--el-color-primary);
}
.tl-card__head .el-button {
  margin-left: 0;
}
.tl-card__head .el-button + .el-button {
  margin-left: 0;
}
.tl-card__meta {
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-top: 6px;
}
.tl-card__summary {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 快选浮层 */
.pick3 {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pick3__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
  min-height: 80px;
}
.pick3-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.pick3-row:hover {
  background: var(--el-fill-color-light);
}
.pick3-row i {
  width: 10px;
  height: 28px;
  border-radius: 3px;
  flex-shrink: 0;
}
.pick3-row__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pick3-row__info b {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pick3-row__info span {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.pick3__empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 16px 0;
}
/* 结果磁贴微调 chips */
.tile--result {
  position: relative;
}
.adj-chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.adj-chips__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.adj-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 18px;
  padding: 3px 8px;
  background: var(--el-bg-color);
  font-size: 12px;
}
.adj-chip i {
  width: 8px;
  height: 14px;
  border-radius: 2px;
}
.adj-chip__name {
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.adj-chip b {
  color: var(--el-color-primary);
}
.adj-chip__btn {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--el-border-color);
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.adj-chip__btn:hover:not(:disabled) {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.adj-chip__btn--danger:hover:not(:disabled) {
  border-color: var(--el-color-danger);
  color: var(--el-color-danger);
}
.adj-chip__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
/* AI 回执堆叠 */
.receipt-stack {
  position: absolute;
  right: 22px;
  bottom: 18px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 280px;
  pointer-events: none;
}
.receipt {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-left: 3px solid var(--el-color-success);
  border-radius: 8px;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.14);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.receipt--thinking {
  border-left-color: var(--el-color-warning);
}
.receipt__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}
.receipt__text {
  font-size: 12px;
  line-height: 1.5;
}
.receipt__line {
  height: 9px;
  border-radius: 5px;
  background: linear-gradient(90deg, var(--el-fill-color), var(--el-fill-color-dark), var(--el-fill-color));
  background-size: 200% 100%;
  animation: rcpt-shine 1.2s linear infinite;
}
.receipt__line--short {
  width: 55%;
}
@keyframes rcpt-shine {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}
.receipt-enter-active,
.receipt-leave-active {
  transition: all 0.3s ease;
}
.receipt-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.receipt-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.receipt-move {
  transition: transform 0.3s ease;
}
</style>
