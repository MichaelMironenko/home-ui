import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import HomeView from './views/HomeView.vue'
import ScenariosListView from './views/ScenariosListView.vue'
import ScenarioView from './views/ScenarioView.vue'
import AutoLightScenarioView from './views/AutoLightScenarioView.vue'
import EventsView from './views/EventsView.vue'
import NotFoundView from './views/NotFoundView.vue'
import LoginView from './views/LoginView.vue'
import { useAuth } from './composables/useAuth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/scenarios', name: 'scenarios-list', component: ScenariosListView },
    { path: '/scenarios/new', name: 'scenario-create', component: ScenarioView },
    { path: '/scenarios/:id', name: 'scenario-edit', component: ScenarioView, props: true },
    { path: '/auto-light/new', name: 'auto-light-create', component: AutoLightScenarioView },
    { path: '/auto-light/:id', name: 'auto-light-edit', component: AutoLightScenarioView, props: true },
    { path: '/events', name: 'events', component: EventsView },
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView }
  ]
})

const auth = useAuth()

router.beforeEach(async (to, from, next) => {
  const isPublic = to.meta?.public === true
  try {
    await auth.ensureSession()
  } catch (err) {
    console.warn('[auth] ensureSession failed', err)
  }

  if (!auth.user.value && !isPublic) {
    const redirectPath = typeof to.fullPath === 'string' ? to.fullPath : '/'
    next({ name: 'login', query: { redirect: redirectPath } })
    return
  }

  if (auth.user.value && to.name === 'login') {
    const target = typeof to.query.redirect === 'string' && to.query.redirect.length ? to.query.redirect : '/'
    next(target.startsWith('/') ? target : { path: '/' })
    return
  }

  next()
})

createApp(App).use(router).mount('#app')
