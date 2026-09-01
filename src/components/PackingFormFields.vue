<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { usePackingStore } from '@/stores/packing'
import { cargoTotals } from '@/utils/cargoMath'

const store = usePackingStore()

const props = defineProps<{
  /** 紧凑模式：控件变小、数值字段双列排布(demo9 使用) */
  compact?: boolean
}>()

const totals = computed(() => cargoTotals(store.params.cargoList))

/** 按当前货物总体积/总重，推荐最小可容纳的柜型 */
function recommend() {
  if (store.params.cargoList.length === 0) {
    ElMessage.info('请先选择货物')
    return
  }
  const fit = [...store.containerTypes]
    .filter(
      (c) => c.maxWeightKg >= totals.value.weightKg && c.volumeM3 >= totals.value.volumeM3,
    )
    .sort((a, b) => a.volumeM3 - b.volumeM3)[0]
  if (fit) {
    store.setContainer(fit)
    ElMessage.success(`已按当前货物选择最小可容纳柜型：${fit.name}`)
  } else {
    const big = [...store.containerTypes].sort((a, b) => b.volumeM3 - a.volumeM3)[0]
    if (big) {
      store.setContainer(big)
      ElMessage.warning(`货物超出最大柜型承载，已选择最大柜型 ${big.name}`)
    }
  }
}

onMounted(() => {
  store.loadContainerTypes()
})
</script>

<template>
  <div class="packing-fields" :class="{ 'packing-fields--compact': props.compact }">
    <div class="pf pf--container">
      <div class="pf__head">
        <label class="pf__label">柜型</label>
        <el-button link type="primary" size="small" @click="recommend">按货物推荐</el-button>
      </div>
      <el-select
        :model-value="store.params.container.id"
        :size="props.compact ? 'default' : 'large'"
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
          :label="`${t.name}（容积 ${t.volumeM3} m³）`"
          :value="t.id"
        />
      </el-select>
      <div class="pf__hint">
        内尺寸 {{ store.params.container.innerLength }}×{{ store.params.container.innerWidth }}×{{
          store.params.container.innerHeight
        }}
        mm
        <template v-if="totals.items > 0">
          · 货物合计 {{ totals.pieces }} 件 / {{ totals.weightKg }}kg / {{ totals.volumeM3 }}m³
        </template>
      </div>
    </div>

    <div class="pf-num-grid">
      <div class="pf pf--num">
        <label class="pf__label">每箱溢出量 (mm)</label>
        <el-input-number
          v-model="store.params.overflowPerBox"
          :min="0"
          :max="200"
          controls-position="right"
          :size="props.compact ? 'default' : 'large'"
          style="width: 100%"
        />
      </div>

      <div class="pf pf--num">
        <label class="pf__label">最上层桌子叠放数</label>
        <el-input-number
          v-model="store.params.topTableStackCount"
          :min="0"
          :max="20"
          controls-position="right"
          :size="props.compact ? 'default' : 'large'"
          style="width: 100%"
        />
      </div>

      <div class="pf pf--num">
        <label class="pf__label">尺寸最大可调比例 (%)</label>
        <el-input-number
          v-model="store.params.maxAdjustRatio"
          :min="0"
          :max="100"
          :step="1"
          controls-position="right"
          :size="props.compact ? 'default' : 'large'"
          style="width: 100%"
        />
      </div>
    </div>

    <div class="pf pf--custom">
      <label class="pf__label">自定义内容</label>
      <el-input
        v-model="store.params.customContent"
        type="textarea"
        :rows="props.compact ? 2 : 3"
        placeholder="请输入附加的装柜要求 / 备注"
      />
    </div>
  </div>
</template>

<style scoped>
.packing-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pf {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pf__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pf__label {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.pf__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
/* 紧凑模式 */
.pf-num-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.packing-fields--compact {
  gap: 10px;
}
.packing-fields--compact .pf {
  gap: 4px;
}
.packing-fields--compact .pf-num-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
}
.packing-fields--compact .pf__label {
  font-size: 12px;
}
</style>
