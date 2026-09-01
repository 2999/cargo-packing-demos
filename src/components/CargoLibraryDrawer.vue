<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { CargoOption } from '@/types/packing'
import { fetchCargoLibrary } from '@/mock/packingApi'
import { usePackingStore } from '@/stores/packing'
import { cargoTotals } from '@/utils/cargoMath'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const store = usePackingStore()

const loading = ref(false)
const library = ref<CargoOption[]>([])
const keyword = ref('')
const category = ref('')

const categories = computed(() => {
  const set = new Set(library.value.map((c) => c.category))
  return Array.from(set)
})

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return library.value.filter((c) => {
    const matchKw = !kw || c.name.toLowerCase().includes(kw) || String(c.id) === kw
    const matchCat = !category.value || c.category === category.value
    return matchKw && matchCat
  })
})

/** 已选货物在列表中的数量映射，用于卡片上显示已选状态 */
const selectedMap = computed(() => {
  const map = new Map<number, number>()
  for (const c of store.params.cargoList) map.set(c.id, c.quantity)
  return map
})

const totals = computed(() => cargoTotals(store.params.cargoList))

/** 汇总条弹跳计数：变化即重触发动画 */
const footerBump = ref(0)
const footerTotalsRef = ref<HTMLElement | null>(null)
let flying = false

function bumpFooter() {
  footerBump.value++
}

function load() {
  loading.value = true
  fetchCargoLibrary()
    .then((data) => (library.value = data))
    .finally(() => (loading.value = false))
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      keyword.value = ''
      category.value = ''
      if (library.value.length === 0) load()
    }
  },
)

/**
 * 「嗖」飞入动画：从点击的按钮生成一个货物色小方块，
 * 沿弧线(二次贝塞尔)飞向底部汇总条，到达时汇总条弹跳。
 */
function add(option: CargoOption, ev?: MouseEvent) {
  store.addCargo(option)
  ElMessage.success(`已加入「${option.name}」`)
  const btn = (ev?.currentTarget as HTMLElement | undefined) ?? null
  const footer = footerTotalsRef.value
  if (!btn || !footer || flying) return
  flying = true
  const from = btn.getBoundingClientRect()
  const to = footer.getBoundingClientRect()
  const ghost = document.createElement('span')
  ghost.textContent = option.name.slice(0, 2)
  ghost.style.cssText = `position:fixed;z-index:9999;pointer-events:none;width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;box-shadow:0 4px 14px rgba(15,23,42,.35);background:${option.color};left:${from.left + from.width / 2 - 18}px;top:${from.top - 18}px;`
  document.body.appendChild(ghost)
  const sx = from.left + from.width / 2 - 18
  const sy = from.top - 18
  const ex = to.left + to.width / 2 - 18
  const ey = to.top + to.height / 2 - 18
  const cx = (sx + ex) / 2 + 80
  const cy = Math.min(sy, ey) - 90
  const t0 = performance.now()
  const D = 550
  const fly = (now: number) => {
    const p = Math.min(1, (now - t0) / D)
    const e = p * (2 - p)
    const x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * cx + e * e * ex
    const y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * cy + e * e * ey
    ghost.style.transform = `translate(${x - sx}px, ${y - sy}px) scale(${1 - e * 0.4})`
    ghost.style.opacity = String(1 - e * 0.25)
    if (p < 1) requestAnimationFrame(fly)
    else {
      ghost.remove()
      flying = false
      bumpFooter()
    }
  }
  requestAnimationFrame(fly)
}

function setQty(option: CargoOption, qty: number) {
  const item = store.params.cargoList.find((c) => c.id === option.id)
  if (!item) return
  if (qty <= 0) {
    const idx = store.params.cargoList.findIndex((c) => c.id === option.id)
    if (idx >= 0) {
      store.removeCargo(idx)
      ElMessage.info(`已移除「${option.name}」`)
      bumpFooter()
    }
    return
  }
  item.quantity = qty
  bumpFooter()
}
</script>

<template>
  <el-drawer v-model="visible" title="选择货物" size="520px" :append-to-body="true">
    <div class="cargo-library">
      <div class="cargo-library__toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索货物名称 / ID"
          clearable
          :prefix-icon="'Search'"
          data-testid="cargo-search"
        />
        <el-select v-model="category" placeholder="全部分类" clearable style="width: 160px">
          <el-option v-for="cat in categories" :key="cat" :label="cat" :value="cat" />
        </el-select>
      </div>

      <el-alert
        v-if="filtered.length === 0 && !loading"
        title="没有符合条件的货物"
        type="info"
        show-icon
        :closable="false"
      />

      <div v-loading="loading" class="cargo-library__list">
        <div
          v-for="g in filtered"
          :key="g.id"
          class="cargo-card"
          :class="{ 'is-selected': selectedMap.has(g.id) }"
        >
          <div class="cargo-card__thumb" :style="{ backgroundColor: g.color }">
            <span>{{ g.name.slice(0, 2) }}</span>
          </div>
          <div class="cargo-card__info">
            <div class="cargo-card__name">{{ g.name }}</div>
            <div class="cargo-card__meta">
              {{ g.category }} · {{ g.length }}×{{ g.width }}×{{ g.height }} mm ·
              {{ g.weight }}kg/{{ g.unit }}
            </div>
          </div>
          <template v-if="selectedMap.has(g.id)">
            <el-input-number
              class="cargo-card__qty"
              :model-value="selectedMap.get(g.id)!"
              :min="0"
              size="small"
              controls-position="right"
              @update:model-value="(v: number | undefined) => setQty(g, v ?? 0)"
            />
          </template>
          <el-button v-else type="primary" plain size="small" @click="add(g, $event)">加入</el-button>
        </div>
      </div>

      <div class="cargo-library__footer">
        <div :key="footerBump" ref="footerTotalsRef" class="cargo-library__totals bump">
          <template v-if="totals.items > 0">
            <span>已选 <b>{{ totals.items }}</b> 项</span>
            <span>共 <b>{{ totals.pieces }}</b> 件</span>
            <span>{{ totals.weightKg }} kg</span>
            <span>{{ totals.volumeM3 }} m³</span>
          </template>
          <span v-else class="cargo-library__totals--empty">尚未选择货物</span>
        </div>
        <el-button type="primary" :disabled="totals.items === 0" @click="visible = false">
          完成
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.cargo-library {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
}
.cargo-library__toolbar {
  display: flex;
  gap: 10px;
}
.cargo-library__list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 200px;
}
.cargo-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  transition: border-color 0.15s;
}
.cargo-card.is-selected {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}
.cargo-card__qty {
  width: 104px;
  flex-shrink: 0;
}
.cargo-library__footer {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.cargo-library__totals {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  flex-wrap: wrap;
}
.cargo-library__totals b {
  color: var(--el-color-primary);
}
.cargo-library__totals--empty {
  color: var(--el-text-color-secondary);
}
.cargo-library__totals.bump {
  animation: totals-bump 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes totals-bump {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.06);
  }
  100% {
    transform: scale(1);
  }
}
.cargo-card__thumb {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  flex-shrink: 0;
}
.cargo-card__info {
  flex: 1;
  min-width: 0;
}
.cargo-card__name {
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cargo-card__meta {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 2px;
}
</style>
