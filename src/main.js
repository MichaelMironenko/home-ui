import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import HomeView from './views/HomeView.vue'
import ScenariosListView from './views/ScenariosListView.vue'
import ScenarioView from './views/ScenarioView.vue'
import EventsView from './views/EventsView.vue'
import NotFoundView from './views/NotFoundView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/scenarios', name: 'scenarios-list', component: ScenariosListView },
    { path: '/scenarios/new', name: 'scenario-create', component: ScenarioView },
    { path: '/scenarios/:id', name: 'scenario-edit', component: ScenarioView, props: true },
    { path: '/events', name: 'events', component: EventsView },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView }
  ]
})

createApp(App).use(router).mount('#app')
