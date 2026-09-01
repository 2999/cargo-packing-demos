<script setup lang="ts">
import type { PackingHistoryItem } from '@/types/packing'
import { formatHistoryTime } from '@/stores/packing'

/**
 * 历史装柜列表(通用行式布局)。
 * 供抽屉 / 折叠面板 / 气泡卡片 / 页签等容器复用，
 * 时间线(demo4)与表格(demo3)两种形态由对应 demo 自行实现。
 */
defineProps<{
  items: PackingHistoryItem[]
  loading?: boolean
}>()

const emit = defineEmits<{
  load: [id: string]
  remove: [id: string]
  clear: []
}>()
</script>

<template>
  <div class="history-list" v-loading="loading">
    <el-empty v-if="items.length === 0 && !loading" description="暂无历史装柜" :image-size="60" />

    <template v-else>
      <TransitionGroup name="hl" tag="div" class="history-list__rows">
        <div
          v-for="(item, i) in items"
          :key="item.id"
          class="history-list__row"
          :style="{ '--row-i': i }"
        >
        <div class="history-list__main">
          <div class="history-list__title">
            <el-tag size="small" effect="plain">{{ item.containerName }}</el-tag>
            <span class="history-list__time">{{ formatHistoryTime(item.time) }}</span>
          </div>
          <div class="history-list__meta">
            {{ item.cargoCount }} 项货物 / {{ item.piecesTotal }} 件 ·
            {{ item.containerCount }} 个柜 · 平均利用率 {{ item.avgUsedPercent }}%
          </div>
          <div class="history-list__summary">{{ item.cargoSummary.join('、') }}</div>
        </div>
        <div class="history-list__ops">
          <el-button link type="primary" size="small" @click="emit('load', item.id)">
            载入
          </el-button>
          <el-button link type="danger" size="small" @click="emit('remove', item.id)">
            删除
          </el-button>
        </div>
        </div>
      </TransitionGroup>

      <el-button class="history-list__clear" link type="danger" size="small" @click="emit('clear')">
        清空历史
      </el-button>
    </template>
  </div>
</template>

<style scoped>
.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.history-list__rows {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.history-list__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  transition: border-color 0.15s;
  animation: hl-in 0.4s ease both;
  animation-delay: calc(var(--row-i, 0) * 60ms);
}
@keyframes hl-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
.hl-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
  position: absolute;
  width: 100%;
}
.hl-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
.hl-move {
  transition: transform 0.3s ease;
}
.history-list__row:hover {
  border-color: var(--el-color-primary-light-5);
}
.history-list__main {
  flex: 1;
  min-width: 0;
}
.history-list__title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.history-list__time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.history-list__meta {
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-top: 3px;
}
.history-list__summary {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-list__ops {
  display: flex;
  flex-shrink: 0;
}
.history-list__clear {
  align-self: flex-end;
}
</style>
