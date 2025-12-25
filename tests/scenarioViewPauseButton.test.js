/* @vitest-environment jsdom */
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScenarioView from '../src/views/ScenarioView.vue'

let mockRoute = { name: 'scenario-edit', params: { id: '1' } }
const mockRouter = { replace: vi.fn() }

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => mockRouter
}))

vi.mock('../src/lib/api', () => ({
  getConfig: vi.fn().mockResolvedValue({})
}))

const scenarioRequestMock = vi.fn()
let scenarioResponse = null

vi.mock('../src/composables/useScenarioApi', () => ({
  useScenarioApi: () => ({
    loadConfig: vi.fn().mockResolvedValue(),
    scenarioRequest: scenarioRequestMock
  })
}))

vi.mock('../src/composables/useProfile', () => ({
  useProfile: () => ({
    presenceConfigured: ref(false),
    loadProfile: vi.fn().mockResolvedValue({})
  })
}))

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

async function mountScenarioView(statusSummary) {
  scenarioResponse = {
    scenario: { id: '1', name: 'Test', disabled: false, runtime: {} },
    pause: null,
    statusSummary
  }
  scenarioRequestMock.mockImplementation(async (path) => {
    if (path.startsWith('/scenario?id=')) return scenarioResponse
    return {}
  })

  const wrapper = mount(ScenarioView, {
    global: {
      stubs: {
        ScenarioDialCircle: true,
        BottomSheet: true,
        TargetDevicesCard: true,
        StopPreviewList: true,
        RunScheduleCard: true,
        ScenarioActionsFooter: true,
        DeviceSelectorSheet: true,
        StopStateSheet: true,
        SegmentedControl: true
      }
    }
  })

  await flushPromises()
  await nextTick()
  return wrapper
}

describe('ScenarioView pause button visibility', () => {
  beforeEach(() => {
    scenarioRequestMock.mockClear()
    mockRouter.replace.mockClear()
    mockRoute = { name: 'scenario-edit', params: { id: '1' } }
  })

  it('hides pause button when scenario is finished', async () => {
    const statusSummary = {
      result: {
        active: false,
        lastEndedAt: Date.now() - 60_000
      }
    }
    const wrapper = await mountScenarioView(statusSummary)
    const pauseButton = wrapper.find('button.status-icon-btn:not(.power)')
    expect(pauseButton.exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows pause button when scenario is running', async () => {
    const now = Date.now()
    const statusSummary = {
      result: {
        active: true,
        currentWindow: { start: now - 60_000, end: now + 60_000 }
      }
    }
    const wrapper = await mountScenarioView(statusSummary)
    const pauseButton = wrapper.find('button.status-icon-btn:not(.power)')
    expect(pauseButton.exists()).toBe(true)
    wrapper.unmount()
  })
})
