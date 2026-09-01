<script setup lang="ts">
import { computed } from 'vue'
import type { Axis, DirectionVisual } from '@/types/packing'

const props = defineProps<{
  /** 货物的长宽高(mm) */
  spec: { length: number; width: number; height: number }
  /** 摆放方向 */
  direction: DirectionVisual
  /** 是否高亮(选中态) */
  active?: boolean
  /** 是否显示尺寸标注 */
  showDimensions?: boolean
}>()

/** 尺寸映射，便于按轴取值 */
const AXIS_VALUES = computed<Record<Axis, number>>(() => ({
  length: props.spec.length,
  width: props.spec.width,
  height: props.spec.height,
}))

/** 俯视足迹的 宽(横向) × 深(进深)，单位 mm */
const footprint = computed(() => ({
  width: AXIS_VALUES.value[props.direction.widthAxis],
  depth: AXIS_VALUES.value[props.direction.depthAxis],
}))

/** 比例缩放，使足迹适合画布并保留长宽比 */
const rendered = computed(() => {
  const CANVAS = 100
  const PAD = 12
  const avail = CANVAS - PAD * 2
  const { width, depth } = footprint.value
  const scale = Math.min(avail / width, avail / depth)
  return {
    width: width * scale,
    depth: depth * scale,
    widthLabel: width,
    depthLabel: depth,
  }
})

const rectX = computed(() => 50 - rendered.value.width / 2)
const rectY = computed(() => 50 - rendered.value.depth / 2)

const fillStyle = computed(() =>
  props.active ? props.direction.swatchColor : 'var(--el-fill-color-lighter)',
)
</script>

<template>
  <svg
    viewBox="0 0 100 100"
    class="direction-diagram"
    :class="{ 'direction-diagram--active': active }"
  >
    <!-- 箱体足迹 -->
    <rect
      :x="rectX"
      :y="rectY"
      :width="rendered.width"
      :height="rendered.depth"
      rx="3"
      :fill="fillStyle"
      :stroke="direction.swatchColor"
      stroke-width="1.5"
    />

    <!-- 朝向箭头 -->
    <line
      :x1="50"
      :y1="rectY + rendered.depth - 10"
      :x2="50"
      :y2="rectY + 14"
      :stroke="direction.swatchColor"
      stroke-width="2"
    />
    <polygon
      :points="`${50},${rectY + 6} ${50 - 6},${rectY + 16} ${50 + 6},${rectY + 16}`"
      :fill="direction.swatchColor"
    />

    <!-- 尺寸标注 -->
    <g v-if="showDimensions" class="direction-diagram__dims" :fill="direction.swatchColor">
      <!-- 横向(宽)标注：箱体上方 -->
      <text :x="50" :y="4" text-anchor="middle" font-size="10" font-weight="600">
        {{ rendered.widthLabel }}
      </text>
      <!-- 进深标注：箱体右侧 -->
      <text
        :x="rectX + rendered.width + 5"
        :y="54"
        text-anchor="start"
        font-size="10"
        font-weight="600"
      >
        {{ rendered.depthLabel }}
      </text>
    </g>
  </svg>
</template>

<style scoped>
.direction-diagram {
  width: 100%;
  height: auto;
  display: block;
}
.direction-diagram--active :deep(rect) {
  stroke-width: 2.5;
}
.direction-diagram__dims text {
  font-family: inherit;
}
</style>
