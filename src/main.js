import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import HomeView from './views/HomeView.vue'
import ScenariosListView from './views/ScenariosListView.vue'
import ScenarioView from './views/ScenarioView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/scenarios', name: 'scenarios-list', component: ScenariosListView },
    { path: '/scenarios/new', name: 'scenario-create', component: ScenarioView },
    { path: '/scenarios/:id', name: 'scenario-edit', component: ScenarioView, props: true }
  ]
})

createApp(App).use(router).mount('#app')
