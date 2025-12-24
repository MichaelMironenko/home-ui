# AGENT MAP

> Read this file first on every turn to remember the repository layout, major entry points, and where to look for details.

## High-level purpose

- **Goal:** Smart Home front-end (Vue 3 + Vite) for ExtraHub scenario management, device controls, and analytics.
- **Entry point:** `src/main.js` configures the router, global guards, and mounts `App.vue`.
- **Shell:** `src/App.vue` renders the header, footer tab bar, and houses the `<router-view>`.

## Key directories

- `src/views`: top-level pages—landing, devices, scenarios, auto-light editor, profile, events, login, 404.
- `src/components`: reusable cards, dial widgets, sliders, charts; `components/dial` hosts the scenario editor controls.
- `src/composables`: stateful helpers (`useAuth`, `useProfile`, `useScenarioApi`, `useTargetDevices`, `useAdjustControl`).
- `src/utils`: pure helpers (color conversions, date math, scenario normalization, auto-light calibrations, metrics).
- `src/lib`: API/config wrappers and request metrics persistence.
- `src/assets`: SVGs used on landing and UI.

## Supporting files

- `src/style.css`: global CSS variables, utility classes, and card styles.
- `package.json` + `vite.config.js`: dev tooling.

## Documentation pointers

- Read `FRONTEND_DOCUMENTATION.md` (new file) for per-file/function descriptions once created.
- Keep an eye on `config.json` or `public/` assets for environment overrides (e.g., API base).

Backend located in ../back
