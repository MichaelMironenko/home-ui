<script setup>
import { onMounted } from 'vue'
import { setDocumentTitle, setDocumentDescription } from '../utils/pageTitle'

onMounted(() => {
  setDocumentTitle('Пользовательское соглашение')
  setDocumentDescription('Публичная страница с пользовательским соглашением сервиса ExtraHub.')
})
</script>

<template>
  <main class="legal-page">
    <article class="legal-card">
      <header>
        <p class="flag">ПОЛЬЗОВАТЕЛЬСКОЕ СОГЛАШЕНИЕ</p>
        <p class="intro">
          Пользовательское соглашение ExtraHub регулирует порядок доступа к сервису и его использованию. Для уточнений и
          запросов на предоставление текста соглашения напишите на
          <a href="mailto:info@extrahub.ru">info@extrahub.ru</a>.
        </p>
      </header>

      <section>
        <h2>1. Общие положения</h2>
        <p>
          ExtraHub предоставляет интерфейс для управления устройствами умного дома и сценариями. Используя сервис, вы
          подтверждаете, что ознакомились с условиями настоящего соглашения и принимаете их.
        </p>
      </section>

      <section>
        <h2>2. Использование сервиса</h2>
        <ul>
          <li>Сервис доступен авторизованным пользователям и требует согласия на обработку персональных данных.</li>
          <li>Пользователь обязуется использовать сервис в соответствии с действующим законодательством.</li>
          <li>Оператор вправе обновлять функциональность и условия доступа без отдельного уведомления.</li>
        </ul>
      </section>

      <section>
        <h2>3. Ответственность</h2>
        <p>
          Оператор не несет ответственности за перебои в работе сервиса, вызванные внешними системами или поставщиками
          устройств. Пользователь самостоятельно отвечает за сохранность данных своих учетных записей.
        </p>
      </section>

      <section>
        <h2>4. Контакты</h2>
        <p>
          По всем вопросам, связанным с использованием сервиса, обращайтесь по адресу
          <a href="mailto:info@extrahub.ru">info@extrahub.ru</a>.
        </p>
      </section>
    </article>
  </main>
</template>

<style scoped>
.legal-page {
  min-height: calc(100vh - 80px);
  padding: 48px 24px;
  display: flex;
  justify-content: center;
  background: var(--bg-primary);
}

.legal-card {
  width: min(960px, 100%);
  background: var(--surface-card);
  border-radius: 20px;
  padding: 32px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.35);
  color: var(--text-primary);
}

.legal-card header {
  margin-bottom: 24px;
}

.flag {
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--primary);
  margin-bottom: 12px;
}

.intro {
  margin: 0;
  color: var(--text-muted);
}

h2 {
  margin-top: 32px;
  font-size: 18px;
  color: var(--text-primary);
}

ul {
  margin: 12px 0 0 0;
  padding-left: 16px;
  color: var(--text-muted);
  line-height: 1.6;
}

li + li {
  margin-top: 6px;
}

.legal-card section p {
  color: var(--text-muted);
  line-height: 1.6;
}

.legal-card a {
  color: var(--primary);
  text-decoration: none;
}

.legal-card a:hover {
  text-decoration: underline;
}
</style>
