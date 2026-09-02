<script setup lang="ts">
import { useRouter } from 'vue-router'
import { computed } from 'vue'

const router = useRouter()

const demos = [
  {
    path: '/demo-1',
    title: '方案一 · 左配置右结果',
    desc: '左侧固定装柜配置面板，右侧结果预览，专业高效，适合高频操作的报关运营人员。',
    tag: '双栏工作台',
  },
  {
    path: '/demo-2',
    title: '方案二 · 流水线看板',
    desc: '货物库 / 装柜列表 / 结果三栏并排常驻，点选卡片批量入列，无需抽屉与弹窗，宽屏高频操作首选。',
    tag: '三栏看板',
  },
  {
    path: '/demo-3',
    title: '方案三 · 表格工作台',
    desc: '装柜列表是一张可内联编辑的表格（类 Excel），支持勾选批量删除、行内改规格与旋转方向，数据密集场景高效。',
    tag: '表格编辑',
  },
  {
    path: '/demo-4',
    title: '方案四 · 单页磁贴',
    desc: '配置与结果集中在一个长页、通过分区磁贴组织，信息密度高，适合一块大屏上全览与对照。',
    tag: '单页磁贴',
  },
  {
    path: '/demo-5',
    title: '方案五 · 分步向导',
    desc: '选货物 → 选柜型与参数 → 查看装柜结果的分步流程，步骤清晰，适合操作新人，降低学习成本。',
    tag: '分步向导',
  },
  {
    path: '/demo-6',
    title: '方案六 · 命令中心',
    desc: '主画布聚焦展示单柜结果（左右切换 + 缩略图条），所有配置收进抽屉与弹窗，通过摘要 chips 唤起，极度聚焦。',
    tag: '画布优先',
  },
  {
    path: '/demo-7',
    title: '方案七 · 标签控制台',
    desc: '顶部页签切换 货物 / 参数 / 结果 三个工作区，货物袋角标常驻，结果区为轮播卡片逐柜浏览。',
    tag: '页签切换',
  },
  {
    path: '/demo-8',
    title: '方案八 · 底部结算台',
    desc: '顶部 KPI 条概览 + 底部固定结算栏（仿电商购物车），装柜结果从底部滑出全屏展示，操作动线贴近下单结算。',
    tag: '结算动线',
  },
  {
    path: '/demo-9',
    title: '方案九 · 全宽融合工作台',
    desc: '全宽双栏：卡片/表格双视图选货与批量调整，历史抽屉常驻，AI 助手融合公式栏语法与建议指令 chips。',
    tag: '全宽融合',
  },
]

// 大屏按卡片数量均分列数（9 张 → 3 列），高度由 1fr 自动均分
const cols = computed(() => Math.ceil(Math.sqrt(demos.length)))
</script>

<template>
  <div class="index-page">
    <div class="index-grid" :style="{ '--cols': cols }">
      <div
        v-for="(demo, i) in demos"
        :key="demo.path"
        class="demo-tile"
        :style="{ '--card-i': i }"
        @click="router.push(demo.path)"
      >
        <span class="demo-tile__num">{{ String(i + 1).padStart(2, '0') }}</span>
        <div class="demo-tile__top">
          <el-tag size="small" effect="plain" round>{{ demo.tag }}</el-tag>
        </div>
        <div class="demo-tile__bottom">
          <h3>{{ demo.title }}</h3>
          <p>{{ demo.desc }}</p>
        </div>
        <span class="demo-tile__arrow">
          <el-icon><Right /></el-icon>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.index-page {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: clamp(16px, 2.5vh, 28px) clamp(16px, 2.5vw, 40px);
  box-sizing: border-box;
}

.index-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-auto-rows: 1fr;
  gap: clamp(10px, 1.4vw, 20px);
  min-width: 0;
}

/* ---------- 磁贴 ---------- */
.demo-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
  min-height: 0;
  padding: clamp(14px, 1.6vw, 26px);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
  animation: tile-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--card-i, 0) * 60ms);
}
.demo-tile:hover {
  transform: translateY(-4px);
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.14);
}

/* 大编号水印 */
.demo-tile__num {
  position: absolute;
  right: clamp(10px, 1.2vw, 20px);
  bottom: clamp(2px, 0.4vw, 8px);
  font-size: clamp(56px, 7.5vw, 120px);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
  color: var(--el-color-primary);
  opacity: 0.07;
  user-select: none;
  pointer-events: none;
  transition: opacity 0.25s;
}
.demo-tile:hover .demo-tile__num {
  opacity: 0.16;
}

.demo-tile__top {
  display: flex;
  justify-content: flex-start;
}

.demo-tile__bottom {
  position: relative;
  z-index: 1;
  min-height: 0;
}

.demo-tile h3 {
  margin: 0 0 clamp(4px, 0.8vh, 10px);
  font-size: clamp(15px, 1.15vw, 19px);
  font-weight: 650;
  color: var(--el-text-color-primary);
  letter-spacing: 0.01em;
}

.demo-tile p {
  margin: 0;
  font-size: clamp(12px, 0.82vw, 14px);
  line-height: 1.65;
  color: var(--el-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 右上角箭头 */
.demo-tile__arrow {
  position: absolute;
  top: clamp(14px, 1.6vw, 26px);
  right: clamp(14px, 1.6vw, 26px);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  opacity: 0;
  transform: translate(-6px, 6px);
  transition: opacity 0.25s, transform 0.25s;
}
.demo-tile:hover .demo-tile__arrow {
  opacity: 1;
  transform: translate(0, 0);
}

@keyframes tile-in {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.98);
  }
}

/* ---------- 小屏：解锁高度，流式两列 ---------- */
@media (max-width: 860px) {
  .index-page {
    height: auto;
    padding: 16px;
  }
  .index-grid {
    grid-template-columns: repeat(2, 1fr);
    grid-auto-rows: minmax(150px, auto);
  }
}
@media (max-width: 560px) {
  .index-grid {
    grid-template-columns: 1fr;
  }
}
</style>
