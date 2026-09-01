<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { ContainerResult, PackingParams } from '@/types/packing'
import { downloadPackingResult } from '@/mock/packingApi'
import { usePackingStore } from '@/stores/packing'
import PackingVisual from '@/components/PackingVisual.vue'

const props = defineProps<{
  container: ContainerResult
  params: PackingParams
  visual?: boolean
  /** 开启后在所装货物表内提供 AI 调整步进器 */
  adjustable?: boolean
  /** 隐藏「下载装柜结果 PDF」按钮 */
  hideDownload?: boolean
}>()

const store = usePackingStore()
const downloading = ref(false)
const hoverLine = ref<string | null>(null)

async function download() {
  downloading.value = true
  try {
    const res = await downloadPackingResult(props.params, props.container.container_index)
    ElMessage.success('装柜结果 PDF 已开始下载(mock): ' + res.url)
  } finally {
    downloading.value = false
  }
}

/** 该货物当前订购数量 */
function orderQty(skuid: number): number {
  return store.params.cargoList.find((c) => c.id === skuid)?.quantity ?? 0
}

async function onAdjustQty(skuid: number, value: number | undefined) {
  const qty = value ?? 1
  if (qty === orderQty(skuid) || store.aiSession.thinking) return
  await store.adjustAi({ kind: 'qty', skuid, qty })
}
</script>

<template>
  <div class="container-card" :style="{ '--card-i': container.container_index }">
    <div class="container-card__head">
      <el-tag size="small" effect="dark">柜 {{ container.container_index + 1 }}</el-tag>
      <span class="container-card__title">{{ container.equipment_title }}</span>
      <div class="container-card__head-actions">
        <span class="container-card__pieces">共 {{ container.pieces_total }} 件</span>
        <el-button v-if="!props.hideDownload" size="small" :loading="downloading" @click="download">
          下载装柜结果 PDF
        </el-button>
      </div>
    </div>

    <div class="container-card__body">
      <div class="container-card__img">
        <PackingVisual
          v-if="visual"
          :container="container"
          :params="params"
          :highlight="hoverLine"
        />
        <img v-else :src="container.packing_diagram_url" :alt="container.equipment_title" />
      </div>

      <div class="container-card__tables">
        <section>
          <h4>所装货物</h4>
          <el-table :data="container.cargo_lines" size="small" border>
            <el-table-column type="index" label="#" width="40" />
            <el-table-column label="货物名称" min-width="200">
              <template #default="{ row }">
                <div
                  class="line-name"
                  :class="{ 'is-hot': hoverLine === row.skuid }"
                  @mouseenter="hoverLine = row.skuid"
                  @mouseleave="hoverLine = null"
                >
                  <i :style="{ backgroundColor: row.color }" />
                  {{ row.cargo_name }}
                </div>
              </template>
            </el-table-column>
            <el-table-column label="装量" prop="pieces" width="70" align="center" />
            <el-table-column label="总数" prop="pieces_total" width="70" align="center" />
            <el-table-column v-if="props.adjustable" label="订购量(AI 可调)" width="150" align="center">
              <template #default="{ row }">
                <el-input-number
                  :model-value="orderQty(row.skuid)"
                  :min="1"
                  size="small"
                  controls-position="right"
                  data-testid="qty-stepper"
                  @update:model-value="(v: number | undefined) => onAdjustQty(row.skuid, v)"
                />
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section>
          <h4>柜利用情况</h4>
          <el-table :data="[container.cubic_meter]" size="small" border>
            <el-table-column label="最大容积(m³)" prop="total_volume_m3" width="150" />
            <el-table-column label="已用(m³)" prop="used_volume_m3" width="140" />
            <el-table-column label="剩余(m³)" prop="free_volume_m3" width="140" />
            <el-table-column label="利用率" width="200">
              <template #default="{ row }">
                <el-progress
                  :percentage="row.used_percent"
                  :stroke-width="12"
                  :status="row.used_percent >= 80 ? 'exception' : 'success'"
                />
                <span class="percent-text">{{ row.used_percent }}%</span>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
  overflow: hidden;
  animation: card-in 0.45s ease both;
  animation-delay: calc(var(--card-i, 0) * 90ms);
  transition: box-shadow 0.25s, transform 0.25s;
}
.container-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.1);
}
@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
}
.container-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
}
.container-card__title {
  font-weight: 600;
  flex: 1;
  min-width: 0;
}
.container-card__head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.container-card__pieces {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.container-card__body {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  padding: 16px;
}
.container-card__img {
  flex: 1 1 260px;
  min-width: 0;
}
.container-card__img img {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}
.container-card__img :deep(.pv) {
  background: linear-gradient(180deg, #f0f3f8, #e2e8f1);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 6px;
}
.container-card__img :deep(.pv__svg) {
  height: 300px;
}
.container-card__tables {
  flex: 2 1 320px;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.container-card__tables h4 {
  font-size: 14px;
  margin-bottom: 8px;
}
.line-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  margin: -2px -6px;
  border-radius: 4px;
  cursor: default;
  transition: background 0.15s;
}
.line-name i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}
.line-name:hover,
.line-name.is-hot {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}
.percent-text {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
