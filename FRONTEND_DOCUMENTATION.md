# Frontend Documentation

## Entry Points

### `src/main.js`
- Bootstraps the Vue 3 app, wires `Vue Router` routes for every view (`Capabilities`, `Devices`, `Scenarios`, `Scenario`, `Auto Light`, `Events`, `Profile`, `Login`, `NotFound`).
- Imports `useAuth` and `useProfile` to guard navigation: `beforeEach` ensures a logged-in session, redirects unauthenticated users to `/login`, reloads the profile, and forces the profile page when a city is missing.
- Handles login redirect logic and mounts `App.vue`.

### `src/App.vue`
- Lays out the shell with a sticky header (title, nav links, profile badge) and a mobile footer tab bar that mirrors the main routes.
- Uses `useRoute`/`useRouter` to know when to hide navigation (login route) and to compute the user’s initial for the profile badge.
- Exposes a `logout` handler that calls `auth.logout()` and pushes the user back to the login page with a redirect query.
- Scoped CSS defines the header, tab bar, and responsive behavior.

### `src/views/ConsentView.vue`
- Renders the formal «Согласие на обработку персональных данных» text as a standalone public page, styling each numbered section and list for readability.
- Updates the document title/description for clarity and is wired from `/consent`, which is public and referenced from the login modal.
- Mirrors the requested legal content verbatim so users can review the data processing policy before agreeing to the login screen modal.

### `src/style.css`
- Defines all CSS variables (`--bg-primary`, `--primary`, color palette) and global resets (borders, fonts, body, buttons).
- Adds utility classes such as `.page-shell`, `.panel-card`, `.primary-button`, `.card-grid`, `.divider`, and type styles reused across views.

## Composables

### `src/composables/useAuth.js`
- Stores `user` and `ready` refs and exposes `ensureSession()`, `login()`, `logout()`.
- `ensureSession` caches the session check (`/auth/me`) and marks `ready`; `login` redirects to the auth endpoint with a `redirect` query.
- `logout` posts to `/auth/logout`, resets `user`, and handles errors quietly.

### `src/composables/useProfile.js`
- Manages `profile`, `instructions`, `presenceConfigured`, city detection state, and errors.
- Provides helpers to fetch `profile` data, update the city, delete the profile, geocode (`detectCity`, `geocodeCityByName`, `reverseGeocode`), and issue presence tokens.
- Automatically fetches the client IP (`ensureClientIp`) and abstracts JSON fetch logic with `requestJson`.

### `src/composables/useTargetDevices.js`
- Accepts a `catalog` (devices/groups/rooms) and a `target` description, returning sorted sections, selected device details, grouped entries, and standalone lists.
- Calculates capability summaries (`supports.brightness`, `.color`, `.power`) and filters devices to those the auto-light scenario can control.
- Computes `sections` keyed by room (with mixed-room handling) and retains markers for selected devices/groups.

### `src/composables/useScenarioApi.js`
- Loads scenario service configuration via `getConfig()` (`loadConfig`) and retains the base URL + API key headers.
- Provides `scenarioRequest(path, options)` which adds JSON headers, API keys, `credentials`, and parses responses, surfacing JSON errors.

### `src/composables/useAdjustControl.js`
- Creates reactive control state for knobs/sliders: tracks `control`, `display`, `pending`, `pendingNote`, throttle timers, auto-snapping, and idle commit timeouts.
- Exposed handlers include `onPointerDown`, `onPointerUp`, `onInput`, `quickAdjust`, `reset`, `teardown`, `scheduleSend`, and `setFromOutside` for syncing external updates.
- `onSend` and `onCommit` callbacks are invoked when diffs exceed `minDelta` after throttling and idle delays.

### `src/composables/useStopTimeEditor.js`
- Controlled time editor for stop sheets: keeps UI time state (`clock`, `sunrise`, `sunset`), syncs from stop drafts when closed, and commits updates via a provided patch callback.
- Exposes wheel-ready values (`clockHourWheel`, `clockMinuteWheel`, `sunWheelValues`) plus setters for hours, minutes, and sun offsets.

### `src/composables/useAutoBrightnessEditor.js`
- Normalizes auto-brightness draft values against sensor capability bounds and exposes log-scale lux ↔ percent mapping.
- Provides slider computed values, ticks, and pointer-drag helpers for the auto-brightness range editor.

### `src/composables/useRangeLinkMetrics.js`
- Observes auto-brightness range board/track DOM metrics and exposes link geometry for the lux/brightness connector lines.
- Handles resize observers and window resize listeners internally.

## Library Helpers

### `src/lib/api.js`
- `getConfig` caches `public/config.json` (with retry/pending management).
- `callPresence` and `runAutoLight` send telemetry to configured `presUrl`/`autoUrl`, attaching API keys and updating request metrics.

### `src/lib/requestMetrics.js`
- Tracks Yandex/auto-light calls in `localStorage` under `request-metrics-v1` and exposes `trackYandexCall`, `trackFunctionCall`, `useRequestMetrics`, and `getRequestMetrics`.
- Ensures only today’s data is stored (`ensureTodayState`).

## Utilities

### `src/utils/apiBase.js`
- `ensureApiBase` reads the stored config to build the main `/api` base URL, caching the trimmed value and throwing if it’s missing.

### `src/utils/num.js`
- `clampNumber(value, min, max)` guards numeric ranges.

### `src/utils/scenarioUtils.js`
- Calculates sunrise/sunset windows via `computeEnvironment`, normalizes day/time structure, and builds default scenario payloads (`createDefaultScenario`).
- `normalizeScenarioStruct` cleans target IDs, runtime presence, actions, start/end boundaries, and schedules.

### `src/utils/previewIcon.js`
- Exports utility colors (`AUTO_BRIGHTNESS_COLOR`) and helpers (`clamp`, `brightnessOpacity`, `hexToRgb`, `computePreviewIconStyle`) that decide badge gradients depending on brightness or color data.

### `src/utils/colorUtils.js`
- Converts between RGB/hex/HSL, clamps channels, interpolates colors (`rgbToHex`, `hexToHsv`, `hsvToHex`, `temperatureToHex`, `blendHex`, `stopColorHex`, `applyBrightnessHex`).

### `src/utils/autoLightConstants.js`
- Holds default parameters for auto-brightness (`DEFAULT_PARAMS`, curves, throttle constants, labels) used by `AutoLightEditor`.

### `src/utils/deviceCapabilities.js`
- Covers capability detection (`hasBrightnessCapability`, `supportsColorCapability`, `hasPowerCapability`) plus `isTargetDevice` heuristics that ignore sensors/switches and prefer lights.

### `src/utils/color.js`
- Contains another HSV/HEX/RGB toolset (`hsvToHex`, `rgbIntToRgb`, `rgbToHex`, `interpolateHue`, `interpolateValue`, `interpolateHsv`, `clampColorValue`).

### `src/utils/deviceState.js`
- Provides deep traversal helpers to extract brightness (`extractBrightnessValue`), color temperature (`extractColorTemperature`), and color HSV (`extractColorHsv`) from messy device states.

### `src/utils/piecewise.js`
- `piecewiseLinear` interpolates between points (used by auto-light curves).

### `src/utils/sunCalc.js`
- Browser port of sunrise/sunset math (`sunriseUTC`, `sunsetUTC`, `debugSunTimes`).

### `src/utils/pageTitle.js`
- Composes document titles/descriptions, targeting `ExtraHub` branding.

### `src/utils/scenarioStatusDisplay.js`
- Normalizes scenario status payloads, builds labels (`summarizeStatusRecord`, `deriveScenarioListStatus`), resolves pause reasons, and exports helpers for testing.
- Treats both `app_button_pause` and the new `autopause` reason as pausing indicators so the dashboard can explain why a scenario stopped without hiding the distinction between user-set pauses and automatic overrides.

### `src/utils/stopStateRules.js`
- Mutators that lock color/brightness usage between start and end stops and toggle auto-brightness metadata.

### `src/utils/autoLightUtils.js`
- Normalizes auto-light structures (`normalizeAutoLightScenarioStruct`), builds defaults, computes CCT segments, converts curves to percentages, normalizes brightness, evaluates piecewise interpolation, and derives environment/time data (`buildDerivedAutoLightLocal`).

### `src/utils/autoBrightnessMapping.js`
- Shared log-scale helpers for lux ↔ percent conversion, tick building, range snapping, and auto-brightness normalization.

### `src/utils/formatters.js`
- Small label helpers for lux ticks, lux values, and percent display strings.

## Components (shared)

### `src/components/DeviceCard.vue`
- Presents a single device/group card: infers `entityType`, `entityKind`, derives badges (brightness, illumination) and status text.
- Handles on/off toggles by loading API base (`getConfig`, `ensureApiBase`) and POSTing actions with `trackYandexCall`.
- Watches capability states, limits toggles while loading, and displays detailed property text.

### `src/components/DeviceGrid.vue`
- Loads `/catalog` from the API, polls it every minute, builds sections by room, filters to controllable devices, and passes each entry to `DeviceCard`.
- Derives group capabilities, ensures group devices are collapsed/expanded, and sorts rows by priority.

### `src/components/ScenarioDevicesSection.vue`
- Renders device/group selection for scenario targets, supports a “show selected only” collapsing mode, and emits `toggle-group`, `toggle-device`, `toggle-standalone` with deduped sets.
- Displays capability badges and counts selected entities in the header.

### `src/components/ScenarioTimeSection.vue`
- Allows choosing start/end boundaries (clock vs. sunrise/sunset) plus day-of-week toggles.
- Emits normalized patches (`emitValue`) with helper formatters (`formatOffset`, `formatOffsetFinal`).

### `src/components/TuningSliderColumn.vue`
- Vertical slider with quick +/- buttons for values like temperature or brightness; emits pointer/input/change events.
- Supports customizable gradients, markers, tooltips, and readout text.

### `src/components/ColorRamp.vue`
- Switches between manual temperature ranges (`temperature.fromK`, `.toK`) and custom color HSV pairs, uses `RangeIntervalSlider` to edit ranges.
- Emits `update:modelValue` with active mode controls and clamps values to defined steps.

### `src/components/ScenarioMappingSection.vue`
- Toggles brightness mapping between manual ranges and sensor-driven mode, wraps `RangeIntervalSlider`, and exposes sensor configuration (min/max lux → brightness output).
- Shows runtime markers when backend reports current brightness values.

### `src/components/ScenarioModifiersSection.vue`
- Placeholder WIP card describing future modifiers/conditions.

### `src/components/PresenceOptions.vue`
- Radio-group component for presence options; emits `update:modelValue`.

### `src/components/RangeIntervalSlider.vue`
- Reusable two-thumb slider (supporting gaps, gradients, markers) with inversion handling and configurable ticks.
- Emits `update:modelValue` for `{ from, to }` and `invert` when slider order swaps.

### `src/components/ChartBlock.vue`
- Tiny wrapper panel with header, optional reset button, and default slot for chart content.

### `src/components/AutoLightEditor.vue`
- Scoped editor for auto-light scenarios: uses `useScenarioApi`, `useTargetDevices`, `useAdjustControl`, and auto-light utils to load/save `auto-light-v1` payloads.
- Tracks catalog (`devices`, `groups`, `rooms`), scenario state, derived metrics (`derived`, `statusInfo`, `historyExpanded`), pause info, and auto-brightness configuration.
- Exposes computed summaries (sensor options, CCT/brightness ranges) and handles actions (`loadConfig`, `loadScenario`, `save`, `togglePause`, `runNow`).
- Renders subcomponents like `ScenarioDevicesSection`, `TuningSliderColumn`, `PresenceOptions`, `AdaptiveLightRoomDemo`, and `ChartBlock`?.

### `src/components/AdaptiveLightRoomDemo.vue`
- Visualization of adaptive lighting: slider controls progress from day to evening, uses gradients and computed CSS variables to animate sky, clouds, lamp glow.

### `src/components/HelloWorld.vue`
- Vite starter component kept for reference; simple counter.

### `src/components/ColorRamp.vue` (already described above)

## Dial Components (`src/components/dial`)

### `ScenarioDialCircle.vue`
- Central dial for editing start/end stops, draws arcs, handles pointer dragging (mouse/touch) with snapping to sunrise/sunset and min/max spans.
- Computes minutes/labels/colors for start/end, exposes `handleDialPointerDown/Move/Up`, emits `update:start-stop`, `update:end-stop`, `change`, `resume`, and `open-start-editor`/`open-end-editor`.
- Contains geometry helpers (`minutesDiff`, `positionForMinute`, `describeArcPath`) and ensures min/max span constraints.

### `BottomSheet.vue`
- Teleports a full-screen overlay sheet, locks body scroll, supports drag-to-close, and emits `close` once animation finishes.

### `StopPreviewList.vue`
- Shows start/end previews with color swatches and brightness tags; emits `open-start`/`open-end` to trigger the bottom sheet editor.

### `RunScheduleCard.vue`
- Simple card button that emits `open` when tapped, displaying the upcoming schedule summary.

### `TargetDevicesCard.vue`
- Card that shows target device count/error, uses `DialCardButton` to open the device selector.

### `ScenarioActionsFooter.vue`
- Footer that shows dirty hints and Save/Delete buttons; `primaryLabel` switches between “Создать”/“Сохранить”.

### `DialCardButton.vue`
- Stylized button used throughout the editor for modular sections.

### `AutoBrightnessCard.vue`
- Mini-card with button to open auto-brightness configuration.

### `AutoBrightnessSheet.vue`
- Simple toggle with numeric inputs for lux/brightness bounds and sensor selection that clamps values.

### `AutoBrightnessGraph.vue`
- SVG graph linking lux and brightness, with draggable handles for min/max points.
- Maps sensor values to x/y via log scales, formats ticks, handles pointer events, and emits `change` patches for brightness/lux when the line is moved.

### `ScenarioStatusBar.vue`
- Displays current scenario state badge (`running`, `paused`, `off`) and toggle buttons to change the value.

### `DeviceSelectorSheet.vue`
- Populates sections/groups/devices, shows toggles for each, and propagates `toggle-group`/`toggle-device` events.

### `SegmentedControl.vue`
- Multi-option horizontal control with motion indicator, tooltips, and optional dense/fit modes; tracks active index and reflows on resize.

### `WheelPicker.vue`
- Scrollable picker used by the stop time editor; handles pointer capture, idle finalize logic, and emits `update:modelValue` after snaps.

### `StopColorEditor.vue`
- Extracted color section for the stop sheet; manages color mode selection, temperature slider, and palette/custom color picks.

### `StopBrightnessEditor.vue`
- Extracted brightness section for the stop sheet; manages manual brightness slider and auto-brightness sensor mapping UI.

### `StopStateSheet.vue`
- Bottom sheet for editing a single stop (start or end) in the scenario dial.
- Uses controlled drafts for stop + auto-brightness state and emits `update:stop` / `update:autoBrightness` on edits.
- Splits time editing, auto-brightness mapping, and link metrics into composables, while `WheelPicker` handles time wheel interactions.

## Views

### `src/views/CapabilitiesView.vue`
- Landing page with marketing copy, feature cards, hero illustration, and CTA buttons (`startLogin`, `openScenarios`, `openDevices`).
- Updates meta title/description via `pageTitle` helpers and uses SVG assets for hero visuals.

### `src/views/HomeView.vue`
- Loads `config.api`/`config.scenariosURL` via `getConfig` and displays `DeviceGrid` with the `/catalog` endpoint.
- Sets document title/description accordingly.

### `src/views/ScenariosListView.vue`
- Fetches scenario list from `/list`, applies API keys, and normalizes entries with `summarizeStatusRecord` and `deriveScenarioListStatus`.
- Provides creation button, toggles pause/resume, sorts scenarios alphabetically with disabled ones grouped last, and refreshes statuses every 30 seconds.
- Tracks the non‑premium quota (max 3 active scenarios, max 10 unique devices) by expanding each entry through the cached catalog, allowing the special case where three scenarios can reuse a single large group, hiding the “Создать сценарий” button when limits are hit, and surfacing a small status line below the button with the current allowance or the reason the limit was reached.

### `src/views/ScenarioView.vue`
- Master editor for `scenario-v1` (not auto-light) that stitches together the main dial interface, bottom sheets, and action footer.
- Loads scenario data via `useScenarioApi`, normalizes it, tracks `selectedDevices`, `selectedGroups`, schedule info, and auto-brightness preferences.
- Handles editing name/time/device selection, toggles (day sets, presence modes), `saveScenario`/`deleteScenario`, `toggleRuntimePause`, and uses the dial components to edit start/end states.
- Computes derived summaries (schedule label, presence label, device count) and uses `pageTitle` to describe the scenario.

### `src/views/AutoLightScenarioView.vue`
- Wraps `AutoLightEditor`, watches mode (create vs edit), and updates the route when a new ID is assigned.

### `src/views/EventsView.vue`
- Loads `/events`, normalizes timestamps/triggers, deduplicates per scenario, and groups rows by scenario with icons for triggers/brightness/colors.
- Offers manual refresh and populates color swatches via `temperatureToHex`.

### `src/views/ProfileView.vue`
- Uses `useProfile`/`useAuth` to load/save account info; handles city selection (manual search `geocodeCityByName`, auto detection `detectCity`, geolocation, and message hints).
- Manages presence setup instructions (token issuance via `issuePresenceToken`, computed endpoint/headers), manual geolocation, clipboard copying of token, and logout/delete flows.
- Renders `SegmentedControl` for platform-specific instructions and shows presence status pills.

### `src/views/LoginView.vue`
- Simple login card that calls `auth.login()` with safe redirect handling, displays errors from `route.query.loginError`, and updates meta tags.

### `src/views/EventsView.vue` (already described above)

### `src/views/ProfileView.vue` (already described above)

### `src/views/NotFoundView.vue`
- Shows a “Page Not Found” notice with links back to landing or scenarios and updates page metadata.

### `src/views/HomeView.vue` / `ScenarioListView` (already described above)

## Assets & Configuration

- `src/assets/vue.svg`, `src/assets/color-gradient.svg`, `src/assets/hero-preview.svg` provide icons/illustrations for the landing page.
- `public/config.json` configures runtime URLs (`autoUrl`, `presUrl`, `/api`, `scenariosURL`), so `getConfig`, `callPresence`, and `runAutoLight` can adapt to deployment targets.
- `public/robots.txt`/`sitemap.xml` are static metadata for Vite.
- `package.json` & `vite.config.js` define the build/test scripts and Vite aliases.

## Notes

- See `agents.md` for a lightweight orientation guide that should be read first on subsequent turns.
- This document covers all front-end source files under `src/`; any new component/composable should be added here for future maintainers.
