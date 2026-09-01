<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'

const route = useRoute()

const navItems = [
  { path: '/', label: '首页' },
  { path: '/demo-1', label: '方案一' },
  { path: '/demo-2', label: '方案二' },
  { path: '/demo-3', label: '方案三' },
  { path: '/demo-4', label: '方案四' },
  { path: '/demo-5', label: '方案五' },
  { path: '/demo-6', label: '方案六' },
  { path: '/demo-7', label: '方案七' },
  { path: '/demo-8', label: '方案八' },
  { path: '/demo-9', label: '方案九' },
]
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-header__brand">装柜方案</div>
      <nav class="app-header__nav">
        <router-link v-for="item in navItems" :key="item.path" :to="item.path" class="app-header__link"
          :class="{ 'is-active': route.path === item.path }">
          {{ item.label }}
        </router-link>
      </nav>
    </header>
    <main class="app-main" :class="{ 'app-main--wide': route.path === '/demo-9' }">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 0 28px;
  height: 56px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.app-header__brand {
  font-size: 16px;
  font-weight: 700;
}

.app-header__nav {
  display: flex;
  gap: 4px;
}

.app-header__link {
  padding: 6px 14px;
  border-radius: 8px;
  color: var(--el-text-color-regular);
  font-size: 14px;
  text-decoration: none;
  transition: all 0.2s;
}

.app-header__link:hover {
  background: var(--el-fill-color);
}

.app-header__link.is-active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

.app-main {
  flex: 1;
  padding: 24px 28px 48px;
  max-width: 80%;
  width: 100%;
  margin: 0 auto;
}

.app-main--wide {
  max-width: none;
  padding: 0;
}

.page-enter-active,
.page-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-leave-to {
  opacity: 0;
}
</style>
