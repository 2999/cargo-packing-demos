<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePackingStore } from '@/stores/packing'
import { downloadPackingOrder } from '@/mock/packingApi'
import ResultContainerCard from './ResultContainerCard.vue'

const props = defineProps<{
  visual?: boolean
  /** 开启后在所装货物表内提供 AI 调整步进器(demo1 批注流) */
  adjustable?: boolean
  /** 隐藏柜卡片上的「下载装柜结果 PDF」按钮 */
  hideDownload?: boolean
}>()

const store = usePackingStore()
const orderDownloading = ref(false)

const totalPieces = computed(
  () => store.result?.containers.reduce((sum, c) => sum + c.pieces_total, 0) ?? 0,
)

async function downloadOrder() {
  if (!store.result) return
  orderDownloading.value = true
  try {
    const res = await downloadPackingOrder({
      params: JSON.parse(JSON.stringify(store.params)),
    })
    ElMessage.success('装柜顺序 PDF 已开始下载(mock): ' + res.url)
  } finally {
    orderDownloading.value = false
  }
}
</script>

<template>
  <Transition name="results-fade" mode="out-in">
    <div v-if="!store.result" key="empty" class="results-empty">
      <slot name="empty">
        <el-empty description="提交装柜后在此查看结果" :image-size="120" />
      </slot>
    </div>

    <div v-else key="result" v-loading="store.packing" class="results">
    <div class="results__topbar">
      <div class="results__summary">
        <el-tag :type="store.result.is_full ? 'success' : 'warning'" size="large" effect="plain">
          {{ store.result.is_full ? '柜已装满' : '柜未装满' }}
        </el-tag>
        <span class="results__count">共 {{ store.result.container_count }} 个柜 · 合计 {{ totalPieces }} 件</span>
      </div>
      <el-button type="primary" :loading="orderDownloading" @click="downloadOrder">
        下载装柜顺序 PDF
      </el-button>
    </div>

    <div class="results__list">
      <ResultContainerCard
        v-for="c in store.result.containers"
        :key="c.container_index"
        :container="c"
        :params="store.params"
        :visual="props.visual"
        :adjustable="props.adjustable"
        :hide-download="props.hideDownload"
      />
    </div>
    </div>
  </Transition>
</template>

<style scoped>
.results {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.results-empty {
  flex: 1;
  min-width: 0;
  min-height: 420px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.results__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.results__summary {
  display: flex;
  align-items: center;
  gap: 12px;
}
.results__count {
  font-size: 14px;
  color: var(--el-text-color-primary);
}
.results__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.results-fade-enter-active,
.results-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.results-fade-enter-from,
.results-fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
