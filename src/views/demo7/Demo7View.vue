<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePackingStore } from '@/stores/packing'
import { CARGO_DIRECTIONS } from '@/mock/constants'
import { fetchCargoLibrary } from '@/mock/packingApi'
import HistoryList from '@/components/HistoryList.vue'
import type { AiOp, CargoOption, SelectedCargo } from '@/types/packing'

/**
 * 方案七 · 标签控制台 + AI 结构化选择题对话：
 * 结果行内 −/＋ 直接发意图，AI 回复后用「选择题」追问
 * (换柜型 / 再加购 / 先这样)，点选项即完成下一轮。
 */
const store = usePackingStore()

const shelfRef = ref<HTMLElement | null>(null)
const shelfPulse = ref(false)
const activeTab = ref('cargo')
const editing = ref<SelectedCargo | null>(null)
const library = ref<CargoOption[]>([])

onMounted(() => {
  store.loadHistory()
  fetchCargoLibrary().then((data) => (library.value = data))
})

function gotoShelf() {
  activeTab.value = 'cargo'
  shelfPulse.value = true
  window.setTimeout(() => (shelfPulse.value = false), 900)
  shelfRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function shelfAdd(option: CargoOption) {
  store.addCargo(option)
  ElMessage.success(`已放入购物袋「${option.name}」`)
}

const totalWeight = computed(() =>
  store.params.cargoList.reduce((sum, c) => sum + c.weight * c.quantity, 0),
)

function loadHistory(id: string) {
  if (store.restoreHistory(id)) {
    ElMessage.success('已载入历史装柜')
    activeTab.value = 'result'
  }
}

async function submit() {
  const ok = await store.runPacking()
  if (ok) {
    ElMessage.success('AI 装柜完成')
    activeTab.value = 'result'
  }
}

/* ── AI 结构化选择题对话 ── */
const lastAiText = ref('')
/** AI 追问的选择题：null 表示没有待答问题 */
interface AiOption {
  label: string
  op: AiOp | null
}
interface AiQuestion {
  text: string
  options: AiOption[]
}
const question = ref<AiQuestion | null>(null)

function orderQty(skuid: number): number {
  return store.params.cargoList.find((c) => c.id === skuid)?.quantity ?? 0
}

function buildQuestion(): AiQuestion | null {
  const alternatives = store.containerTypes.filter((t) => t.id !== store.params.container.id)
  const current = store.params.cargoList[0]
  const options: AiOption[] = []
  if (alternatives[0]) {
    options.push({
      label: `换成 ${alternatives[0].name} 更省`,
      op: { kind: 'container', containerId: alternatives[0].id },
    })
  }
  if (current) {
    options.push({
      label: `「${current.name}」再加 5 件`,
      op: { kind: 'qty', skuid: current.id, qty: current.quantity + 5 },
    })
  }
  options.push({ label: '先这样，不用了', op: null })
  return {
    text: '需要我继续优化方案吗？',
    options,
  }
}

async function adjust(op: AiOp) {
  question.value = null
  const ok = await store.adjustAi(op)
  if (!ok) return
  const turns = store.aiSession.turns
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]!.role === 'ai') {
      lastAiText.value = turns[i]!.text
      break
    }
  }
  question.value = buildQuestion()
}

async function onChoice(o: AiOption) {
  if (!o.op) {
    question.value = null
    return
  }
  await adjust(o.op)
}

/** 结果行内 −/＋(按订购量调整) */
function lineLess(skuid: number) {
  const q = orderQty(skuid)
  if (q <= 1) void adjust({ kind: 'remove', skuid })
  else void adjust({ kind: 'qty', skuid, qty: q - 1 })
}

function lineMore(skuid: number) {
  void adjust({ kind: 'qty', skuid, qty: orderQty(skuid) + 1 })
}

function goParam() {
  activeTab.value = 'param'
}

function openEdit(item: SelectedCargo) {
  editing.value = item
}

function onRotateChange(key: string) {
  if (!editing.value) return
  const dir = CARGO_DIRECTIONS.find((d) => d.key === key)
  if (dir) editing.value.rotation = dir
}

function removeEdit() {
  const idx = store.params.cargoList.findIndex((c) => c.id === editing.value?.id)
  if (idx >= 0) store.removeCargo(idx)
  editing.value = null
}
</script>

<template>
  <div class="console">
    <!-- 固定页签栏 -->
    <div class="console__tabbar">
      <div class="console__tabs">
        <button class="tab" :class="{ 'is-active': activeTab === 'cargo' }" @click="activeTab = 'cargo'">
          ① 货物
        </button>
        <button class="tab" :class="{ 'is-active': activeTab === 'param' }" @click="activeTab = 'param'">
          ② 参数
        </button>
        <button class="tab" :class="{ 'is-active': activeTab === 'result' }" @click="activeTab = 'result'">
          ③ 结果
        </button>
        <button class="tab" :class="{ 'is-active': activeTab === 'history' }" data-testid="tab-history"
          @click="activeTab = 'history'">
          ④ 历史
        </button>
      </div>
      <div class="console__bag">
        <button class="bag" data-testid="bag" @click="gotoShelf">
          <span class="bag__icon">🧺</span>
          <span class="bag__label">货物袋</span>
          <span :key="store.params.cargoList.length" class="bag__badge">{{ store.params.cargoList.length }}</span>
        </button>
      </div>
    </div>

    <!-- Tab 1: 货物 -->
    <div v-show="activeTab === 'cargo'" class="console__pane">
      <div class="pane-cargo">
        <div class="pane-cargo__list"> <el-empty v-if="store.params.cargoList.length === 0"
            description="货物袋是空的，从右侧货架选几件吧" :image-size="90" />
          <div v-for="(item, i) in store.params.cargoList" :key="item.id" class="bag-row">
            <span class="bag-row__color" :style="{ backgroundColor: item.color }" />
            <div class="bag-row__main">
              <div class="bag-row__name">{{ item.name }}</div>
              <div class="bag-row__meta">
                {{ item.spec.length }}×{{ item.spec.width }}×{{ item.spec.height }} ·
                {{ item.rotation.label }}
              </div>
            </div>
            <div class="bag-row__qty">
              <el-input-number :model-value="item.quantity" :min="1" size="small" controls-position="right"
                @update:model-value="(v: number | undefined) => (item.quantity = v ?? 1)" />
            </div>
            <el-button link type="primary" size="small" @click="openEdit(item)">编辑</el-button>
            <el-button link type="danger" size="small" @click="store.removeCargo(i)">删</el-button>
          </div>
        </div>
        <aside class="pane-cargo__side">
          <div class="pane-cargo__side-card">
            <h4>合计</h4>
            <p class="pane-cargo__weight">{{ totalWeight.toFixed(1) }} kg</p>
            <p class="pane-cargo__count">{{ store.params.cargoList.length }} 项货物</p>
          </div>
          <el-button type="primary" style="width: 100%" @click="gotoShelf">
            去货架挑选 ↓
          </el-button>
          <el-button style="width: 100%; margin-left:0;" @click="goParam">下一步：参数</el-button>
        </aside>
      </div>

      <!-- 货架：页签内直接挑选 -->
      <section ref="shelfRef" class="shelf" :class="{ 'is-pulse': shelfPulse }">
        <header class="shelf__head">
          <h4>货物货架</h4>
          <span>点击行的 ＋ 直接放入购物袋</span>
        </header>
        <div class="shelf__grid">
          <div v-for="g in library" :key="g.id" class="shelf-row">
            <span class="shelf-row__thumb" :style="{ backgroundColor: g.color }">
              {{ g.name.slice(0, 2) }}
            </span>
            <div class="shelf-row__info">
              <b>{{ g.name }}</b>
              <span>{{ g.length }}×{{ g.width }}×{{ g.height }} · {{ g.weight }}kg/{{ g.unit }}</span>
            </div>
            <el-button circle size="small" type="primary" @click="shelfAdd(g)">＋</el-button>
          </div>
        </div>
      </section>
    </div>

    <!-- Tab 2: 参数 -->
    <div v-show="activeTab === 'param'" class="console__pane">
      <div class="pane-param">
        <div class="pane-param__card">
          <h3>柜型</h3>
          <div class="pane-param__options">
            <div v-for="t in store.containerTypes" :key="t.id" class="container-option"
              :class="{ 'is-active': store.params.container.id === t.id }" @click="store.setContainer(t)">
              <div class="container-option__name">{{ t.name }}</div>
              <div class="container-option__meta">{{ t.volumeM3 }} m³</div>
              <div class="container-option__dims">
                {{ t.innerLength }}×{{ t.innerWidth }}×{{ t.innerHeight }}
              </div>
            </div>
          </div>
        </div>

        <div class="pane-param__card">
          <h3>装柜参数</h3>
          <div class="pane-param__grid">
            <div class="pane-param__field">
              <span>每箱溢出量 (mm)</span>
              <el-input-number v-model="store.params.overflowPerBox" :min="0" :max="200" controls-position="right"
                style="width: 100%" />
            </div>
            <div class="pane-param__field">
              <span>最上层桌子叠放数</span>
              <el-input-number v-model="store.params.topTableStackCount" :min="0" :max="20" controls-position="right"
                style="width: 100%" />
            </div>
            <div class="pane-param__field">
              <span>尺寸最大可调比例 (%)</span>
              <el-input-number v-model="store.params.maxAdjustRatio" :min="0" :max="100" controls-position="right"
                style="width: 100%" />
            </div>
            <div class="pane-param__field">
              <span>自定义内容</span>
              <el-input v-model="store.params.customContent" type="textarea" :rows="2" placeholder="附加装柜要求 / 备注" />
            </div>
          </div>
        </div>

        <div class="pane-param__actions">
          <el-button @click="activeTab = 'cargo'">上一步</el-button>
          <el-button type="primary" :loading="store.packing" @click="submit">提交装柜</el-button>
        </div>
      </div>
    </div>

    <!-- Tab 3: 结果（轮播） -->
    <div v-show="activeTab === 'result'" class="console__pane">
      <template v-if="store.result">
        <div class="pane-result__top">
          <el-tag :type="store.result.is_full ? 'success' : 'warning'" effect="plain">
            {{ store.result.is_full ? '柜已装满' : '柜未装满' }}
          </el-tag>
          <span>共 {{ store.result.container_count }} 个柜，左右切换查看</span>
        </div>
        <el-carousel :autoplay="false" :loop="false" arrow="always" height="480px" indicator-position="outside"
          class="pane-result__carousel">
          <el-carousel-item v-for="c in store.result.containers" :key="c.container_index">
            <div class="result-slide">
              <div class="result-slide__img">
                <img :src="c.packing_diagram_url" :alt="c.equipment_title" />
              </div>
              <div class="result-slide__info">
                <div class="result-slide__title">
                  <el-tag effect="dark" size="small">柜 {{ c.container_index + 1 }}</el-tag>
                  {{ c.equipment_title }}
                </div>
                <div class="result-slide__bar">
                  <el-progress :percentage="c.cubic_meter.used_percent" :stroke-width="16"
                    :status="c.cubic_meter.used_percent >= 80 ? 'exception' : 'success'" />
                </div>
                <ul class="result-slide__stats">
                  <li>
                    <span>件数</span><b>{{ c.pieces_total }}</b>
                  </li>
                  <li>
                    <span>已用</span><b>{{ c.cubic_meter.used_volume_m3 }} m³</b>
                  </li>
                  <li>
                    <span>剩余</span><b>{{ c.cubic_meter.free_volume_m3 }} m³</b>
                  </li>
                  <li>
                    <span>总容积</span><b>{{ c.cubic_meter.total_volume_m3 }} m³</b>
                  </li>
                </ul>
                <div class="result-slide__lines">
                  <div v-for="line in c.cargo_lines" :key="line.skuid" class="result-slide__line">
                    <i :style="{ backgroundColor: line.color }" />
                    <span>{{ line.cargo_name }}</span>
                    <span class="result-slide__order">订购 ×{{ orderQty(line.skuid) }}</span>
                    <button class="line-btn" data-testid="line-less" :disabled="store.aiSession.thinking" title="订购减一件"
                      @click="lineLess(line.skuid)">
                      −
                    </button>
                    <b>{{ line.pieces }}/{{ line.pieces_total }}</b>
                    <button class="line-btn" data-testid="line-more" :disabled="store.aiSession.thinking" title="订购加一件"
                      @click="lineMore(line.skuid)">
                      ＋
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </el-carousel-item>
        </el-carousel>

        <!-- AI 结构化选择题对话 -->
        <div class="ai-panel" data-testid="ai-panel">
          <div v-if="store.aiSession.thinking" class="ai-panel__row ai-panel__row--thinking">
            <span class="ai-panel__avatar">🤖</span>
            <span class="ai-panel__typing"><i /><i /><i /></span>
          </div>
          <template v-else>
            <div v-if="lastAiText" class="ai-panel__row">
              <span class="ai-panel__avatar">🤖</span>
              <p class="ai-panel__msg">{{ lastAiText }}</p>
            </div>
            <div v-if="question" class="ai-panel__question">
              <span class="ai-panel__q">{{ question.text }}</span>
              <div class="ai-panel__choices">
                <el-button v-for="o in question.options" :key="o.label" size="small" round data-testid="ai-choice"
                  @click="onChoice(o)">
                  {{ o.label }}
                </el-button>
              </div>
            </div>
            <div v-if="!lastAiText && !question" class="ai-panel__hint">
              在轮播的货物行上点 −/＋ 调整订购量，AI 会回复并追问下一步。
            </div>
          </template>
        </div>
      </template>
      <el-empty v-else description="先完成参数配置并提交装柜" :image-size="90">
        <el-button type="primary" @click="activeTab = 'param'">去配置参数</el-button>
      </el-empty>
    </div>

    <!-- Tab 4: 历史 -->
    <div v-show="activeTab === 'history'" class="console__pane">
      <div class="pane-history">
        <HistoryList :items="store.history" :loading="store.historyLoading" @load="loadHistory"
          @remove="store.removeHistory" @clear="store.clearHistory" />
      </div>
    </div>

    <!-- 货物货架抽屉 -->
    <!-- 货物页签内已内置货架，无需抽屉 -->

    <!-- 编辑弹窗 -->
    <el-dialog :model-value="editing !== null" title="编辑货物" width="480px"
      @update:model-value="(v: boolean) => { if (!v) editing = null }">
      <template v-if="editing">
        <div class="edit-form">
          <div class="edit-form__field">
            <span>数量</span>
            <el-input-number v-model="editing.quantity" :min="1" controls-position="right" style="width: 100%" />
          </div>
          <div class="edit-form__field">
            <span>长 × 宽 × 高 (mm)</span>
            <div class="edit-form__dims">
              <el-input-number v-model="editing.spec.length" :min="1" controls-position="right" />
              <el-input-number v-model="editing.spec.width" :min="1" controls-position="right" />
              <el-input-number v-model="editing.spec.height" :min="1" controls-position="right" />
            </div>
          </div>
          <div class="edit-form__field">
            <span>旋转方向</span>
            <el-select :model-value="editing.rotation.key" @update:model-value="onRotateChange">
              <el-option v-for="d in CARGO_DIRECTIONS" :key="d.key" :label="`${d.label}（${d.note}）`" :value="d.key" />
            </el-select>
          </div>
          <div class="edit-form__field">
            <span>备注</span>
            <el-input v-model="editing.remark" placeholder="自定义备注(可选)" />
          </div>
        </div>
      </template>
      <template #footer>
        <el-button type="danger" plain @click="removeEdit">移除</el-button>
        <el-button type="primary" @click="editing = null">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.console {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 页签栏 */
.console__tabbar {
  position: sticky;
  top: 56px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 8px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.console__tabs {
  display: flex;
  gap: 6px;
}

.tab {
  padding: 8px 20px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  color: var(--el-text-color-regular);
  transition: all 0.15s;
}

.tab:hover {
  background: var(--el-fill-color);
}

.tab.is-active {
  background: var(--el-color-primary);
  color: #fff;
  font-weight: 600;
}

/* 货物袋 */
.bag {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-lighter);
  border-radius: 20px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}

.bag:hover {
  border-color: var(--el-color-primary);
}

.bag__badge {
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--el-color-danger);
  color: #fff;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.bag__badge.updater {
  animation: badge-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes badge-pop {
  0% {
    transform: scale(0.6);
  }

  100% {
    transform: scale(1);
  }
}

/* Tab1 货物 */
.pane-cargo {
  display: grid;
  grid-template-columns: 1fr 240px;
  gap: 16px;
}

.pane-cargo__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bag-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
}

.bag-row__color {
  width: 8px;
  height: 30px;
  border-radius: 2px;
  flex-shrink: 0;
}

.bag-row__main {
  flex: 1;
  min-width: 0;
}

.bag-row__name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bag-row__meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.bag-row__qty {
  width: 100px;
  flex-shrink: 0;
}

.bag-row__qty :deep(.el-input-number) {
  width: 100%;
}

.pane-cargo__side {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pane-cargo__side-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 16px;
  text-align: center;
}

.pane-cargo__side-card h4 {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.pane-cargo__weight {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.pane-cargo__count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 货架 */
.shelf {
  margin-top: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 16px 18px;
  transition: box-shadow 0.3s;
}

.shelf.is-pulse {
  box-shadow: 0 0 0 3px var(--el-color-primary-light-7);
}

.shelf__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.shelf__head h4 {
  font-size: 15px;
}

.shelf__head span {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.shelf__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
}

.shelf-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.shelf-row:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
}

.shelf-row__thumb {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.shelf-row__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shelf-row__info b {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shelf-row__info span {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

/* Tab2 参数 */
.pane-param {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.pane-param__card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 18px;
}

.pane-param__card h3 {
  font-size: 15px;
  margin-bottom: 14px;
}

.pane-param__options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.container-option {
  border: 1.5px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.container-option:hover {
  border-color: var(--el-color-primary-light-5);
}

.container-option.is-active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.container-option__name {
  font-size: 16px;
  font-weight: 700;
}

.container-option__meta {
  font-size: 12px;
  color: var(--el-color-primary);
  margin: 4px 0;
}

.container-option__dims {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.pane-param__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.pane-param__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pane-param__field>span {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.pane-param__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* Tab3 结果轮播 */
.pane-result__top {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}

.result-slide {
  display: flex;
  gap: 24px;
  height: 100%;
  align-items: center;
  padding: 0 8px;
}

.result-slide__img {
  flex: 1.2;
  min-width: 0;
  border-radius: 10px;
  border: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(180deg, #f0f3f8, #e2e8f1);
  padding: 6px;
}

.result-slide__img img {
  width: 100%;
  display: block;
  border-radius: 10px;
}

.result-slide__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.result-slide__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.result-slide__bar {
  padding-right: 20px;
}

.result-slide__stats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.result-slide__stats li {
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.result-slide__stats span {
  color: var(--el-text-color-secondary);
}

.result-slide__lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-slide__line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.result-slide__line i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.result-slide__line span {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-slide__order {
  flex: 0 0 auto;
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.line-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.line-btn:hover:not(:disabled) {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.line-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* AI 结构化选择题面板 */
.ai-panel {
  margin-top: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-panel__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ai-panel__avatar {
  flex-shrink: 0;
}

.ai-panel__msg {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  background: var(--el-fill-color-lighter);
  border-radius: 10px;
  border-top-left-radius: 4px;
  padding: 8px 12px;
  max-width: 720px;
}

.ai-panel__typing {
  display: inline-flex;
  gap: 4px;
  padding: 10px 0;
}

.ai-panel__typing i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-text-color-secondary);
  animation: ai7-dot 1s infinite ease-in-out;
}

.ai-panel__typing i:nth-child(2) {
  animation-delay: 0.15s;
}

.ai-panel__typing i:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes ai7-dot {

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

.ai-panel__question {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-left: 30px;
}

.ai-panel__q {
  font-size: 13px;
  color: var(--el-color-primary);
  font-weight: 600;
}

.ai-panel__choices {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ai-panel__hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

/* Tab4 历史 */
.pane-history {
  width: 100%;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 16px;
}

/* 编辑弹窗 */
.edit-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.edit-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.edit-form__field>span {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.edit-form__dims {
  display: flex;
  gap: 8px;
}

.edit-form__dims .el-input-number {
  flex: 1;
}
</style>
