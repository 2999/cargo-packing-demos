<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { usePackingStore } from '@/stores/packing'
import { CARGO_DIRECTIONS } from '@/mock/constants'
import { fetchCargoLibrary } from '@/mock/packingApi'
import { useCountUp } from '@/utils/useCountUp'
import HistoryList from '@/components/HistoryList.vue'
import type { AiOp, CargoOption, SelectedCargo } from '@/types/packing'
import PackingVisual from '@/components/PackingVisual.vue'

/**
 * 方案八 · 底部结算台 + AI 客服导购：
 * 右下角导购助手(聊天气泡+快捷回复+打字机效果)，
 * 结果瓦片的订单行 −/＋ 直接发意图，客服同步播报。
 */
const store = usePackingStore()
const showMall = ref(false)
const showResultDrawer = ref(false)
const showHistoryDrawer = ref(false)
const editing = ref<SelectedCargo | null>(null)
const library = ref<CargoOption[]>([])

const inCart = computed(() => {
  const map = new Map<number, number>()
  for (const c of store.params.cargoList) map.set(c.id, c.quantity)
  return map
})

onMounted(() => {
  store.loadHistory()
  fetchCargoLibrary().then((data) => (library.value = data))
})

function addToCart(option: CargoOption) {
  store.addCargo(option)
  const n = inCart.value.get(option.id) ?? 0
  ElMessage.success(`已加入购物车「${option.name}」×${n + 1}`)
}

const totalWeight = computed(() =>
  store.params.cargoList.reduce((sum, c) => sum + c.weight * c.quantity, 0),
)
const totalPieces = computed(() =>
  store.params.cargoList.reduce((sum, c) => sum + c.quantity, 0),
)

const piecesAnim = useCountUp(totalPieces)
const weightAnim = useCountUp(totalWeight)

function loadHistory(id: string) {
  if (store.restoreHistory(id)) {
    ElMessage.success('已载入历史装柜')
    showHistoryDrawer.value = false
    showResultDrawer.value = true
  }
}

async function submit() {
  const ok = await store.runPacking()
  if (ok) {
    ElMessage.success('AI 装柜完成')
    showResultDrawer.value = true
  }
}

/* ── AI 客服导购 ── */
const showChat = ref(false)
const chatUnread = ref(0)
const chatInput = ref('')
const messagesEl = ref<HTMLElement | null>(null)

const chatTurns = computed(() => store.aiSession.turns)

const quickReplies = computed<{ label: string; op: AiOp | 'ask' }[]>(() => {
  const list: { label: string; op: AiOp | 'ask' }[] = [{ label: '现在用几个柜？', op: 'ask' }]
  const first = store.params.cargoList[0]
  if (first) {
    const short = first.name.split(' ').pop()!
    list.push({
      label: `${short} 再来 10 件`,
      op: { kind: 'qty', skuid: first.id, qty: first.quantity + 10 },
    })
  }
  const other = store.containerTypes.find((t) => t.id !== store.params.container.id)
  if (other) {
    list.push({ label: `换 ${other.name} 省运费`, op: { kind: 'container', containerId: other.id } })
  }
  return list
})

watch(
  () => store.aiSession.turns.length,
  (n, old) => {
    if (n > (old ?? 0) && !showChat.value) chatUnread.value += n - (old ?? 0)
  },
)

function openChat() {
  showChat.value = true
  chatUnread.value = 0
}

function findCargo(text: string) {
  const low = text.toLowerCase()
  return store.params.cargoList.find(
    (c) => low.includes(c.name.toLowerCase()) || low.includes(c.name.split(' ').pop()!.toLowerCase()),
  )
}

async function sendChat() {
  const text = chatInput.value.trim()
  if (!text || store.aiSession.thinking) return
  chatInput.value = ''
  const cm = text.match(/40\s?HC|40\s?GP|20\s?GP/i)
  if (cm && /换|改|柜型|用/.test(text)) {
    const id = cm[0]!.toUpperCase().replace(/\s+/g, '')
    if (store.containerTypes.some((c) => c.id === id)) {
      await store.adjustAi({ kind: 'container', containerId: id }, text)
      return
    }
  }
  const cargo = findCargo(text)
  const dm = cargo ? text.match(/(?:加|多|[+＋])\s*(\d+)|(?:减|少|[-−－])\s*(\d+)/) : null
  if (cargo && dm) {
    const down = /减|少|[-−－]/.test(dm[0]!)
    const delta = (down ? -1 : 1) * Number(down ? dm[2] : dm[1])
    await store.adjustAi(
      { kind: 'qty', skuid: cargo.id, qty: Math.max(1, cargo.quantity + delta) },
      text,
    )
    return
  }
  store.aiFallback(
    text,
    '我是导购小柜 🤖 可以帮你调整订单：告诉我「货物名 +10 / -10」「换 20GP」，或点下面的快捷回复。',
  )
  scrollChat()
}

async function onQuick(q: { label: string; op: AiOp | 'ask' }) {
  if (q.op === 'ask') {
    const n = store.result?.container_count
    const pieces = store.result?.containers.reduce((s, c) => s + c.pieces_total, 0) ?? 0
    store.aiFallback(
      q.label,
      n
        ? `当前方案用 ${n} 个柜，共装 ${pieces} 件，货物合计 ${totalWeight.value.toFixed(1)}kg。`
        : '还没有装柜结果，先点下方「开始装柜」哦。',
    )
    scrollChat()
    return
  }
  await store.adjustAi(q.op, q.label)
  scrollChat()
}

function scrollChat() {
  window.setTimeout(() => {
    messagesEl.value?.scrollTo({ top: messagesEl.value.scrollHeight, behavior: 'smooth' })
  }, 60)
}

/* 结果瓦片订单行 −/＋ */
function orderQty(skuid: number): number {
  return store.params.cargoList.find((c) => c.id === skuid)?.quantity ?? 0
}

async function tileAdjust(op: AiOp, label: string) {
  await store.adjustAi(op, label)
}

/* 最新一轮 AI 回复打字机效果 */
const typed = ref('')
let typeTimer: number | null = null

watch(
  () => store.aiSession.turns.length,
  (n) => {
    const last = store.aiSession.turns[n - 1]
    if (!last || last.role !== 'ai') return
    if (typeTimer) window.clearInterval(typeTimer)
    typed.value = ''
    let i = 0
    typeTimer = window.setInterval(() => {
      i += 2
      typed.value = last.text.slice(0, i)
      if (i >= last.text.length && typeTimer) {
        window.clearInterval(typeTimer)
        typeTimer = null
      }
    }, 24)
  },
)

function isLatestAi(t: { id: number; role: string }): boolean {
  const turns = store.aiSession.turns
  const last = turns[turns.length - 1]
  return !!last && last.id === t.id && last.role === 'ai' && typed.value.length < last.text.length
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
  <div class="desk">
    <!-- KPI 条 -->
    <div class="desk__kpi">
      <div class="kpi">
        <span class="kpi__num">{{ store.params.cargoList.length }}</span>
        <span class="kpi__label">货物项</span>
      </div>
      <div class="kpi">
        <span class="kpi__num">{{ Math.round(piecesAnim) }}</span>
        <span class="kpi__label">总件数</span>
      </div>
      <div class="kpi">
        <span class="kpi__num">{{ weightAnim.toFixed(1) }}</span>
        <span class="kpi__label">总重量 kg</span>
      </div>
      <div class="kpi">
        <span class="kpi__num">{{ store.params.container.name }}</span>
        <span class="kpi__label">柜型 · {{ store.params.container.volumeM3 }} m³</span>
      </div>
      <div class="kpi">
        <span class="kpi__num">{{ store.result ? store.result.container_count : '—' }}</span>
        <span class="kpi__label">预计用柜</span>
      </div>
    </div>

    <!-- 参数卡片区 -->
    <div class="desk__grid">
      <section class="desk-card desk-card--list">
        <header class="desk-card__head">
          <h3>装柜列表</h3>
          <el-button type="primary" size="small" @click="showMall = true">+ 选货物</el-button>
        </header>
        <div class="desk-card__body desk-card__body--list">
          <el-empty
            v-if="store.params.cargoList.length === 0"
            description="暂未选择货物"
            :image-size="80"
          />
          <div v-for="(item, i) in store.params.cargoList" :key="item.id" class="desk-row">
            <span class="desk-row__color" :style="{ backgroundColor: item.color }" />
            <div class="desk-row__main">
              <div class="desk-row__name">{{ item.name }}</div>
              <div class="desk-row__meta">
                {{ item.spec.length }}×{{ item.spec.width }}×{{ item.spec.height }} ·
                {{ item.rotation.label }}
              </div>
            </div>
            <div class="desk-row__qty">
              <el-input-number
                :model-value="item.quantity"
                :min="1"
                size="small"
                controls-position="right"
                @update:model-value="(v: number | undefined) => (item.quantity = v ?? 1)"
              />
            </div>
            <el-button link type="primary" size="small" @click="openEdit(item)">编辑</el-button>
            <el-button link type="danger" size="small" @click="store.removeCargo(i)">删</el-button>
          </div>
        </div>
      </section>

      <section class="desk-card">
        <header class="desk-card__head"><h3>装柜参数</h3></header>
        <div class="desk-card__body">
          <div class="desk-field">
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
          <div class="desk-field">
            <span>每箱溢出量 (mm)</span>
            <el-input-number
              v-model="store.params.overflowPerBox"
              :min="0"
              :max="200"
              controls-position="right"
              style="width: 100%"
            />
          </div>
          <div class="desk-field">
            <span>最上层桌子叠放数</span>
            <el-input-number
              v-model="store.params.topTableStackCount"
              :min="0"
              :max="20"
              controls-position="right"
              style="width: 100%"
            />
          </div>
          <div class="desk-field">
            <span>尺寸最大可调比例 (%)</span>
            <el-input-number
              v-model="store.params.maxAdjustRatio"
              :min="0"
              :max="100"
              controls-position="right"
              style="width: 100%"
            />
          </div>
          <div class="desk-field">
            <span>自定义内容</span>
            <el-input
              v-model="store.params.customContent"
              type="textarea"
              :rows="2"
              placeholder="附加装柜要求 / 备注"
            />
          </div>
        </div>
      </section>
    </div>

    <!-- 底部结算栏 -->
    <div class="desk__dock">
      <div class="desk__dock-summary">
        已选 <b>{{ store.params.cargoList.length }}</b> 项 · 共
        <b>{{ totalPieces }}</b> 件 · <b>{{ totalWeight.toFixed(1) }}</b> kg
      </div>
      <div class="desk__dock-actions">
        <el-badge
          :value="store.history.length"
          :hidden="store.history.length === 0"
          class="desk__dock-history"
        >
          <el-button circle data-testid="dock-history" @click="showHistoryDrawer = true">
            🕘
          </el-button>
        </el-badge>
        <el-button @click="store.reset()">重置</el-button>
        <el-button
          type="primary"
          size="large"
          :loading="store.packing || store.aiSession.thinking"
          data-testid="dock-submit"
          @click="submit"
        >
          {{ store.result ? '重新装柜' : '开始装柜' }}
        </el-button>
      </div>
    </div>

    <!-- 结果抽屉(底部滑出) -->
    <el-drawer
      v-model="showResultDrawer"
      direction="btt"
      size="82%"
      :with-header="false"
      :append-to-body="true"
    >
      <div class="result-drawer">
        <header class="result-drawer__head">
          <h2>装柜结果 · 共 {{ store.result?.container_count ?? 0 }} 个柜</h2>
          <div class="result-drawer__head-ops">
            <el-button type="primary" plain @click="showResultDrawer = false; showMall = true">
              继续选购
            </el-button>
            <el-button @click="showResultDrawer = false">关闭</el-button>
          </div>
        </header>
        <div v-if="store.result" class="result-drawer__list">
          <div
            v-for="c in store.result.containers"
            :key="c.container_index"
            class="result-tile"
          >
            <div class="result-tile__head">
              <el-tag effect="dark" size="small">柜 {{ c.container_index + 1 }}</el-tag>
              <span>{{ c.equipment_title }}</span>
              <b>{{ c.cubic_meter.used_percent }}%</b>
            </div>
            <div class="result-tile__img">
              <PackingVisual :container="c" :params="store.params" :controls="false" compact />
            </div>
            <div class="result-tile__foot">
              <div class="result-tile__stat">
                <span>件数</span><b>{{ c.pieces_total }}</b>
              </div>
              <div class="result-tile__stat">
                <span>已用</span><b>{{ c.cubic_meter.used_volume_m3 }} m³</b>
              </div>
              <div class="result-tile__stat">
                <span>剩余</span><b>{{ c.cubic_meter.free_volume_m3 }} m³</b>
              </div>
            </div>
            <div class="result-tile__lines">
              <div v-for="line in c.cargo_lines" :key="line.skuid" class="result-tile__line">
                <i :style="{ backgroundColor: line.color }" />
                <span>{{ line.cargo_name }}</span>
                <span class="result-tile__order">订购 ×{{ orderQty(line.skuid) }}</span>
                <button
                  class="tile-line-btn"
                  data-testid="tile-less"
                  :disabled="store.aiSession.thinking"
                  @click="tileAdjust({ kind: 'qty', skuid: line.skuid, qty: orderQty(line.skuid) - 1 }, `「${line.cargo_name}」少一件`)"
                >
                  −
                </button>
                <b>{{ line.pieces }}/{{ line.pieces_total }}</b>
                <button
                  class="tile-line-btn"
                  data-testid="tile-more"
                  :disabled="store.aiSession.thinking"
                  @click="tileAdjust({ kind: 'qty', skuid: line.skuid, qty: orderQty(line.skuid) + 1 }, `「${line.cargo_name}」加一件`)"
                >
                  ＋
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- 商城：底部滑出的商品格 -->
    <el-drawer
      v-model="showMall"
      direction="btt"
      size="68%"
      title="选购货物"
      :append-to-body="true"
    >
      <div class="mall">
        <div class="mall__grid">
          <div
            v-for="g in library"
            :key="g.id"
            class="mall-card"
            :class="{ 'is-in': inCart.has(g.id) }"
            @click="addToCart(g)"
          >
            <span class="mall-card__thumb" :style="{ backgroundColor: g.color }">
              {{ g.name.slice(0, 2) }}
            </span>
            <span class="mall-card__name">{{ g.name }}</span>
            <span class="mall-card__meta">
              {{ g.category }} · {{ g.length }}×{{ g.width }}×{{ g.height }} · {{ g.weight }}kg/{{
                g.unit
              }}
            </span>
            <span class="mall-card__qty" v-if="inCart.has(g.id)">购物车 ×{{ inCart.get(g.id) }}</span>
            <span class="mall-card__cta" v-else>🛒 点击加入</span>
          </div>
        </div>
        <footer class="mall__bar">
          <span>
            购物车：<b>{{ store.params.cargoList.length }}</b> 项 ·
            <b>{{ totalPieces }}</b> 件 · <b>{{ totalWeight.toFixed(1) }}</b> kg
          </span>
          <el-button type="primary" @click="showMall = false">去结算 ↓</el-button>
        </footer>
      </div>
    </el-drawer>

    <!-- 历史装柜抽屉(右侧) -->
    <el-drawer v-model="showHistoryDrawer" title="历史装柜" size="460px" :append-to-body="true">
      <HistoryList
        :items="store.history"
        :loading="store.historyLoading"
        @load="loadHistory"
        @remove="store.removeHistory"
        @clear="store.clearHistory"
      />
    </el-drawer>

    <!-- AI 导购助手：聊天气泡 -->
    <button class="va-fab" data-testid="ai-fab" @click="showChat ? (showChat = false) : openChat()">
      🤖
      <span v-if="chatUnread && !showChat" class="va-fab__badge">{{ chatUnread }}</span>
    </button>
    <Transition name="chat">
      <div v-if="showChat" class="va-panel" data-testid="ai-chat">
        <header class="va-panel__head">
          <span>🤖 导购小柜 · AI 客服</span>
          <button class="va-panel__close" @click="showChat = false">×</button>
        </header>
        <div ref="messagesEl" class="va-panel__msgs">
          <div v-if="!chatTurns.length" class="va-panel__greet">
            我是导购小柜 🤖 出单后我可以帮你改订单、换柜型，随时吩咐～
          </div>
          <div
            v-for="t in chatTurns"
            :key="t.id"
            class="va-msg"
            :class="`va-msg--${t.role}`"
          >
            <span class="va-msg__who">{{ t.role === 'ai' ? '小柜' : '我' }}</span>
            <p class="va-msg__text">{{ isLatestAi(t) ? typed : t.text }}</p>
          </div>
          <div v-if="store.aiSession.thinking" class="va-msg va-msg--ai">
            <span class="va-msg__who">小柜</span>
            <span class="dots"><i /><i /><i /></span>
          </div>
        </div>
        <div class="va-panel__quick">
          <button
            v-for="q in quickReplies"
            :key="q.label"
            class="va-quick"
            data-testid="ai-quick"
            :disabled="store.aiSession.thinking"
            @click="onQuick(q)"
          >
            {{ q.label }}
          </button>
        </div>
        <footer class="va-panel__input">
          <el-input
            v-model="chatInput"
            placeholder="如「Table +10」「换 20GP」"
            :disabled="store.aiSession.thinking"
            @keyup.enter="sendChat"
          />
          <el-button type="primary" :disabled="store.aiSession.thinking" @click="sendChat">
            发送
          </el-button>
        </footer>
      </div>
    </Transition>

    <!-- 编辑弹窗 -->
    <el-dialog
      :model-value="editing !== null"
      title="编辑货物"
      width="480px"
      @update:model-value="(v: boolean) => { if (!v) editing = null }"
    >
      <template v-if="editing">
        <div class="edit-form">
          <div class="edit-form__field">
            <span>数量</span>
            <el-input-number
              v-model="editing.quantity"
              :min="1"
              controls-position="right"
              style="width: 100%"
            />
          </div>
          <div class="edit-form__field">
            <span>单件重 (kg)</span>
            <el-input-number
              v-model="editing.weight"
              :min="0"
              :step="0.1"
              controls-position="right"
              style="width: 100%"
            />
          </div>
          <div class="edit-form__field">
            <span>长 × 宽 × 高 (mm)</span>
            <div class="edit-form__dims">
              <el-input-number
                v-model="editing.spec.length"
                :min="1"
                controls-position="right"
              />
              <el-input-number v-model="editing.spec.width" :min="1" controls-position="right" />
              <el-input-number v-model="editing.spec.height" :min="1" controls-position="right" />
            </div>
          </div>
          <div class="edit-form__field">
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
.desk {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 76px;
}
/* KPI 条 */
.desk__kpi {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}
.kpi {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.kpi__num {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-color-primary);
}
.kpi__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
/* 卡片区 */
.desk__grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
  align-items: start;
}
.desk-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
}
.desk-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.desk-card__head h3 {
  font-size: 15px;
}
.desk-card__body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.desk-card__body--list {
  max-height: 460px;
  overflow-y: auto;
}
.desk-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.desk-row__color {
  width: 8px;
  height: 28px;
  border-radius: 2px;
  flex-shrink: 0;
}
.desk-row__main {
  flex: 1;
  min-width: 0;
}
.desk-row__name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.desk-row__meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.desk-row__qty {
  width: 96px;
  flex-shrink: 0;
}
.desk-row__qty :deep(.el-input-number) {
  width: 100%;
}
.desk-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.desk-field > span {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
/* 底部结算栏 */
.desk__dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color-light);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
  padding: 12px 28px;
}
.desk__dock-summary {
  font-size: 14px;
}
.desk__dock-summary b {
  color: var(--el-color-primary);
  font-size: 16px;
}
.desk__dock-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.desk__dock-history {
  margin-right: 4px;
}
/* 结果抽屉 */
.result-drawer {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.result-drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.result-drawer__head h2 {
  font-size: 18px;
}
.result-drawer__list {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  padding-bottom: 20px;
}
.result-tile {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.result-tile__head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.result-tile__head b {
  margin-left: auto;
  color: var(--el-color-primary);
  font-size: 15px;
}
.result-tile__img {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(180deg, #f0f3f8, #e2e8f1);
  overflow: hidden;
}
.result-tile__img :deep(svg) {
  width: 100%;
  height: 200px;
  display: block;
}
.result-tile__foot {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.result-tile__stat {
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  padding: 6px 10px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}
.result-tile__stat span {
  color: var(--el-text-color-secondary);
}
.result-tile__lines {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.result-tile__line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.result-tile__line i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}
.result-tile__line span {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 编辑弹窗 */
.edit-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
/* 结果行 AI 调整 */
.result-tile__order {
  flex: 0 0 auto;
  color: var(--el-text-color-secondary);
  font-size: 11px;
}
.tile-line-btn {
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
.tile-line-btn:hover:not(:disabled) {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.tile-line-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
/* AI 导购悬浮按钮与聊天面板 */
.va-fab {
  position: fixed;
  right: 24px;
  bottom: 88px;
  z-index: 60;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 0;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(64, 158, 255, 0.4);
  transition: transform 0.2s;
}
.va-fab:hover {
  transform: scale(1.08);
}
.va-fab__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--el-color-danger);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  padding: 0 4px;
}
.va-panel {
  position: fixed;
  right: 24px;
  bottom: 150px;
  z-index: 60;
  width: 340px;
  height: 460px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.va-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.va-panel__close {
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
}
.va-panel__msgs {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.va-panel__greet {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.7;
  border: 1px dashed var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 10px 12px;
}
.va-msg {
  max-width: 82%;
  font-size: 12px;
  line-height: 1.6;
}
.va-msg__who {
  display: block;
  font-size: 10px;
  color: var(--el-text-color-secondary);
  margin-bottom: 2px;
}
.va-msg__text {
  margin: 0;
  padding: 7px 10px;
  border-radius: 10px;
}
.va-msg--ai .va-msg__text {
  background: var(--el-fill-color-light);
  border-top-left-radius: 4px;
}
.va-msg--user {
  align-self: flex-end;
}
.va-msg--user .va-msg__text {
  background: var(--el-color-primary);
  color: #fff;
  border-top-right-radius: 4px;
}
.dots {
  display: inline-flex;
  gap: 4px;
  padding: 6px 0;
}
.dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-text-color-secondary);
  animation: va-dot 1s infinite ease-in-out;
}
.dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.dots i:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes va-dot {
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
.va-panel__quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.va-quick {
  border: 1px solid var(--el-color-primary-light-5);
  background: var(--el-bg-color);
  color: var(--el-color-primary);
  border-radius: 14px;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.va-quick:hover:not(:disabled) {
  background: var(--el-color-primary);
  color: #fff;
}
.va-quick:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.va-panel__input {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.va-panel__input .el-input {
  flex: 1;
}
.chat-enter-active,
.chat-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.chat-enter-from,
.chat-leave-to {
  opacity: 0;
  transform: translateY(14px) scale(0.96);
}
.edit-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.edit-form__field > span {
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
/* 商城 */
.mall {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}
.mall__grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  align-content: start;
}
.mall-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  user-select: none;
}
.mall-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.1);
}
.mall-card.is-in {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.mall-card__thumb {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mall-card__name {
  font-size: 14px;
  font-weight: 600;
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mall-card__meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.mall-card__cta {
  font-size: 12px;
  color: var(--el-color-primary);
}
.mall-card__qty {
  font-size: 12px;
  color: #fff;
  background: var(--el-color-primary);
  border-radius: 12px;
  padding: 2px 10px;
  align-self: flex-start;
}
.mall__bar {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}
.mall__bar b {
  color: var(--el-color-primary);
}
</style>
