<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePackingStore } from '@/stores/packing'
import { CARGO_DIRECTIONS } from '@/mock/constants'
import type { AiOp, CargoOption, SelectedCargo } from '@/types/packing'
import { fetchCargoLibrary } from '@/mock/packingApi'
import ResultsView from '@/components/ResultsView.vue'
import HistoryList from '@/components/HistoryList.vue'
import DirectionDiagram from '@/components/DirectionDiagram.vue'

/**
 * 方案二 · 流水线看板 + AI 机器人成员：
 * AI 以「看板成员」身份常驻，每次调整都往活动区投一张卡片；
 * 货物卡片可拖到结果栏追加订购(拖=加一件)，结果行内 − 退回。
 */
const store = usePackingStore()

const loading = ref(false)
const library = ref<CargoOption[]>([])
const selectedIds = ref<number[]>([])
const expandId = ref<number | null>(null)

const totalWeight = computed(() =>
  store.params.cargoList.reduce((sum, c) => sum + c.weight * c.quantity, 0),
)

onMounted(() => {
  loading.value = true
  fetchCargoLibrary()
    .then((data) => (library.value = data))
    .finally(() => (loading.value = false))
  store.loadContainerTypes()
  store.loadHistory()
})

function toggleExpand(item: SelectedCargo) {
  expandId.value = expandId.value === item.id ? null : item.id
}

function loadHistory(id: string) {
  if (store.restoreHistory(id)) ElMessage.success('已载入历史装柜')
}

function togglePick(option: CargoOption) {
  const i = selectedIds.value.indexOf(option.id)
  if (i >= 0) selectedIds.value.splice(i, 1)
  else selectedIds.value.push(option.id)
}

function pickAllFiltered() {
  selectedIds.value = library.value.map((c) => c.id)
}

function commitPicks() {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先点选货物卡片')
    return
  }
  selectedIds.value.forEach((id) => {
    const option = library.value.find((c) => c.id === id)
    if (option) store.addCargo(option)
  })
  ElMessage.success(`已批量加入 ${selectedIds.value.length} 项货物`)
  selectedIds.value = []
}

async function submit() {
  const ok = await store.runPacking()
  if (ok) ElMessage.success('AI 装柜完成')
}

/* ── AI 机器人活动卡 ── */
const botThinking = computed(() => store.aiSession.thinking)
const botCards = computed(() => store.aiSession.turns.slice(-3).reverse())

function lastAiText(): string | null {
  const turns = store.aiSession.turns
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]!.role === 'ai') return turns[i]!.text
  }
  return null
}

async function adjust(op: AiOp, label?: string) {
  const ok = await store.adjustAi(op, label)
  if (!ok) return
  const text = lastAiText()
  if (text) ElMessage({ message: `🤖 ${text}`, type: 'success', duration: 2600 })
}

/** 结果已生成后，行内「退一件」：数量为 1 时直接移除 */
async function trimItem(item: SelectedCargo) {
  if (item.quantity <= 1) {
    await adjust({ kind: 'remove', skuid: item.id }, `退回「${item.name}」`)
  } else {
    await adjust({ kind: 'qty', skuid: item.id, qty: item.quantity - 1 }, `退回「${item.name}」一件`)
  }
}

/* 拖拽：货物卡片拖到结果栏 = 追加一件订购 */
const dragOverResult = ref(false)

function onDragStart(e: DragEvent, option: CargoOption) {
  e.dataTransfer?.setData('text/cargo-id', String(option.id))
  e.dataTransfer!.effectAllowed = 'copy'
}

async function onDropResult(e: DragEvent) {
  dragOverResult.value = false
  const raw = e.dataTransfer?.getData('text/cargo-id')
  if (!raw) return
  const id = Number(raw)
  const item = store.params.cargoList.find((c) => c.id === id)
  if (!item) {
    ElMessage.warning('先把它加入装柜列表再拖到结果区')
    return
  }
  await adjust({ kind: 'qty', skuid: id, qty: item.quantity + 1 }, `追加「${item.name}」×1`)
}
</script>

<template>
  <div class="board">
    <header class="board__head">
      <div>
        <h2>装柜流水线</h2>
        <p>货物库 → 装柜列表 → 装柜结果，三栏并排一览，点选卡片批量入列。</p>
      </div>
      <el-button type="primary" :loading="store.packing" size="large" @click="submit">
        开始装柜
      </el-button>
    </header>

    <div class="board__columns">
      <!-- 栏 1：货物库 -->
      <section class="board-col">
        <header class="board-col__head">
          <span class="board-col__title">① 货物库</span>
          <el-button link type="primary" size="small" @click="pickAllFiltered">全选</el-button>
        </header>
        <div v-loading="loading" class="board-col__body board-col__body--lib">
          <div
            v-for="c in library"
            :key="c.id"
            class="pick-card"
            :class="{ 'is-picked': selectedIds.includes(c.id) }"
            draggable="true"
            data-testid="pick-card"
            @click="togglePick(c)"
            @dragstart="(e: DragEvent) => onDragStart(e, c)"
          >
            <span class="pick-card__swatch" :style="{ backgroundColor: c.color }" />
            <div class="pick-card__info">
              <div class="pick-card__name">{{ c.name }}</div>
              <div class="pick-card__meta">
                {{ c.length }}×{{ c.width }}×{{ c.height }} · {{ c.weight }}kg
              </div>
            </div>
            <span class="pick-card__check">✓</span>
          </div>
        </div>
        <footer class="board-col__foot">
          <el-button
            type="primary"
            class="board-col__commit"
            :disabled="selectedIds.length === 0"
            @click="commitPicks"
          >
            加入装柜列表 ({{ selectedIds.length }})
          </el-button>
          <div class="board-col__hint">已出结果后，也可把货物卡片拖到右侧结果栏追加一件</div>
        </footer>
      </section>

      <!-- 栏 2：装柜列表 -->
      <section class="board-col">
        <header class="board-col__head">
          <span class="board-col__title">② 装柜列表</span>
          <span class="board-col__sub">{{ totalWeight.toFixed(1) }} kg</span>
        </header>
        <div class="board-col__body">
          <el-empty
            v-if="store.params.cargoList.length === 0"
            description="从左侧点选货物"
            :image-size="70"
          />
          <div v-for="(item, i) in store.params.cargoList" :key="item.id" class="lane-item">
            <div class="lane-item__row">
              <span class="lane-item__color" :style="{ backgroundColor: item.color }" />
              <div class="lane-item__main">
                <div class="lane-item__name">{{ item.name }}</div>
                <div class="lane-item__meta">
                  {{ item.spec.length }}×{{ item.spec.width }}×{{ item.spec.height }} ·
                  {{ item.rotation.label }}
                </div>
              </div>
              <div class="lane-item__qty">
                <el-input-number
                  :model-value="item.quantity"
                  :min="1"
                  size="small"
                  controls-position="right"
                  @update:model-value="(v: number | undefined) => (item.quantity = v ?? 1)"
                />
              </div>
              <el-button
                link
                type="primary"
                size="small"
                @click="toggleExpand(item)"
              >
                {{ expandId === item.id ? '收起' : '参数' }}
              </el-button>
              <el-button
                v-if="store.result"
                link
                type="warning"
                size="small"
                data-testid="lane-trim"
                @click="trimItem(item)"
              >
                退
              </el-button>
              <el-button link type="danger" size="small" @click="store.removeCargo(i)">删</el-button>
            </div>

            <!-- 单条货物参数面板 -->
            <el-collapse-transition>
              <div v-show="expandId === item.id" class="lane-item__panel">
                <div class="lane-item__grid">
                  <div class="lane-item__field">
                    <span>长 (mm)</span>
                    <el-input-number
                      :model-value="item.spec.length"
                      :min="1"
                      size="small"
                      controls-position="right"
                      @update:model-value="(v: number | undefined) => (item.spec.length = v ?? 1)"
                    />
                  </div>
                  <div class="lane-item__field">
                    <span>宽 (mm)</span>
                    <el-input-number
                      :model-value="item.spec.width"
                      :min="1"
                      size="small"
                      controls-position="right"
                      @update:model-value="(v: number | undefined) => (item.spec.width = v ?? 1)"
                    />
                  </div>
                  <div class="lane-item__field">
                    <span>高 (mm)</span>
                    <el-input-number
                      :model-value="item.spec.height"
                      :min="1"
                      size="small"
                      controls-position="right"
                      @update:model-value="(v: number | undefined) => (item.spec.height = v ?? 1)"
                    />
                  </div>
                  <div class="lane-item__field">
                    <span>单件重 (kg)</span>
                    <el-input-number
                      :model-value="item.weight"
                      :min="0"
                      :step="0.1"
                      size="small"
                      controls-position="right"
                      @update:model-value="(v: number | undefined) => (item.weight = v ?? 0)"
                    />
                  </div>
                </div>
                <div class="lane-item__field lane-item__field--wide">
                  <span>旋转方向</span>
                  <div class="lane-item__rotations">
                    <div
                      v-for="dir in CARGO_DIRECTIONS"
                      :key="dir.key"
                      class="rotation-option"
                      :class="{ 'is-active': item.rotation.key === dir.key }"
                      @click="item.rotation = dir"
                    >
                      <DirectionDiagram
                        :spec="item.spec"
                        :direction="dir"
                        :active="item.rotation.key === dir.key"
                        show-dimensions
                      />
                      <span class="rotation-option__label">{{ dir.label }}</span>
                    </div>
                  </div>
                </div>
                <div class="lane-item__field lane-item__field--wide">
                  <span>备注</span>
                  <el-input
                    :model-value="item.remark"
                    size="small"
                    placeholder="自定义备注(可选)"
                    @update:model-value="(v: string) => (item.remark = v ?? '')"
                  />
                </div>
              </div>
            </el-collapse-transition>
          </div>
        </div>
        <footer class="board-col__foot">
          <div class="lane-params">
            <div class="lane-params__item">
              <span>柜型</span>
              <el-select
                :model-value="store.params.container.id"
                size="small"
                style="width: 120px"
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
                  :label="`${t.name} · ${t.volumeM3}m³`"
                  :value="t.id"
                />
              </el-select>
            </div>
            <div class="lane-params__item">
              <span>溢出 (mm)</span>
              <el-input-number
                v-model="store.params.overflowPerBox"
                :min="0"
                :max="200"
                size="small"
                controls-position="right"
                style="width: 96px"
              />
            </div>
            <div class="lane-params__item">
              <span>叠放数</span>
              <el-input-number
                v-model="store.params.topTableStackCount"
                :min="0"
                :max="20"
                size="small"
                controls-position="right"
                style="width: 84px"
              />
            </div>
            <div class="lane-params__item">
              <span>可调比例 (%)</span>
              <el-input-number
                v-model="store.params.maxAdjustRatio"
                :min="0"
                :max="100"
                size="small"
                controls-position="right"
                style="width: 96px"
              />
            </div>
          </div>
          <div class="lane-params__custom">
            <span>自定义内容</span>
            <el-input
              v-model="store.params.customContent"
              size="small"
              placeholder="附加装柜要求 / 备注"
            />
          </div>
        </footer>
      </section>

      <!-- 栏 3：结果 + AI 机器人 -->
      <section class="board-col board-col--result">
        <header class="board-col__head">
          <span class="board-col__title">③ 装柜结果</span>
          <div class="board-col__head-ops">
            <el-popover placement="bottom-end" :width="420" trigger="click">
              <template #reference>
                <el-button size="small" round>
                  🕘 历史 ({{ store.history.length }})
                </el-button>
              </template>
              <div class="board-history">
                <HistoryList
                  :items="store.history"
                  :loading="store.historyLoading"
                  @load="loadHistory"
                  @remove="store.removeHistory"
                  @clear="store.clearHistory"
                />
              </div>
            </el-popover>
            <el-tag v-if="store.result" size="small">{{ store.result.container_count }} 柜</el-tag>
            <span class="bot-chip" :class="{ 'is-thinking': botThinking }" data-testid="bot-chip">
              🤖 AI 装柜员
              <b v-if="botThinking">计算中…</b>
              <b v-else>第 {{ store.aiSession.round }} 轮</b>
            </span>
          </div>
        </header>

        <!-- 拖拽投放区：拖入货物 = 追加一件 -->
        <div
          class="drop-zone"
          :class="{ 'is-over': dragOverResult, 'is-active': !!store.result }"
          data-testid="drop-result"
          @dragover.prevent="dragOverResult = true"
          @dragleave="dragOverResult = false"
          @drop.prevent="onDropResult"
        >
          {{ store.result ? '⬇ 把货物卡片拖到这里，追加一件订购' : '生成结果后，可把货物卡片拖到这里追加订购' }}
        </div>

        <div class="board-col__body board-col__body--result">
          <ResultsView visual>
            <template #empty>
              <el-empty description="点击「开始装柜」，AI 生成结果" :image-size="70" />
            </template>
          </ResultsView>
        </div>

        <!-- AI 机器人活动卡 -->
        <footer class="bot-feed" data-testid="bot-feed">
          <div v-if="botThinking" class="bot-card bot-card--thinking">
            <span class="bot-card__avatar">🤖</span>
            <span class="bot-card__text">正在重排方案…</span>
            <span class="dots"><i /><i /><i /></span>
          </div>
          <TransitionGroup v-else name="bot" tag="div" class="bot-feed__cards">
            <div v-for="t in botCards" :key="t.id" class="bot-card" data-testid="bot-card">
              <span class="bot-card__avatar">{{ t.role === 'ai' ? '🤖' : '👤' }}</span>
              <span class="bot-card__text">{{ t.text }}</span>
            </div>
          </TransitionGroup>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.board__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}
.board__head h2 {
  font-size: 22px;
}
.board__head p {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-top: 4px;
}
.board__columns {
  display: grid;
  grid-template-columns: minmax(300px, 1.2fr) minmax(300px, 1.2fr) minmax(340px, 1.6fr);
  gap: 16px;
  align-items: start;
}
.board-col {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  min-height: 480px;
  max-height: calc(100vh - 190px);
}
.board-col__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.board-col__title {
  font-weight: 600;
  font-size: 14px;
}
.board-col__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.board-col__body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.board-col__foot {
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.board-col__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.board-col__head-ops {
  display: flex;
  align-items: center;
  gap: 8px;
}
.board-history {
  max-height: 420px;
  overflow-y: auto;
}
.board-col__commit {
  width: 100%;
}
.board-col--result :deep(.results-empty) {
  padding: 12px;
}
/* 卡片点选 */
.pick-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1.5px solid var(--el-border-color-lighter);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}
.pick-card:hover {
  border-color: var(--el-color-primary-light-5);
}
.pick-card.is-picked {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.pick-card__swatch {
  width: 12px;
  height: 36px;
  border-radius: 3px;
  flex-shrink: 0;
}
.pick-card__info {
  flex: 1;
  min-width: 0;
}
.pick-card__name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pick-card__meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.pick-card__check {
  opacity: 0;
  color: var(--el-color-primary);
  font-weight: 700;
  transition: opacity 0.15s;
  display: inline-block;
}
.pick-card.is-picked .pick-card__check {
  opacity: 1;
  animation: check-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes check-pop {
  from {
    transform: scale(0.3);
  }
}
/* 列表条目 */
.lane-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  animation: lane-in 0.3s ease both;
}
@keyframes lane-in {
  from {
    opacity: 0;
    transform: translateX(14px);
  }
}
.lane-item__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
}
.lane-item__color {
  width: 8px;
  height: 28px;
  border-radius: 2px;
  flex-shrink: 0;
}
.lane-item__main {
  flex: 1;
  min-width: 0;
}
.lane-item__name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lane-item__meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.lane-item__qty {
  width: 96px;
  flex-shrink: 0;
}
.lane-item__qty :deep(.el-input-number) {
  width: 100%;
}
/* 货物参数面板 */
.lane-item__panel {
  border-top: 1px dashed var(--el-border-color-lighter);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--el-fill-color-lighter);
}
.lane-item__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.lane-item__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lane-item__field--wide {
  grid-column: 1 / -1;
}
.lane-item__field > span {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.lane-item__field :deep(.el-input-number) {
  width: 100%;
}
.lane-item__rotations {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 6px;
}
.rotation-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  cursor: pointer;
  transition: all 0.15s;
}
.rotation-option:hover {
  border-color: var(--el-color-primary-light-5);
}
.rotation-option.is-active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}
.rotation-option .direction-diagram {
  width: 56px;
  height: 56px;
}
.rotation-option__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
/* 栏底参数表单 */
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
.lane-params__item > span,
.lane-params__custom > span {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.lane-params__custom {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 160px;
}
/* AI 机器人成员 */
.bot-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 14px;
  padding: 2px 10px;
  color: var(--el-text-color-regular);
  transition: all 0.2s;
}
.bot-chip b {
  color: var(--el-color-primary);
  font-weight: 600;
}
.bot-chip.is-thinking {
  border-color: var(--el-color-warning);
}
/* 拖拽投放区 */
.drop-zone {
  margin: 10px 12px 0;
  border: 1.5px dashed var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  transition: all 0.15s;
}
.drop-zone.is-active {
  color: var(--el-text-color-secondary);
  border-color: var(--el-border-color);
}
.drop-zone.is-over {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
/* AI 活动卡 */
.bot-feed {
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 150px;
  overflow-y: auto;
}
.bot-feed__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bot-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  padding: 8px 10px;
}
.bot-card__avatar {
  flex-shrink: 0;
}
.bot-card__text {
  flex: 1;
  min-width: 0;
}
.bot-card--thinking {
  border: 1px dashed var(--el-color-warning);
  color: var(--el-text-color-secondary);
}
.dots {
  display: inline-flex;
  gap: 3px;
  align-items: center;
}
.dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--el-color-warning);
  animation: bot-dot 1s infinite ease-in-out;
}
.dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.dots i:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes bot-dot {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  50% {
    transform: translateY(-3px);
    opacity: 1;
  }
}
.bot-enter-active {
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.bot-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
</style>
