# Vue 3 + Vite

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).

## Вход через Яндекс ID

UI теперь требует авторизации:

1. На backend (папка `../back`) добавьте переменные окружения:
   - `SESSION_SECRET` — произвольная строка для подписи cookie.
   - `AUTH_ALLOWED_ORIGINS` — список origin'ов UI (например, `https://my-ui.storage.yandexcloud.net`), через запятую.
   - `YA_AUTH_REDIRECT_URI` — URL `https://<api-gw>/auth/callback`, зарегистрированный в OAuth-приложении.
   - `YA_AUTH_CLIENT_ID` / `YA_AUTH_CLIENT_SECRET` — OAuth‑клиент для пользовательского входа (должен запрашивать `login:info`, `login:email`, `iot:view`, `iot:control` и пр.). Переменная `YA_AUTH_SCOPE` задаёт список прав (по умолчанию используется `login:info login:email`).
   - `YA_SERVICE_CLIENT_ID` / `YA_SERVICE_CLIENT_SECRET` / `YA_SERVICE_REFRESH_TOKEN` — сервисный клиент, который даёт функции фоновый доступ к IoT API (если нужно оставить «общий» аккаунт). Старые имена `YA_CLIENT_ID`/`YA_CLIENT_SECRET`/`YA_REFRESH_TOKEN` всё ещё поддерживаются, но рекомендуем перейти на новые.
2. После успешной авторизации функция сохраняет refresh token пользователя в Object Storage (`users/<userId>.json`). Убедись, что у сервисного аккаунта есть права на запись в этот префикс.
3. Все запросы UI к `scenariosURL` отправляются с `credentials: 'include'`, чтобы браузер передавал сессионные cookie.
