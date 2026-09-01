<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { usePackingStore } from '@/stores/packing'
import CargoLibraryDrawer from '@/components/CargoLibraryDrawer.vue'
import CargoListEditor from '@/components/CargoListEditor.vue'
import PackingFormFields from '@/components/PackingFormFields.vue'
import ResultsView from '@/components/ResultsView.vue'
import HistoryList from '@/components/HistoryList.vue'
import { ElMessage } from 'element-plus'

/**
 * 方案一 · 专业工作台 + AI 批注流：
 * 结果区内联步进器直接调整订购量，AI 每轮调整以「批注」形式
 * 滑入右侧批注栏，像文档评审意见一样留痕。
 */
const store = usePackingStore()
const showLibrary = ref(false)

/** 批注栏：最新一轮在最上(轮次越多保留越少，避免淹没) */
const notes = computed(() => store.aiSession.turns.slice(-6).reverse())

onMounted(() => {
  store.loadHistory()
})

function loadHistory(id: string) {
  if (store.restoreHistory(id)) {
    ElMessage.success('已载入历史装柜')
    document.querySelector('.demo1-result')?.scrollIntoView({ behavior: 'smooth' })
  }
}

async function submit() {
  const ok = await store.runPacking()
  if (ok) {
    ElMessage.success('AI 装柜完成')
    document.querySelector('.demo1-result')?.scrollIntoView({ behavior: 'smooth' })
  }
}
</script>

<template>
  <div class="demo1">
    <div class="demo1__panel">
      <div class="panel-section">
        <div class="panel-section__title">
          <span>装柜列表</span>
          <el-button type="primary" size="small" @click="showLibrary = true"> + 选货物 </el-button>
        </div>
        <CargoListEditor />
      </div>

      <el-divider />

      <div class="panel-section">
        <div class="panel-section__title"><span>装柜参数</span></div>
        <PackingFormFields />
      </div>

      <el-divider />

      <div class="panel-section">
        <div class="panel-section__title">
          <span>历史装柜</span>
          <el-tag v-if="store.history.length" size="small" type="info" effect="plain">
            {{ store.history.length }}
          </el-tag>
        </div>
        <HistoryList
          :items="store.history"
          :loading="store.historyLoading"
          @load="loadHistory"
          @remove="store.removeHistory"
          @clear="store.clearHistory"
        />
      </div>

      <div class="panel-section__actions">
        <el-button size="large" @click="store.reset()">重置</el-button>
        <el-button
          type="primary"
          size="large"
          :loading="store.packing"
          style="flex: 1"
          @click="submit"
        >
          开始装柜
        </el-button>
      </div>
    </div>

    <div class="demo1__result demo1-result">
      <ResultsView adjustable />
      <!-- AI 调整批注栏：有装柜结果(或已产生批注)时才出现 -->
      <aside v-if="store.result || store.aiSession.turns.length" class="demo1__notes">
        <div class="notes-head">
          <span class="notes-head__dot" />
          AI 调整批注
          <el-tag v-if="store.aiSession.round" size="small" effect="plain">
            第 {{ store.aiSession.round }} 轮
          </el-tag>
        </div>
        <TransitionGroup name="note" tag="div" class="notes-body">
          <div v-if="store.aiSession.thinking" key="thinking" class="ai-note ai-note--thinking">
            <div class="ai-note__who">AI 装柜助手 · 计算中</div>
            <span class="sk sk--80" />
            <span class="sk sk--60" />
          </div>
          <div
            v-for="t in notes"
            :key="t.id"
            class="ai-note"
            :class="{ 'ai-note--user': t.role === 'user' }"
            data-testid="ai-note"
          >
            <div class="ai-note__who">{{ t.role === 'ai' ? 'AI 装柜助手' : '我的调整' }}</div>
            <p class="ai-note__text">{{ t.text }}</p>
          </div>
          <div v-if="!store.aiSession.turns.length" key="hint" class="notes-hint">
            生成结果后，直接在「所装货物」表里改订购量，AI 会立即重排并在批注栏留痕。
          </div>
        </TransitionGroup>
      </aside>
    </div>

    <CargoLibraryDrawer v-model="showLibrary" />
  </div>
</template>

<style scoped>
.demo1 {
  display: flex;
  align-items: flex-start;
  gap: 24px;
}
.demo1__panel {
  flex: 0 0 420px;
  position: sticky;
  top: 80px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 20px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}
.panel-section__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
}
.panel-section__actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}
.demo1__result {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
/* AI 批注栏 */
.demo1__notes {
  flex: 0 0 250px;
  position: sticky;
  top: 80px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 14px;
  max-height: calc(100vh - 120px);
}
.notes-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}
.notes-head__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-primary);
  box-shadow: 0 0 0 3px var(--el-color-primary-light-8);
}
.notes-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}
.notes-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  line-height: 1.7;
  padding: 8px 10px;
  border: 1px dashed var(--el-border-color-lighter);
  border-radius: 8px;
}
.ai-note {
  border: 1px solid var(--el-border-color-lighter);
  border-left: 3px solid var(--el-color-primary);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--el-color-primary-light-9);
}
.ai-note--user {
  border-left-color: var(--el-color-info);
  background: var(--el-fill-color-lighter);
}
.ai-note--thinking {
  border-left-color: var(--el-color-warning);
}
.ai-note__who {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}
.ai-note__text {
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
}
.sk {
  display: block;
  height: 10px;
  border-radius: 5px;
  background: linear-gradient(90deg, var(--el-fill-color), var(--el-fill-color-dark), var(--el-fill-color));
  background-size: 200% 100%;
  animation: sk-shine 1.2s linear infinite;
  margin-top: 6px;
}
.sk--80 {
  width: 80%;
}
.sk--60 {
  width: 60%;
}
@keyframes sk-shine {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}
/* 批注滑入 */
.note-enter-active {
  transition: all 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
.note-enter-from {
  opacity: 0;
  transform: translateX(24px);
}
.note-move {
  transition: transform 0.3s ease;
}
/* 窄屏适配：先收窄三栏，再让批注栏落到结果下方，最后整体纵向堆叠 */
@media (max-width: 1360px) {
  .demo1__panel {
    flex: 0 0 360px;
  }
  .demo1__notes {
    flex: 0 0 216px;
  }
}
@media (max-width: 1180px) {
  .demo1__result {
    flex-wrap: wrap;
  }
  .demo1__notes {
    flex: 1 1 100%;
    position: static;
    max-height: 320px;
  }
}
@media (max-width: 900px) {
  .demo1 {
    flex-direction: column;
  }
  .demo1__panel {
    flex: none;
    width: 100%;
    position: static;
    max-height: none;
  }
  .demo1__result {
    width: 100%;
  }
}
</style>
