<script setup lang="ts">
import { computed, onMounted, ref, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { usePackingStore } from '@/stores/packing'
import { CARGO_DIRECTIONS } from '@/mock/constants'
import { fetchCargoLibrary } from '@/mock/packingApi'
import HistoryList from '@/components/HistoryList.vue'
import PackingVisual from '@/components/PackingVisual.vue'
import type { AiOp, CargoOption, SelectedCargo } from '@/types/packing'

/**
 * 方案六 · 命令中心 + AI 命令面板：
 * 面板除了搜索货物，还可对每条结果执行 −1 / 移除，顶部常驻
 * 「重新装柜」命令；stage 下方的转写带滚动展示最近 3 轮会话。
 */
const store = usePackingStore()

const showListDrawer = ref(false)
const showParamDrawer = ref(false)
const showHistoryDrawer = ref(false)
const editing = ref<SelectedCargo | null>(null)

/* 命令面板状态 */
const paletteOpen = ref(false)
const paletteInput = ref<InstanceType<typeof HTMLInputElement> | null>(null)
const paletteKeyword = ref('')
const paletteIndex = ref(0)
const paletteLibrary = ref<CargoOption[]>([])

const paletteResults = computed(() => {
  const kw = paletteKeyword.value.trim().toLowerCase()
  if (!kw) return paletteLibrary.value.slice(0, 8)
  return paletteLibrary.value
    .filter(
      (c) => c.name.toLowerCase().includes(kw) || c.category.toLowerCase().includes(kw),
    )
    .slice(0, 8)
})

function openPalette() {
  showListDrawer.value = false
  paletteOpen.value = true
  paletteKeyword.value = ''
  paletteIndex.value = 0
  nextTick(() => paletteInput.value?.focus())
}

watch(paletteKeyword, () => (paletteIndex.value = 0))

function paletteMove(delta: number) {
  const n = paletteResults.value.length
  if (n === 0) return
  let next = paletteIndex.value + delta
  if (store.result) {
    // -1 表示「重新装柜」命令行
    if (next < -1) next = n - 1
    if (next > n - 1) next = -1
  } else {
    next = (next + n) % n
  }
  paletteIndex.value = next
}

function palettePick(option?: CargoOption) {
  const idx = Math.max(0, paletteIndex.value)
  const opt = option ?? paletteResults.value[idx]
  if (!opt) return
  if (store.result) {
    // 已有结果：走 AI 会话重排
    const existing = store.params.cargoList.find((c) => c.id === opt.id)
    if (existing) {
      void store.adjustAi({ kind: 'qty', skuid: opt.id, qty: existing.quantity + 1 }, `「${opt.name}」再加一件`)
    } else {
      store.addCargo(opt)
      void store.adjustAi({ kind: 'replan' }, `新增「${opt.name}」，请重排`)
    }
  } else {
    store.addCargo(opt)
    ElMessage.success(`已加入「${opt.name}」`)
  }
  paletteKeyword.value = ''
  paletteIndex.value = 0
  nextTick(() => paletteInput.value?.focus())
}

function onPaletteKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    paletteMove(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    paletteMove(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (paletteIndex.value === -1 && store.result) {
      void paletteAdjust({ kind: 'replan' })
      paletteKeyword.value = ''
    } else {
      palettePick()
    }
  } else if (e.key === 'Escape') {
    paletteOpen.value = false
  }
}

onMounted(() => {
  store.loadHistory()
  fetchCargoLibrary().then((data) => (paletteLibrary.value = data))
})

const focusIndex = ref(0)
const containers = computed(() => store.result?.containers ?? [])
const current = computed(() => containers.value[focusIndex.value] ?? null)

const totalWeight = computed(() =>
  store.params.cargoList.reduce((sum, c) => sum + c.weight * c.quantity, 0),
)

function step(delta: number) {
  if (containers.value.length === 0) return
  focusIndex.value = (focusIndex.value + delta + containers.value.length) % containers.value.length
}

function loadHistory(id: string) {
  if (store.restoreHistory(id)) {
    ElMessage.success('已载入历史装柜')
    showHistoryDrawer.value = false
    focusIndex.value = 0
  }
}

async function submit() {
  const ok = await store.runPacking()
  if (ok) {
    ElMessage.success('AI 装柜完成')
    focusIndex.value = 0
  }
}

/* ── AI 命令面板 + 转写带 ── */
const transcript = computed(() => store.aiSession.turns.slice(-3))

async function paletteAdjust(op: AiOp) {
  const ok = await store.adjustAi(op)
  if (ok) ElMessage.success('AI 已重排方案')
}

function openEdit(item: SelectedCargo) {
  editing.value = item
  showListDrawer.value = false
}

function removeEdit() {
  const idx = store.params.cargoList.findIndex((c) => c.id === editing.value?.id)
  if (idx >= 0) store.removeCargo(idx)
  editing.value = null
}

/** 关闭编辑弹窗：已有结果时让 AI 按最新配置重排 */
function confirmEdit() {
  const had = editing.value
  editing.value = null
  if (had && store.result) {
    void store.adjustAi({ kind: 'replan' }, `更新「${had.name}」参数后重排`)
  }
}

function onRotateChange(key: string) {
  if (!editing.value) return
  const dir = CARGO_DIRECTIONS.find((d) => d.key === key)
  if (dir) editing.value.rotation = dir
}

const stageHoverLine = ref<string | null>(null)
function tiltStyle(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  const rx = ((e.clientY - r.top) / r.height - 0.5) * -6
  const ry = ((e.clientX - r.left) / r.width - 0.5) * 8
  el.style.setProperty('--rx', `${rx.toFixed(2)}deg`)
  el.style.setProperty('--ry', `${ry.toFixed(2)}deg`)
}
function tiltReset(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  el.style.setProperty('--rx', '0deg')
  el.style.setProperty('--ry', '0deg')
}
</script>

<template>
  <div class="hub">
    <!-- 顶部摘要条 -->
    <header class="hub__bar">
      <div class="hub__chips">
        <button
          class="hub-chip"
          data-testid="chip-list"
          @click="showListDrawer = true"
        >
          📦 装柜列表
          <b>{{ store.params.cargoList.length }}</b>
        </button>
        <button class="hub-chip" data-testid="chip-add" @click="openPalette">＋ 添加货物</button>
        <button class="hub-chip" data-testid="chip-params" @click="showParamDrawer = true">
          ⚙️ 参数
          <b>{{ store.params.container.name }}</b>
        </button>
        <button class="hub-chip" data-testid="chip-history" @click="showHistoryDrawer = true">
          🕘 历史
          <b>{{ store.history.length }}</b>
        </button>
        <span class="hub-chip hub-chip--static">⚖ {{ totalWeight.toFixed(1) }} kg</span>
      </div>
      <el-button
        type="primary"
        :loading="store.packing || store.aiSession.thinking"
        data-testid="run-packing"
        @click="submit"
      >
        {{ store.result ? '重新装柜' : '开始装柜' }}
      </el-button>
    </header>

    <!-- 主画布 -->
    <section class="hub__stage">
      <template v-if="current">
        <div class="stage-nav">
          <el-button circle :disabled="containers.length < 2" @click="step(-1)">‹</el-button>
          <div class="stage-nav__title">
            <el-tag effect="dark" size="small">柜 {{ current.container_index + 1 }}</el-tag>
            <span>{{ current.equipment_title }}</span>
          </div>
          <el-button circle :disabled="containers.length < 2" @click="step(1)">›</el-button>
        </div>

        <div class="stage-body">
          <div
            class="stage-tilt"
            @mousemove="tiltStyle"
            @mouseleave="tiltReset"
          >
            <PackingVisual
              class="stage-img"
              :container="current"
              :params="store.params"
              :highlight="stageHoverLine"
            />
          </div>

          <aside class="stage-side">
            <div class="stage-ring">
              <el-progress
                type="dashboard"
                :percentage="current.cubic_meter.used_percent"
                :width="130"
                :status="current.cubic_meter.used_percent >= 80 ? 'exception' : 'success'"
              >
                <template #default="{ percentage }">
                  <span class="stage-ring__num">{{ percentage }}%</span>
                  <span class="stage-ring__label">体积利用率</span>
                </template>
              </el-progress>
            </div>
            <ul class="stage-stats">
              <li><span>件数</span><b>{{ current.pieces_total }}</b></li>
              <li><span>已用体积</span><b>{{ current.cubic_meter.used_volume_m3 }} m³</b></li>
              <li><span>剩余体积</span><b>{{ current.cubic_meter.free_volume_m3 }} m³</b></li>
              <li><span>总容积</span><b>{{ current.cubic_meter.total_volume_m3 }} m³</b></li>
            </ul>
            <div class="stage-lines">
              <div
                v-for="line in current.cargo_lines"
                :key="line.skuid"
                class="stage-line"
                @mouseenter="stageHoverLine = line.cargo_name"
                @mouseleave="stageHoverLine = null"
              >
                <i :style="{ backgroundColor: line.color }" />
                <span class="stage-line__name">{{ line.cargo_name }}</span>
                <b>{{ line.pieces }}/{{ line.pieces_total }}</b>
              </div>
            </div>
          </aside>
        </div>

        <!-- AI 转写带：最近 3 轮会话 -->
        <div class="stage-transcript" data-testid="transcript">
          <template v-if="store.aiSession.thinking">
            <span class="tr-item tr-item--busy">🤖 正在重排方案…</span>
          </template>
          <template v-else-if="transcript.length">
            <span
              v-for="t in transcript"
              :key="t.id"
              class="tr-item"
              :class="{ 'tr-item--user': t.role === 'user' }"
            >
              <b>{{ t.role === 'ai' ? 'AI' : '你' }}</b>
              {{ t.text }}
            </span>
          </template>
          <span v-else class="tr-item tr-item--muted">生成结果后，用 ⌘K 面板调整方案</span>
        </div>

        <!-- 缩略图条：每柜独立渲染真实排布 -->
        <div class="stage-thumbs">
          <button
            v-for="c in containers"
            :key="c.container_index"
            class="stage-thumb"
            :class="{ 'is-current': c.container_index === current.container_index }"
            @click="focusIndex = c.container_index"
          >
            <PackingVisual :container="c" :params="store.params" :controls="false" compact />
          </button>
        </div>
      </template>

      <div v-else class="stage-empty">
        <el-empty description="配置完成后点击「开始装柜」，结果将在此聚焦展示">
          <el-button type="primary" @click="openPalette">先去添加货物 (⌘K)</el-button>
        </el-empty>
      </div>
    </section>

    <!-- 装柜列表抽屉 -->
    <el-drawer v-model="showListDrawer" title="装柜列表" size="440px">
      <div class="drawer-list">
        <el-empty
          v-if="store.params.cargoList.length === 0"
          description="暂无货物"
          :image-size="80"
        />
        <div
          v-for="(item, i) in store.params.cargoList"
          :key="item.id"
          class="drawer-row"
          @click="openEdit(item)"
        >
          <span class="drawer-row__color" :style="{ backgroundColor: item.color }" />
          <div class="drawer-row__main">
            <div class="drawer-row__name">{{ item.name }}</div>
            <div class="drawer-row__meta">
              ×{{ item.quantity }} · {{ item.rotation.label }}
            </div>
          </div>
          <el-button link type="danger" size="small" @click.stop="store.removeCargo(i)">
            移除
          </el-button>
        </div>
        <el-button class="drawer-list__add" @click="openPalette">+ 添加货物 (⌘K)</el-button>
      </div>
    </el-drawer>

    <!-- 参数抽屉 -->
    <el-drawer v-model="showParamDrawer" title="装柜参数" size="440px">
      <div class="param-drawer">
        <div class="param-drawer__field">
          <span>柜型</span>
          <el-select
            :model-value="store.params.container.id"
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
        <div class="param-drawer__field">
          <span>每箱溢出量 (mm)</span>
          <el-input-number
            v-model="store.params.overflowPerBox"
            :min="0"
            :max="200"
            controls-position="right"
            style="width: 100%"
          />
        </div>
        <div class="param-drawer__field">
          <span>最上层桌子叠放数</span>
          <el-input-number
            v-model="store.params.topTableStackCount"
            :min="0"
            :max="20"
            controls-position="right"
            style="width: 100%"
          />
        </div>
        <div class="param-drawer__field">
          <span>尺寸最大可调比例 (%)</span>
          <el-input-number
            v-model="store.params.maxAdjustRatio"
            :min="0"
            :max="100"
            controls-position="right"
            style="width: 100%"
          />
        </div>
        <div class="param-drawer__field">
          <span>自定义内容</span>
          <el-input
            v-model="store.params.customContent"
            type="textarea"
            :rows="3"
            placeholder="附加装柜要求 / 备注"
          />
        </div>
        <el-button type="primary" @click="showParamDrawer = false">完成</el-button>
      </div>
    </el-drawer>

    <!-- 历史装柜抽屉 -->
    <el-drawer v-model="showHistoryDrawer" title="历史装柜" size="460px">
      <HistoryList
        :items="store.history"
        :loading="store.historyLoading"
        @load="loadHistory"
        @remove="store.removeHistory"
        @clear="store.clearHistory"
      />
    </el-drawer>

    <!-- 单条货物编辑弹窗 -->
    <el-dialog
      :model-value="editing !== null"
      title="编辑货物参数"
      width="520px"
      :close-on-click-modal="false"
      @update:model-value="(v: boolean) => { if (!v) editing = null }"
    >
      <template v-if="editing">
        <div class="edit-grid">
          <div class="edit-grid__field">
            <span>数量</span>
            <el-input-number
              v-model="editing.quantity"
              :min="1"
              controls-position="right"
              style="width: 100%"
            />
          </div>
          <div class="edit-grid__field">
            <span>单件重 (kg)</span>
            <el-input-number
              v-model="editing.weight"
              :min="0"
              :step="0.1"
              controls-position="right"
              style="width: 100%"
            />
          </div>
          <div class="edit-grid__field">
            <span>长 (mm)</span>
            <el-input-number
              v-model="editing.spec.length"
              :min="1"
              controls-position="right"
              style="width: 100%"
            />
          </div>
          <div class="edit-grid__field">
            <span>宽 (mm)</span>
            <el-input-number
              v-model="editing.spec.width"
              :min="1"
              controls-position="right"
              style="width: 100%"
            />
          </div>
          <div class="edit-grid__field">
            <span>高 (mm)</span>
            <el-input-number
              v-model="editing.spec.height"
              :min="1"
              controls-position="right"
              style="width: 100%"
            />
          </div>
          <div class="edit-grid__field">
            <span>旋转方向</span>
            <el-select :model-value="editing.rotation.key" @update:model-value="onRotateChange">
              <el-option
                v-for="d in CARGO_DIRECTIONS"
                :key="d.key"
                :label="`${d.label}（${d.note}）`"
                :value="d.key"
              />
            </el-select>
          </div>
          <div class="edit-grid__field edit-grid__field--full">
            <span>备注</span>
            <el-input v-model="editing.remark" placeholder="自定义备注(可选)" />
          </div>
        </div>
      </template>
      <template #footer>
        <el-button type="danger" plain @click="removeEdit">移除此货物</el-button>
        <el-button type="primary" @click="confirmEdit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 命令面板：键盘优先的添加货物 -->
    <Teleport to="body">
      <Transition name="pal">
        <div v-if="paletteOpen" class="palette-mask" @mousedown.self="paletteOpen = false">
          <div class="palette" role="dialog" aria-label="添加货物命令面板">
            <input
              ref="paletteInput"
              v-model="paletteKeyword"
              class="palette__input"
              placeholder="搜索货物，↑↓ 选择，回车加入…"
              @keydown="onPaletteKey"
            />
            <div class="palette__list">
              <!-- 结果已生成：常驻 AI 命令 -->
              <template v-if="store.result">
                <div
                  class="palette-item palette-item--cmd"
                  :class="{ 'is-active': paletteIndex === -1 }"
                  data-testid="palette-repack"
                  @mouseenter="paletteIndex = -1"
                  @click="paletteAdjust({ kind: 'replan' })"
                >
                  <i class="palette-cmd__icon">♻</i>
                  <span class="palette-item__name">重新装柜（按当前清单）</span>
                  <span class="palette-item__meta">AI 重排</span>
                  <kbd>↵</kbd>
                </div>
              </template>
              <div
                v-for="(g, i) in paletteResults"
                :key="g.id"
                class="palette-item"
                :class="{ 'is-active': i === paletteIndex }"
                @mouseenter="paletteIndex = i"
                @click="palettePick(g)"
              >
                <i :style="{ backgroundColor: g.color }" />
                <span class="palette-item__name">{{ g.name }}</span>
                <span class="palette-item__meta">
                  {{ g.category }} · {{ g.length }}×{{ g.width }}×{{ g.height }} · {{ g.weight }}kg
                </span>
                <!-- 结果已生成：行内 AI 调整 -->
                <span v-if="store.result" class="palette-ops" @click.stop>
                  <button
                    class="palette-op"
                    data-testid="palette-less"
                    title="减一件"
                    :disabled="store.aiSession.thinking"
                    @click="paletteAdjust({ kind: 'qty', skuid: g.id, qty: (store.params.cargoList.find(c => c.id === g.id)?.quantity ?? 1) - 1 })"
                  >
                    −1
                  </button>
                  <button
                    class="palette-op palette-op--danger"
                    data-testid="palette-remove"
                    title="移除"
                    :disabled="store.aiSession.thinking"
                    @click="paletteAdjust({ kind: 'remove', skuid: g.id })"
                  >
                    移除
                  </button>
                </span>
                <kbd>↵</kbd>
              </div>
              <div v-if="paletteResults.length === 0" class="palette__empty">无匹配货物</div>
            </div>
            <div class="palette__foot">
              ↑↓ 选择 · ↵ {{ store.result ? '加入并让 AI 重排' : '加入' }} · Esc 关闭
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* 命令面板 */
.palette-mask {
  position: fixed;
  inset: 0;
  z-index: 2100;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
}
.palette {
  width: 560px;
  max-width: calc(100vw - 40px);
  background: var(--el-bg-color);
  border-radius: 12px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.palette__input {
  border: 0;
  outline: 0;
  font-size: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: transparent;
  color: var(--el-text-color-primary);
}
.palette__list {
  max-height: 320px;
  overflow-y: auto;
  padding: 8px;
}
.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
}
.palette-item.is-active {
  background: var(--el-color-primary);
  color: #fff;
}
.palette-item.is-active .palette-item__meta {
  color: rgba(255, 255, 255, 0.8);
}
.palette-item i {
  width: 10px;
  height: 26px;
  border-radius: 3px;
  flex-shrink: 0;
}
.palette-item__name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.palette-item__meta {
  margin-left: auto;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}
.palette-item kbd {
  font-size: 11px;
  border: 1px solid currentColor;
  border-radius: 4px;
  padding: 0 4px;
  opacity: 0;
  flex-shrink: 0;
}
.palette-item.is-active kbd {
  opacity: 0.9;
}
.palette__empty {
  padding: 20px;
  text-align: center;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}
/* 面板内 AI 命令与行内调整 */
.palette-item--cmd {
  border: 1px dashed var(--el-color-primary-light-5);
  margin-bottom: 4px;
}
.palette-cmd__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-style: normal;
  flex-shrink: 0;
}
.palette-ops {
  display: inline-flex;
  gap: 6px;
  flex-shrink: 0;
}
.palette-op {
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  font-size: 11px;
  padding: 2px 9px;
  cursor: pointer;
  transition: all 0.15s;
}
.palette-op:hover:not(:disabled) {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.palette-op--danger:hover:not(:disabled) {
  border-color: var(--el-color-danger);
  color: var(--el-color-danger);
}
.palette-op:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.palette__foot {
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 8px 14px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.pal-enter-active,
.pal-leave-active {
  transition: opacity 0.18s ease;
}
.pal-enter-active .palette,
.pal-leave-active .palette {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.pal-enter-from,
.pal-leave-to {
  opacity: 0;
}
.pal-enter-from .palette,
.pal-leave-to .palette {
  transform: translateY(-12px) scale(0.98);
  opacity: 0;
}
</style>

<style scoped>
.hub {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.hub__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.hub__chips {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.hub-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 20px;
  background: var(--el-bg-color);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.hub-chip:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.hub-chip b {
  color: var(--el-color-primary);
}
.hub-chip--static {
  cursor: default;
  color: var(--el-text-color-secondary);
}
.hub-chip--static:hover {
  border-color: var(--el-border-color);
  color: var(--el-text-color-secondary);
}
/* 主画布 */
.hub__stage {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 18px 22px;
  min-height: 480px;
}
.stage-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.stage-nav__title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
}
.stage-body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}
.stage-tilt {
  flex: 1;
  min-width: 0;
  max-width: 720px;
  transform: perspective(1100px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
  transition: transform 0.25s ease-out;
  will-change: transform;
  border-radius: 10px;
  border: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(180deg, #f0f3f8, #e2e8f1);
}
.stage-tilt :deep(.pv__svg) {
  width: 100%;
  height: 380px;
}
@media (prefers-reduced-motion: reduce) {
  .stage-tilt {
    transform: none;
  }
}
.stage-side {
  flex: 0 0 260px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.stage-ring {
  display: flex;
  justify-content: center;
}
.stage-ring__num {
  font-size: 22px;
  font-weight: 700;
}
.stage-ring__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.stage-stats {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stage-stats li {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}
.stage-stats span {
  color: var(--el-text-color-secondary);
}
.stage-lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stage-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.stage-line i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}
.stage-line__name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stage-thumbs {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  overflow-x: auto;
}
.stage-thumbs .stage-thumb {
  width: 110px;
  padding: 2px;
  border-radius: 6px;
  border: 2px solid transparent;
  background: linear-gradient(180deg, #f0f3f8, #e2e8f1);
  cursor: pointer;
  opacity: 0.65;
  transition: opacity 0.15s;
}
.stage-thumbs .stage-thumb:hover {
  opacity: 1;
}
.stage-thumbs .stage-thumb :deep(svg) {
  width: 100%;
  height: 56px;
  display: block;
}
.stage-thumbs .stage-thumb.is-current {
  border-color: var(--el-color-primary);
  opacity: 1;
}
/* AI 转写带 */
.stage-transcript {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 14px;
  padding: 8px 14px;
  background: #1e2430;
  border-radius: 8px;
  overflow-x: auto;
  white-space: nowrap;
}
.tr-item {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: #9fb0c3;
  flex-shrink: 0;
}
.tr-item b {
  color: #7ee787;
  margin-right: 6px;
}
.tr-item--user b {
  color: #79c0ff;
}
.tr-item--busy {
  color: #e3b341;
  animation: tr-blink 0.9s infinite;
}
.tr-item--muted {
  color: #6a7385;
}
@keyframes tr-blink {
  50% {
    opacity: 0.4;
  }
}
.stage-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 420px;
}
/* 抽屉 */
.drawer-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.drawer-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.drawer-row:hover {
  border-color: var(--el-color-primary);
}
.drawer-row__color {
  width: 8px;
  height: 30px;
  border-radius: 2px;
  flex-shrink: 0;
}
.drawer-row__main {
  flex: 1;
  min-width: 0;
}
.drawer-row__name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.drawer-row__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.drawer-list__add {
  border-style: dashed;
}
.param-drawer {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.param-drawer__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.param-drawer__field > span {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
/* 编辑弹窗 */
.edit-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}
.edit-grid__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.edit-grid__field--full {
  grid-column: span 2;
}
.edit-grid__field > span {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
