<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePackingStore } from '@/stores/packing'
import { CARGO_DIRECTIONS } from '@/mock/constants'
import type { SelectedCargo } from '@/types/packing'
import DirectionDiagram from './DirectionDiagram.vue'
import { cargoTotals, cargoVolumeM3, cargoWeightKg } from '@/utils/cargoMath'

const store = usePackingStore()

const expandId = ref<number | null>(null)

function toggleExpand(item: SelectedCargo) {
  expandId.value = expandId.value === item.id ? null : item.id
}

const totals = computed(() => cargoTotals(store.params.cargoList))
const volPct = computed(() => {
  const v = store.params.container.volumeM3
  return v > 0 ? Math.round((totals.value.volumeM3 / v) * 100) : 0
})
const wtPct = computed(() => {
  const w = store.params.container.maxWeightKg
  return w > 0 ? Math.round((totals.value.weightKg / w) * 100) : 0
})

function barColor(pct: number): string {
  if (pct > 100) return '#f56c6c'
  if (pct >= 85) return '#e6a23c'
  return '#409eff'
}

let dupSeq = 0
function duplicate(index: number) {
  const src = store.params.cargoList[index]
  if (!src) return
  const copy = JSON.parse(JSON.stringify(src)) as SelectedCargo
  copy.id = -++dupSeq
  store.params.cargoList.splice(index + 1, 0, copy)
}

function wOf(item: SelectedCargo): number {
  return Math.round(cargoWeightKg(item) * 10) / 10
}
function vOf(item: SelectedCargo): string {
  return cargoVolumeM3(item).toFixed(2)
}
</script>

<template>
  <div class="cargo-list">
    <div v-if="store.params.cargoList.length === 0" class="cargo-list__empty">
      <el-empty description="暂未选择货物" :image-size="80" />
    </div>

    <template v-else>
      <div class="cargo-list__header">
        <span>已选货物 ({{ store.params.cargoList.length }} 项)</span>
        <el-button link type="danger" size="small" @click="store.clearCargo()">全部清空</el-button>
      </div>

      <div class="cargo-cap">
        <div class="cargo-cap__row">
          <span class="cargo-cap__label">体积</span>
          <el-progress
            class="cargo-cap__bar"
            :percentage="Math.min(100, volPct)"
            :color="barColor(volPct)"
            :stroke-width="8"
            :show-text="false"
          />
          <span class="cargo-cap__val" :class="{ 'is-over': volPct > 100 }">{{ volPct }}%</span>
        </div>
        <div class="cargo-cap__row">
          <span class="cargo-cap__label">重量</span>
          <el-progress
            class="cargo-cap__bar"
            :percentage="Math.min(100, wtPct)"
            :color="barColor(wtPct)"
            :stroke-width="8"
            :show-text="false"
          />
          <span class="cargo-cap__val" :class="{ 'is-over': wtPct > 100 }">{{ wtPct }}%</span>
        </div>
        <div class="cargo-cap__sub">
          合计 {{ totals.pieces }} 件 · {{ totals.weightKg }} kg · {{ totals.volumeM3 }} m³ / 柜型
          {{ store.params.container.name }} 容量 {{ store.params.container.maxWeightKg }} kg ·
          {{ store.params.container.volumeM3 }} m³
          <template v-if="volPct > 100 || wtPct > 100">
            <el-tag type="danger" size="small" effect="light">超出单柜容量</el-tag>
          </template>
        </div>
      </div>

      <TransitionGroup name="ci" tag="div" class="cargo-list__items">
        <div v-for="(item, index) in store.params.cargoList" :key="item.id" class="cargo-item">
        <div class="cargo-item__row">
          <span class="cargo-item__color" :style="{ backgroundColor: item.color }" />
          <div class="cargo-item__main">
            <div class="cargo-item__head">
              <div class="cargo-item__name">{{ item.name }}</div>
              <div class="cargo-item__qty">
                <el-input-number
                  :model-value="item.quantity"
                  :min="1"
                  size="small"
                  controls-position="right"
                  @update:model-value="(v: number | undefined) => (item.quantity = v ?? 1)"
                />
              </div>
            </div>
            <div class="cargo-item__foot">
              <div class="cargo-item__meta">
                {{ item.spec.length }}×{{ item.spec.width }}×{{ item.spec.height }} mm · 旋转
                {{ item.rotation.label }} · 合计 {{ item.quantity }}件 / {{ wOf(item) }}kg /
                {{ vOf(item) }}m³
              </div>
              <div class="cargo-item__ops">
                <el-button link type="primary" size="small" @click="toggleExpand(item)">
                  {{ expandId === item.id ? '收起' : '参数' }}
                </el-button>
                <el-button link type="primary" size="small" @click="duplicate(index)">复制</el-button>
                <el-button link type="danger" size="small" @click="store.removeCargo(index)">
                  移除
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <el-collapse-transition>
          <div v-show="expandId === item.id" class="cargo-item__panel">
            <div class="field-group">
              <div class="field">
                <span class="field__label">规格 长(mm)</span>
                <el-input-number
                  :model-value="item.spec.length"
                  :min="1"
                  size="small"
                  controls-position="right"
                  @update:model-value="
                    (v: number | undefined) => (item.spec.length = v ?? item.spec.length)
                  "
                />
              </div>
              <div class="field">
                <span class="field__label">宽(mm)</span>
                <el-input-number
                  :model-value="item.spec.width"
                  :min="1"
                  size="small"
                  controls-position="right"
                  @update:model-value="
                    (v: number | undefined) => (item.spec.width = v ?? item.spec.width)
                  "
                />
              </div>
              <div class="field">
                <span class="field__label">高(mm)</span>
                <el-input-number
                  :model-value="item.spec.height"
                  :min="1"
                  size="small"
                  controls-position="right"
                  @update:model-value="
                    (v: number | undefined) => (item.spec.height = v ?? item.spec.height)
                  "
                />
              </div>
              <div class="field">
                <span class="field__label">单件重(kg)</span>
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

            <div class="field">
              <span class="field__label">旋转方向</span>
              <el-radio-group
                :model-value="item.rotation.key"
                class="rotation-group"
                @update:model-value="
                  (key: string) => {
                    const dir = CARGO_DIRECTIONS.find((d) => d.key === key)
                    if (dir) item.rotation = dir
                  }
                "
              >
                <el-radio-button
                  v-for="dir in CARGO_DIRECTIONS"
                  :key="dir.key"
                  :value="dir.key"
                  class="rotation-option"
                >
                  <DirectionDiagram
                    :spec="item.spec"
                    :direction="dir"
                    :active="item.rotation.key === dir.key"
                    show-dimensions
                  />
                  <span class="rotation-option__label">{{ dir.label }}</span>
                  <span class="rotation-option__note">{{ dir.note }}</span>
                </el-radio-button>
              </el-radio-group>
            </div>

            <div class="field">
              <span class="field__label">备注</span>
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
      </TransitionGroup>
    </template>
  </div>
</template>

<style scoped>
.cargo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cargo-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.cargo-cap {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-extra-light);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  animation: cap-in 0.35s ease both;
}
@keyframes cap-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
}
.cargo-cap__row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cargo-cap__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  width: 28px;
  flex-shrink: 0;
}
.cargo-cap__bar {
  flex: 1;
}
.cargo-cap__val {
  font-size: 12px;
  color: var(--el-text-color-regular);
  width: 44px;
  text-align: right;
  flex-shrink: 0;
}
.cargo-cap__val.is-over {
  color: var(--el-color-danger);
  font-weight: 600;
}
.cargo-cap__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.cargo-list__items {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ci-enter-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
  animation: ci-flash 1s ease 0.3s both;
}
.ci-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}
@keyframes ci-flash {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0);
  }
  35% {
    box-shadow: 0 0 0 4px var(--el-color-primary-light-7);
    border-color: var(--el-color-primary);
  }
}
.ci-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
  position: absolute;
  width: 100%;
}
.ci-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
.ci-move {
  transition: transform 0.3s ease;
}
.cargo-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.cargo-item__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}
.cargo-item__color {
  width: 10px;
  height: 32px;
  border-radius: 3px;
  flex-shrink: 0;
}
.cargo-item__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cargo-item__head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.cargo-item__head .cargo-item__name {
  flex: 1;
  min-width: 0;
}
.cargo-item__name {
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cargo-item__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.cargo-item__ops {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.cargo-item__ops .el-button + .el-button {
  margin-left: 8px;
}
.cargo-item__meta {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.cargo-item__qty {
  width: 110px;
  flex-shrink: 0;
}
.cargo-item__qty :deep(.el-input-number) {
  width: 100%;
}
.cargo-item__panel {
  border-top: 1px dashed var(--el-border-color-lighter);
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.field-group {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.rotation-group {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}
.rotation-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  font-size: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  cursor: pointer;
  transition: all 0.15s;
  height: auto;
}
.rotation-option :deep(.el-radio-button__inner) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  border: 0;
  box-shadow: none;
  padding: 0;
  line-height: 1.3;
  font-size: 12px;
  height: auto;
  border-radius: 0;
}
.rotation-option .direction-diagram {
  width: 72px;
  height: 72px;
}
.rotation-option__label {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.rotation-option__note {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.rotation-option.is-active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}
</style>
