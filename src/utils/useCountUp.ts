import { ref, watch, type Ref } from 'vue'

/** 数字滚动：源值变化时以 rAF 缓动动画过渡显示值 */
export function useCountUp(source: Ref<number>, duration = 500) {
  const display = ref(source.value)
  let raf = 0

  watch(source, (to, from) => {
    cancelAnimationFrame(raf)
    const start = performance.now()
    const f = from ?? 0
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      display.value = f + (to - f) * eased
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  })

  return display
}
