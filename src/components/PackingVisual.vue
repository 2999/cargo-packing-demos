<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ContainerResult, PackingParams } from '@/types/packing'
import { buildPackingBoxes, isoProject, shade } from '@/utils/packingVisual'

const props = withDefaults(
  defineProps<{
    container: ContainerResult
    params: PackingParams
    defaultView?: 'iso' | 'top'
    controls?: boolean
    highlight?: string | null
    compact?: boolean
  }>(),
  { defaultView: 'iso', controls: true, highlight: null, compact: false },
)

const view = ref<'iso' | 'top'>(props.defaultView)
watch(
  () => props.defaultView,
  (v) => {
    view.value = v
  },
)

const boxes = computed(() =>
  buildPackingBoxes(props.params.container, props.params.cargoList, props.container.container_index),
)

interface Poly {
  points: string
  fill: string
  stroke?: string
}

const iso = computed(() => {
  const { innerLength: L, innerWidth: W, innerHeight: H } = props.params.container
  const P = isoProject
  const pts = (arr: Array<[number, number, number]>) => arr.map(([x, y, z]) => P(x, y, z).join(',')).join(' ')

  const shell: Poly[] = [
    { points: pts([[0, 0, 0], [L, 0, 0], [L, 0, H], [0, 0, H]]), fill: '#9aa3b2' },
    { points: pts([[0, 0, 0], [0, W, 0], [0, W, H], [0, 0, H]]), fill: '#7b8494' },
    { points: pts([[0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0]]), fill: '#5a6373' },
  ]
  const door: Poly = {
    points: pts([[L, 0, 0], [L, W, 0], [L, W, H], [L, 0, H]]),
    fill: 'none',
    stroke: 'rgba(226,232,240,.9)',
  }
  const rims: Poly[] = [
    { points: pts([[0, 0, H], [L, 0, H]]), fill: 'none', stroke: 'rgba(226,232,240,.7)' },
    { points: pts([[0, 0, H], [0, W, H]]), fill: 'none', stroke: 'rgba(226,232,240,.7)' },
  ]
  const near: Poly = {
    points: pts([[L, 0, 0], [L, W, 0], [0, W, 0]]),
    fill: 'none',
    stroke: 'rgba(15,23,42,.4)',
  }

  const sorted = [...boxes.value].sort((a, b) => a.x + a.y + a.z - (b.x + b.y + b.z))
  const items = sorted.map((b) => {
    const { x, y, z, d, w, h } = b
    const p = (dx: number, dy: number, dz: number) => P(x + dx, y + dy, z + dz).join(',')
    return {
      fy: { points: [p(0, w, 0), p(d, w, 0), p(d, w, h), p(0, w, h)].join(' '), fill: shade(b.color, -0.3) },
      fx: { points: [p(d, 0, 0), p(d, w, 0), p(d, w, h), p(d, 0, h)].join(' '), fill: b.color },
      top: { points: [p(0, 0, h), p(d, 0, h), p(d, w, h), p(0, w, h)].join(' '), fill: shade(b.color, 0.4) },
      name: b.name,
      d,
      w,
      h,
    }
  })

  const corners = [
    P(0, 0, 0), P(L, 0, 0), P(L, W, 0), P(0, W, 0),
    P(0, 0, H), P(L, 0, H), P(L, W, H), P(0, W, H),
  ]
  const minX = Math.min(...corners.map((c) => c[0]!))
  const maxX = Math.max(...corners.map((c) => c[0]!))
  const minY = Math.min(...corners.map((c) => c[1]!))
  const maxY = Math.max(...corners.map((c) => c[1]!))
  const padX = (maxX - minX) * 0.03
  const padY = (maxY - minY) * 0.05
  return { shell, door, rims, near, items, vb: `${minX - padX} ${minY - padY} ${maxX - minX + padX * 2} ${maxY - minY + padY * 2}` }
})

const top = computed(() => {
  const { innerLength: L, innerWidth: W } = props.params.container
  const rects = [...boxes.value].sort((a, b) => a.z - b.z).map((b) => ({
    x: b.x,
    y: b.y,
    d: b.d,
    w: b.w,
    z: b.z,
    name: b.name,
    color: b.color,
  }))
  const padX = L * 0.02
  const padY = W * 0.12
  return { L, W, rects, vb: `${-padX} ${-padY} ${L + padX * 2} ${W + padY * 2}` }
})

function boxClass(name: string) {
  if (!props.highlight) return null
  return name === props.highlight ? 'is-hot' : 'is-dim'
}

function delayStyle(i: number) {
  if (props.compact) return undefined
  return { animationDelay: `${Math.min(i * 16, 800)}ms` }
}
</script>

<template>
  <div class="pv" :class="{ 'pv--compact': compact }">
    <el-radio-group v-if="controls" v-model="view" size="small" class="pv__views">
      <el-radio-button value="iso">立体</el-radio-button>
      <el-radio-button value="top">俯视</el-radio-button>
    </el-radio-group>

    <Transition name="pv-fade" mode="out-in">
      <svg
        v-if="view === 'iso'"
        key="iso"
        class="pv__svg"
      :viewBox="iso.vb"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      :aria-label="`${container.equipment_title} 装柜立体示意`"
    >
      <polygon
        v-for="(p, i) in iso.shell"
        :key="'s' + i"
        :points="p.points"
        :fill="p.fill"
        stroke="rgba(15,23,42,.25)"
        vector-effect="non-scaling-stroke"
      />
      <polygon :points="iso.door.points" fill="none" :stroke="iso.door.stroke" stroke-width="2" vector-effect="non-scaling-stroke" />
      <polygon
        v-for="(p, i) in iso.rims"
        :key="'r' + i"
        :points="p.points"
        fill="none"
        :stroke="p.stroke"
        vector-effect="non-scaling-stroke"
      />
      <g
        v-for="(b, i) in iso.items"
        :key="'b' + i + b.name"
        class="pv-box"
        :class="boxClass(b.name)"
        :style="delayStyle(i)"
      >
        <title>{{ b.name }} · {{ b.d }}×{{ b.w }}×{{ b.h }} mm</title>
        <polygon :points="b.fy.points" :fill="b.fy.fill" stroke="rgba(15,23,42,.28)" vector-effect="non-scaling-stroke" />
        <polygon :points="b.fx.points" :fill="b.fx.fill" stroke="rgba(15,23,42,.28)" vector-effect="non-scaling-stroke" />
        <polygon :points="b.top.points" :fill="b.top.fill" stroke="rgba(255,255,255,.35)" vector-effect="non-scaling-stroke" />
      </g>
      <polygon :points="iso.near.points" fill="none" :stroke="iso.near.stroke" vector-effect="non-scaling-stroke" />
    </svg>

    <svg
      v-else
      key="top"
      class="pv__svg"
      :viewBox="top.vb"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      :aria-label="`${container.equipment_title} 装柜俯视示意`"
    >
      <rect x="0" y="0" :width="top.L" :height="top.W" fill="#525b6a" stroke="rgba(15,23,42,.4)" vector-effect="non-scaling-stroke" />
      <g v-for="(r, i) in top.rects" :key="'t' + i" class="pv-box" :class="boxClass(r.name)" :style="delayStyle(i)">
        <title>{{ r.name }} · {{ r.d }}×{{ r.w }} mm · 层高 {{ r.z }} mm</title>
        <rect
          :x="r.x"
          :y="r.y"
          :width="r.d"
          :height="r.w"
          :fill="r.color"
          opacity="0.92"
          stroke="rgba(255,255,255,.6)"
          vector-effect="non-scaling-stroke"
        />
      </g>
      <line :x1="top.L" y1="0" :x2="top.L" :y2="top.W" stroke="rgba(255,255,255,.85)" stroke-dasharray="16 12" vector-effect="non-scaling-stroke" />
    </svg>
    </Transition>

    <span v-if="!compact && boxes.length" class="pv__hint">
      {{ boxes.length }} 箱已排布 · 悬停查看货物明细
    </span>
  </div>
</template>

<style scoped>
.pv {
  position: relative;
}
.pv__svg {
  display: block;
  width: 100%;
  height: auto;
}
.pv__views {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
}
.pv__hint {
  position: absolute;
  left: 10px;
  bottom: 8px;
  font-size: 11px;
  color: rgba(230, 236, 244, 0.85);
  text-shadow: 0 1px 2px rgba(15, 23, 42, 0.6);
  pointer-events: none;
}
.pv-box {
  transform-box: fill-box;
  transform-origin: 50% 85%;
  animation: pv-in 0.5s cubic-bezier(0.22, 0.7, 0.3, 1) both;
  cursor: default;
}
.pv--compact .pv-box {
  animation: none;
}
.pv-box.is-dim {
  opacity: 0.16;
}
.pv-box.is-hot {
  filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.9));
}
.pv-box.is-hot polygon,
.pv-box.is-hot rect {
  stroke: #fff;
}
@keyframes pv-in {
  from {
    opacity: 0;
    transform: translateY(-10%) scale(0.72);
  }
}
.pv-fade-enter-active,
.pv-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.pv-fade-enter-from {
  opacity: 0;
  transform: scale(0.985);
}
.pv-fade-leave-to {
  opacity: 0;
  transform: scale(1.015);
}
@media (prefers-reduced-motion: reduce) {
  .pv-box {
    animation: none;
  }
}
</style>
