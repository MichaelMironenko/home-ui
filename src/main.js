import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import { useAuth } from './composables/useAuth'
import { useProfile } from './composables/useProfile'

const CapabilitiesView = () => import('./views/CapabilitiesView.vue')
const HomeView = () => import('./views/HomeView.vue')
const ScenariosListView = () => import('./views/ScenariosListView.vue')
const ScenarioView = () => import('./views/ScenarioView.vue')
const ScenarioLegacyView = () => import('./views/ScenarioLegacyView.vue')
const AutoLightScenarioView = () => import('./views/AutoLightScenarioView.vue')
const EventsView = () => import('./views/EventsView.vue')
const NotFoundView = () => import('./views/NotFoundView.vue')
const LoginView = () => import('./views/LoginView.vue')
const ConsentView = () => import('./views/ConsentView.vue')
const ProfileView = () => import('./views/ProfileView.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'landing', component: CapabilitiesView, meta: { public: true } },
    { path: '/devices', name: 'devices', component: HomeView },
    { path: '/scenarios', name: 'scenarios-list', component: ScenariosListView },
    { path: '/scenarios/new', name: 'scenario-create', component: ScenarioView },
    { path: '/scenarios/:id', name: 'scenario-edit', component: ScenarioView, props: true },
    { path: '/legacy-scenarios/new', name: 'scenario-create-legacy', component: ScenarioLegacyView },
    { path: '/legacy-scenarios/:id', name: 'scenario-edit-legacy', component: ScenarioLegacyView, props: true },
    { path: '/auto-light/new', name: 'auto-light-create', component: AutoLightScenarioView },
    { path: '/auto-light/:id', name: 'auto-light-edit', component: AutoLightScenarioView, props: true },
    { path: '/profile', name: 'profile', component: ProfileView },
    { path: '/events', name: 'events', component: EventsView },
    { path: '/consent', name: 'consent', component: ConsentView, meta: { public: true } },
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView }
  ]
})

const auth = useAuth()
const profileStore = useProfile()
let profileLoadPromise = null

router.beforeEach(async (to, from, next) => {
  const isPublic = to.matched.some(record => record.meta?.public === true)
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
    const queryRedirect = typeof to.query.redirect === 'string' && to.query.redirect.length ? to.query.redirect : ''
    if (queryRedirect && queryRedirect.startsWith('/')) {
      next(queryRedirect)
    } else {
      next({ name: 'scenarios-list' })
    }
    return
  }

  next()
})

async function ensureProfileForCity() {
  if (!auth.user.value) return
  const current = router.currentRoute.value
  const isPublic = current.matched.some(record => record.meta?.public === true)
  if (current.name === 'profile' || isPublic) return
  if (profileStore.profile.value?.city) return
  if (profileLoadPromise) return profileLoadPromise

  profileLoadPromise = (async () => {
    try {
      await profileStore.loadProfile()
    } catch (err) {
      console.warn('[profile] deferred load failed', err)
      return
    }

    const profileData = profileStore.profile.value
    const liveRoute = router.currentRoute.value
    const liveIsPublic = liveRoute.matched.some(record => record.meta?.public === true)
    if (!profileData?.city && liveRoute.name !== 'profile' && !liveIsPublic) {
      router.replace({ name: 'profile', query: { cityRequired: '1' } })
    }
  })()

  try {
    await profileLoadPromise
  } finally {
    profileLoadPromise = null
  }
}

router.afterEach(() => {
  ensureProfileForCity()
})

createApp(App).use(router).mount('#app')
