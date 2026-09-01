<script setup lang="ts">
import { useRouter } from 'vue-router'

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
</script>

<template>
  <div class="index-page">
    <div class="index-grid">
      <el-card
        v-for="(demo, i) in demos"
        :key="demo.path"
        class="demo-card"
        :style="{ '--card-i': i }"
        shadow="hover"
        @click="router.push(demo.path)"
      >
        <template #header>
          <div class="demo-card__head">
            <el-tag size="small" effect="plain">{{ demo.tag }}</el-tag>
            <span class="demo-card__arrow">→</span>
          </div>
        </template>
        <h3>{{ demo.title }}</h3>
        <p>{{ demo.desc }}</p>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.index-page {
  max-width: 900px;
  margin: 24px auto 0;
}

.index-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.demo-card {
  cursor: pointer;
  animation: card-in 0.45s ease both;
  animation-delay: calc(var(--card-i, 0) * 70ms);
  transition: box-shadow 0.25s, transform 0.25s;
}
@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}

.demo-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.demo-card__arrow {
  font-size: 18px;
  color: var(--el-color-primary);
  transition: transform 0.2s;
  display: inline-block;
}
.demo-card:hover .demo-card__arrow {
  transform: translateX(4px);
}

.demo-card h3 {
  font-size: 16px;
  margin-bottom: 8px;
}

.demo-card p {
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.7;
}
</style>
