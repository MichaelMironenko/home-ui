<template>
  <section class="blk">
    <header class="blk__header">
      <h2>Модификаторы (скоро)</h2>
      <span class="badge">WIP</span>
    </header>
    <p class="hint">
      Здесь появятся условия: состояние устройств, присутствие дома, реакции на события. Пока секция носит справочный характер.
    </p>
    <ul class="ideas">
      <li>— Если лампа выключена, уменьшить шаг яркости вместо полного выключения.</li>
      <li>— При отсутствии дома переключать сценарий в режим удержания.</li>
      <li>— Добавить пользовательские условия (например, «не позже 23:00»).</li>
    </ul>
  </section>
</template>

<style scoped>
.blk {
  background: rgba(17, 24, 39, 0.7);
  border-radius: 16px;
  border: 1px solid rgba(55, 65, 81, 0.6);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 120px;
}

.blk__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.blk__header h2 {
  margin: 0;
  font-size: 18px;
  color: #e5e7eb;
}

.badge {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.25);
  color: #facc15;
  font-size: 12px;
  font-weight: 600;
}

.hint {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}

.ideas {
  margin: 0;
  padding-left: 16px;
  color: #64748b;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
