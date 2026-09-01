import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'index',
      component: () => import('../views/IndexView.vue'),
    },
    {
      path: '/demo-1',
      name: 'demo-1',
      component: () => import('../views/demo1/Demo1View.vue'),
    },
    {
      path: '/demo-2',
      name: 'demo-2',
      component: () => import('../views/demo2/Demo2View.vue'),
    },
    {
      path: '/demo-3',
      name: 'demo-3',
      component: () => import('../views/demo3/Demo3View.vue'),
    },
    {
      path: '/demo-4',
      name: 'demo-4',
      component: () => import('../views/demo4/Demo4View.vue'),
    },
    {
      path: '/demo-5',
      name: 'demo-5',
      component: () => import('../views/demo5/Demo5View.vue'),
    },
    {
      path: '/demo-6',
      name: 'demo-6',
      component: () => import('../views/demo6/Demo6View.vue'),
    },
    {
      path: '/demo-7',
      name: 'demo-7',
      component: () => import('../views/demo7/Demo7View.vue'),
    },
    {
      path: '/demo-8',
      name: 'demo-8',
      component: () => import('../views/demo8/Demo8View.vue'),
    },
    {
      path: '/demo-9',
      name: 'demo-9',
      component: () => import('../views/demo9/Demo9View.vue'),
    },
  ],
})

export default router
