<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePackingStore, formatHistoryTime } from '@/stores/packing'
import { CARGO_DIRECTIONS } from '@/mock/constants'
import { fetchCargoLibrary } from '@/mock/packingApi'
import type { AiOp, CargoOption, SelectedCargo } from '@/types/packing'

/**
 * 方案三 · 表格工作台 + AI 公式栏命令行：
 * 表格顶部有一条「公式栏」，用终端语法发 AI 指令——
 * `-1 沙发`、`+5 桌子`、`沙发=8`、`柜型=40GP`、`重算`，
 * 回车执行，状态行回执并高亮受影响行。
 */
const store = usePackingStore()
const showPick = ref(false)
const library = ref<CargoOption[]>([])
const pickedRows = ref<CargoOption[]>([])
const pickQty = ref<Record<number, number>>({})
const selectedRows = ref<SelectedCargo[]>([])

const rows = computed(() => store.params.cargoList)

const totalWeight = computed(() =>
  rows.value.reduce((sum, c) => sum + c.weight * c.quantity, 0),
)

const historyRows = computed(() =>
  store.history.map((item) => ({
    id: item.id,
    time: formatHistoryTime(item.time),
    containerName: item.containerName,
    cargoCount: item.cargoCount,
    piecesTotal: item.piecesTotal,
    containerCount: item.containerCount,
    avgUsedPercent: item.avgUsedPercent,
    cargoSummary: item.cargoSummary.join('、'),
  })),
)

onMounted(() => {
  store.loadHistory()
  fetchCargoLibrary().then((data) => (library.value = data))
})

function openPick() {
  pickedRows.value = []
  pickQty.value = {}
  showPick.value = true
}

function confirmPick() {
  if (pickedRows.value.length === 0) {
    ElMessage.warning('请先勾选货物')
    return
  }
  for (const opt of pickedRows.value) {
    const qty = pickQty.value[opt.id] ?? 1
    for (let i = 0; i < qty; i++) store.addCargo(opt)
  }
  ElMessage.success(`已追加 ${pickedRows.value.length} 项货物`)
  showPick.value = false
}

function loadHistory(id: string) {
  if (store.restoreHistory(id)) ElMessage.success('已载入历史装柜')
}

function onSelectionChange(rows: SelectedCargo[]) {
  selectedRows.value = rows
}

function removeSelected() {
  const ids = new Set(selectedRows.value.map((r) => r.id))
  store.params.cargoList = store.params.cargoList.filter((c) => !ids.has(c.id))
  ElMessage.success(`已删除 ${ids.size} 项`)
}

async function submit() {
  const ok = await store.runPacking()
  if (ok) ElMessage.success('AI 装柜完成')
}

/* ── AI 公式栏命令行 ── */
const formula = ref('')
const formulaError = ref('')

const lastAiText = computed(() => {
  const turns = store.aiSession.turns
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]!.role === 'ai') return turns[i]!.text
  }
  return ''
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
  // 删除/移除 name
  const rm = t.match(/^(?:删除|移除|-)\s+(.+)$/i)
  if (rm) {
    const cargo = findCargo(rm[1]!)
    if (cargo) return { kind: 'remove', skuid: cargo.id }
  }
  // name=8
  const setM = t.match(/^(.+?)\s*[=＝]\s*(\d+)$/)
  if (setM) {
    const cargo = findCargo(setM[1]!)
    if (cargo) return { kind: 'qty', skuid: cargo.id, qty: Number(setM[2]) }
  }
  // +5 name / name +2
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

async function runFormula() {
  const text = formula.value.trim()
  if (!text) return
  formulaError.value = ''
  const op = parseFormula(text)
  if (!op) {
    formulaError.value = `无法识别指令「${text}」，试试 +5 桌子 / 沙发=8 / 删除 椅子 / 柜型=40GP / 重算`
    return
  }
  const ok = await store.adjustAi(op, text)
  if (ok) formula.value = ''
}

function rotateKey(item: SelectedCargo): string {
  return item.rotation.key
}

function onRotateChange(item: SelectedCargo, key: string) {
  const dir = CARGO_DIRECTIONS.find((d) => d.key === key)
  if (dir) item.rotation = dir
}
</script>

<template>
  <div class="grid">
    <header class="grid__head">
      <div>
        <h2>装柜表格工作台</h2>
        <p>类 Excel 内联编辑：直接在表格里改数量、规格与旋转方向，支持勾选批量操作。</p>
      </div>
      <div class="grid__head-actions">
        <el-button @click="openPick">+ 添加货物</el-button>
        <el-button type="danger" plain :disabled="selectedRows.length === 0" @click="removeSelected">
          删除选中 ({{ selectedRows.length }})
        </el-button>
        <el-button type="primary" :loading="store.packing" @click="submit">开始装柜</el-button>
      </div>
    </header>

    <!-- 参数横栏 -->
    <div class="param-bar">
      <div class="param-bar__item">
        <span class="param-bar__label">柜型</span>
        <el-select
          :model-value="store.params.container.id"
          size="small"
          style="width: 130px"
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
      <div class="param-bar__item">
        <span class="param-bar__label">溢出(mm)</span>
        <el-input-number
          v-model="store.params.overflowPerBox"
          :min="0"
          :max="200"
          size="small"
          controls-position="right"
          style="width: 110px"
        />
      </div>
      <div class="param-bar__item">
        <span class="param-bar__label">叠放数</span>
        <el-input-number
          v-model="store.params.topTableStackCount"
          :min="0"
          :max="20"
          size="small"
          controls-position="right"
          style="width: 100px"
        />
      </div>
      <div class="param-bar__item">
        <span class="param-bar__label">可调比例(%)</span>
        <el-input-number
          v-model="store.params.maxAdjustRatio"
          :min="0"
          :max="100"
          size="small"
          controls-position="right"
          style="width: 110px"
        />
      </div>
      <div class="param-bar__item param-bar__item--grow">
        <span class="param-bar__label">自定义</span>
        <el-input
          v-model="store.params.customContent"
          size="small"
          placeholder="附加装柜要求 / 备注"
        />
      </div>
      <div class="param-bar__total">合计 {{ totalWeight.toFixed(1) }} kg</div>
    </div>

    <!-- 货物表格 -->
    <div class="grid-table">
      <el-table
        :data="rows"
        border
        size="small"
        empty-text="暂未选择货物，点击右上角「添加货物」"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="42" />
        <el-table-column type="index" label="#" width="46" />
        <el-table-column label="货物" min-width="180">
          <template #default="{ row }">
            <div class="cell-cargo">
              <span class="cell-cargo__swatch" :style="{ backgroundColor: row.color }" />
              <span class="cell-cargo__name">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="长(mm)" width="120">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.spec.length"
              :min="1"
              size="small"
              controls-position="right"
              @update:model-value="(v: number | undefined) => (row.spec.length = v ?? 1)"
            />
          </template>
        </el-table-column>
        <el-table-column label="宽(mm)" width="120">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.spec.width"
              :min="1"
              size="small"
              controls-position="right"
              @update:model-value="(v: number | undefined) => (row.spec.width = v ?? 1)"
            />
          </template>
        </el-table-column>
        <el-table-column label="高(mm)" width="120">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.spec.height"
              :min="1"
              size="small"
              controls-position="right"
              @update:model-value="(v: number | undefined) => (row.spec.height = v ?? 1)"
            />
          </template>
        </el-table-column>
        <el-table-column label="数量" width="130">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.quantity"
              :min="1"
              size="small"
              controls-position="right"
              @update:model-value="(v: number | undefined) => (row.quantity = v ?? 1)"
            />
          </template>
        </el-table-column>
        <el-table-column label="单件重(kg)" width="120">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.weight"
              :min="0"
              :step="0.1"
              size="small"
              controls-position="right"
              @update:model-value="(v: number | undefined) => (row.weight = v ?? 0)"
            />
          </template>
        </el-table-column>
        <el-table-column label="旋转方向" width="130">
          <template #default="{ row }">
            <el-select
              :model-value="rotateKey(row)"
              size="small"
              @update:model-value="(k: string) => onRotateChange(row, k)"
            >
              <el-option v-for="d in CARGO_DIRECTIONS" :key="d.key" :label="d.label" :value="d.key" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="140">
          <template #default="{ row }">
            <el-input
              :model-value="row.remark"
              size="small"
              placeholder="备注"
              @update:model-value="(v: string) => (row.remark = v ?? '')"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="70" fixed="right">
          <template #default="{ $index }">
            <el-button link type="danger" size="small" @click="store.removeCargo($index)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 结果（展开式表格 + AI 公式栏） -->
    <section v-if="store.result" class="grid-result">
      <header class="grid-result__head">
        <h3>装柜结果 · 共 {{ store.result.container_count }} 个柜</h3>
        <el-tag v-if="store.aiSession.round" size="small" effect="plain">
          第 {{ store.aiSession.round }} 轮
        </el-tag>
      </header>

      <!-- AI 公式栏：终端语法发指令 -->
      <div class="fx-bar" data-testid="formula-bar">
        <span class="fx-bar__prefix">fx</span>
        <el-input
          v-model="formula"
          class="fx-bar__input"
          placeholder="-1 沙发 · +5 桌子 · 沙发=8 · 删除 椅子 · 柜型=40GP · 重算"
          :disabled="store.aiSession.thinking"
          data-testid="formula-input"
          @keyup.enter="runFormula"
        />
        <el-button type="primary" :disabled="store.aiSession.thinking" data-testid="formula-run" @click="runFormula">
          执行
        </el-button>
      </div>
      <!-- AI 状态行回执 -->
      <div class="fx-status" data-testid="formula-status">
        <template v-if="store.aiSession.thinking">
          <span class="fx-status__label fx-status__label--busy">⌁ AI 计算中…</span>
        </template>
        <template v-else-if="formulaError">
          <span class="fx-status__label fx-status__label--err">✗ {{ formulaError }}</span>
        </template>
        <template v-else-if="lastAiText">
          <span class="fx-status__label">🤖 {{ lastAiText }}</span>
        </template>
        <template v-else>
          <span class="fx-status__label fx-status__label--muted">在公式栏输入指令调整方案，回车执行</span>
        </template>
      </div>
      <el-table
        :data="store.result.containers"
        border
        size="small"
        row-key="container_index"
        :expand-row-keys="['0']"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="grid-result__expand">
              <div class="grid-result__img">
                <img :src="row.packing_diagram_url" :alt="row.equipment_title" />
              </div>
              <div class="grid-result__lines">
                <div class="grid-result__lines-title">所装货物</div>
                <el-table :data="row.cargo_lines" size="small" border>
                  <el-table-column type="index" label="#" width="40" />
                  <el-table-column label="货物名称" prop="cargo_name" min-width="180" />
                  <el-table-column label="装量" prop="pieces" width="80" align="center" />
                  <el-table-column label="总数" prop="pieces_total" width="80" align="center" />
                </el-table>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="柜号" width="80">
          <template #default="{ row }">{{ row.container_index + 1 }}</template>
        </el-table-column>
        <el-table-column label="设备" prop="equipment_title" min-width="200" />
        <el-table-column label="件数" prop="pieces_total" width="80" align="center" />
        <el-table-column label="已用(m³)" prop="cubic_meter.used_volume_m3" width="100" align="center" />
        <el-table-column label="剩余(m³)" prop="cubic_meter.free_volume_m3" width="100" align="center" />
        <el-table-column label="利用率" width="220">
          <template #default="{ row }">
            <el-progress
              :percentage="row.cubic_meter.used_percent"
              :stroke-width="12"
              :status="row.cubic_meter.used_percent >= 80 ? 'exception' : 'success'"
            />
          </template>
        </el-table-column>
      </el-table>
    </section>
    <el-empty v-else description="点击「开始装柜」生成结果" :image-size="80" />

    <!-- 历史装柜表格 -->
    <section class="grid-history">
      <header class="grid-history__head">
        <h3>历史装柜列表 ({{ historyRows.length }})</h3>
        <el-button
          v-if="historyRows.length"
          link
          type="danger"
          size="small"
          @click="store.clearHistory()"
        >
          清空历史
        </el-button>
      </header>
      <el-table
        :data="historyRows"
        border
        size="small"
        empty-text="暂无历史装柜"
        v-loading="store.historyLoading"
      >
        <el-table-column label="装柜时间" prop="time" width="150" />
        <el-table-column label="柜型" prop="containerName" width="90" align="center" />
        <el-table-column label="货物摘要" prop="cargoSummary" min-width="220" show-overflow-tooltip />
        <el-table-column label="货物项" prop="cargoCount" width="80" align="center" />
        <el-table-column label="总件数" prop="piecesTotal" width="90" align="center" />
        <el-table-column label="用柜" prop="containerCount" width="70" align="center" />
        <el-table-column label="平均利用率" width="120" align="center">
          <template #default="{ row }">{{ row.avgUsedPercent }}%</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="loadHistory(row.id)">载入</el-button>
            <el-button link type="danger" size="small" @click="store.removeHistory(row.id)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <!-- 货物库选取对话框(表格勾选范式) -->
    <el-dialog v-model="showPick" title="从货物库选取" width="760px">
      <el-table
        :data="library"
        size="small"
        border
        max-height="420"
        @selection-change="(rows: CargoOption[]) => (pickedRows = rows)"
      >
        <el-table-column type="selection" width="42" />
        <el-table-column label="货物" min-width="200">
          <template #default="{ row }">
            <div class="pick-cell">
              <span class="pick-cell__swatch" :style="{ backgroundColor: row.color }" />
              <span class="pick-cell__name">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="分类" prop="category" width="80" align="center" />
        <el-table-column label="规格(mm)" width="180" align="center">
          <template #default="{ row }">{{ row.length }}×{{ row.width }}×{{ row.height }}</template>
        </el-table-column>
        <el-table-column label="单件重(kg)" prop="weight" width="100" align="center" />
        <el-table-column label="数量" width="150" align="center">
          <template #default="{ row }">
            <el-input-number
              v-model="pickQty[row.id]"
              :min="1"
              :max="999"
              size="small"
              controls-position="right"
              @click.stop
            />
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showPick = false">取消</el-button>
        <el-button type="primary" :disabled="pickedRows.length === 0" @click="confirmPick">
          加入所选 ({{ pickedRows.length }})
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.grid__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}
.grid__head h2 {
  font-size: 22px;
}
.grid__head p {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-top: 4px;
}
.grid__head-actions {
  display: flex;
  gap: 10px;
}
/* 参数横栏 */
.param-bar {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 10px 16px;
}
.param-bar__item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.param-bar__item--grow {
  flex: 1;
  min-width: 200px;
}
.param-bar__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.param-bar__total {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
/* 表格 */
.grid-table :deep(.el-input-number) {
  width: 100%;
}
.grid-table :deep(.cell-cargo__name) {
  font-size: 13px;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 结果 */
.grid-result__head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.grid-result__head h3 {
  font-size: 16px;
}
/* AI 公式栏 */
.fx-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #1e2430;
  border-radius: 8px;
  padding: 8px 12px;
}
.fx-bar__prefix {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: #7ee787;
  font-weight: 700;
  font-size: 14px;
}
.fx-bar__input :deep(.el-input__wrapper) {
  background: transparent;
  box-shadow: none;
}
.fx-bar__input :deep(.el-input__inner) {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: #e6edf3;
  caret-color: #7ee787;
}
.fx-bar__input :deep(.el-input__inner::placeholder) {
  color: #6a7385;
}
/* 状态行回执 */
.fx-status {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
  min-height: 18px;
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
.grid-result__expand {
  display: flex;
  gap: 20px;
  padding: 12px 16px;
}
.grid-result__img {
  flex: 0 0 420px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(180deg, #f0f3f8, #e2e8f1);
}
.grid-result__img img {
  width: 100%;
  display: block;
  border-radius: 8px;
}
.grid-result__lines {
  flex: 1;
  min-width: 0;
}
.grid-result__lines-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}
/* 历史表格 */
.grid-history__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.grid-history__head h3 {
  font-size: 16px;
}
/* 货物库选取表格 */
.pick-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pick-cell__swatch {
  width: 8px;
  height: 24px;
  border-radius: 2px;
  flex-shrink: 0;
}
.pick-cell__name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
