# Code Review — PIU StepMaker

Дата: 2026-06-08  
Метод: многоугловой статический анализ (line-by-line, cross-file, dependency arrays, state sync)

---

## Баги (ranked by severity)

### 1. `App.tsx:80` — App-уровневый WelcomeScreen не восстанавливает `editorSettings`

**Серьёзность:** Высокая  
**Сценарий:** При открытии `.piu.json` с экрана «нет вкладок» (`WelcomeScreen` в `App.tsx`) вызывается только `addTab(chart, label)` — без `setTabScale`, `setTabPlaybackRate`, `audioEngine.setPlaybackRate`, `setCurrentTime`. Тот же файл, открытый из Toolbar или из `WelcomeScreen` в редакторе, восстанавливает все четыре поля. Пользователь теряет сохранённую позицию, масштаб и скорость при каждом открытии с пустого экрана.

```ts
// App.tsx:80 — editorSettings молча игнорируется
addTab(chart, chart.meta?.title || file.name.replace(...))
```

---

### 2. `ChartGrid.tsx:151` — stale `isPlaying` в dep array эффекта rescale

**Серьёзность:** Высокая  
**Сценарий:** `useLayoutEffect` масштабирования зависит только от `[scale]`, но захватывает `isPlaying` из замыкания. Если пользователь: начинает воспроизведение → меняет масштаб → останавливает — эффект не перезапускается (scale не изменился), и guard `if (isPlaying) return` использует `isPlaying = true` из старого замыкания, хотя воспроизведение уже остановлено. Масштабирование скролла пропускается навсегда до следующего изменения масштаба.

```ts
// ChartGrid.tsx:151
}, [scale])  // ← isPlaying, scrollRef, onScroll не в deps
```

---

### 3. `WelcomeScreen.tsx:27` — двойной Zustand update создаёт два undo-снэпшота

**Серьёзность:** Средняя  
**Сценарий:** `handleImportUcs` и `handleImportPiu` последовательно вызывают `updateChart(tabId, chart)` и затем `updateChartMeta(tabId, ...)`. zundo снимает снэпшот на каждый `set()`, поэтому импорт файла создаёт **две** записи в истории. Одно нажатие Ctrl+Z оставляет чарт в полуимпортированном состоянии: блоки на месте, но `meta` и `label` откатились к placeholder-значениям.

```ts
updateChart(tabId, chart)       // snapshot 1
updateChartMeta(tabId, { ... }) // snapshot 2 — undo разрывает импорт
```

---

### 4. `tabsStore.ts:109` — `||` не обновляет label при очистке заголовка

**Серьёзность:** Средняя  
**Сценарий:** `const label = patch.meta?.title || t.label` — пустая строка falsy. Если пользователь очищает поле Title в сайдбаре, `chart.meta.title` становится `''`, но label вкладки остаётся старым именем. UI рассинхронизируется с данными.

```ts
// tabsStore.ts:109
const label = patch.meta?.title || t.label  // '' → берёт старый label
// Правильно: patch.meta?.title ?? t.label
```

---

### 5. `timing.ts:8` — `scrollYToMs` при `scrollY=0` возвращает delay первого блока

**Серьёзность:** Средняя  
**Сценарий:** `computeBlockOffsets` для первого блока с `delay=500` даёт `startMs=500`. `scrollYToMs(0, ...)` находит `layouts[0].startY=0 <= 0` и возвращает `offsets[0].startMs + 0 = 500`. Значит `currentTime` при прокрутке в самый верх = 500 мс, а не 0. Нажатие Space запустит аудио с 500 мс, пропуская начальную паузу. Актуально для чартов с ненулевым `Delay` у первого блока.

---

### 6. `ChartGrid.tsx:141` — stale `currentTime` в эффекте восстановления скролла

**Серьёзность:** Средняя  
**Сценарий:** `useLayoutEffect` восстановления позиции при смене чарта захватывает `currentTime` из замыкания, но в deps только `[activeTab?.chart.id, blockLayouts]`. Если пользователь скроллит (меняет `currentTime`), затем переключает вкладку — эффект использует старое `currentTime` и скроллит в неверную позицию.

```ts
// ChartGrid.tsx:141
}, [activeTab?.chart.id, blockLayouts])  // ← currentTime, onScroll не в deps
```

---

### 7. `App.tsx:44` — локальный `WelcomeScreen` дублирует компонент из `editor/WelcomeScreen.tsx`

**Серьёзность:** Низкая / Сопровождаемость  
**Сценарий:** В `App.tsx` определена своя `function WelcomeScreen()` — независимый компонент с двумя кнопками и без `tabId`. Компонент в `src/components/editor/WelcomeScreen.tsx` имеет три кнопки, принимает `tabId`, восстанавливает `editorSettings`. Баги, исправленные в одном, не попадают в другой. Именование конфликтует при будущем импорте.

---

### 8. `Toolbar.tsx:41` — `.replace('.ucs', '')` не regex, не привязан к концу строки

**Серьёзность:** Низкая  
**Сценарий:** `file.name.replace('.ucs', '')` — строковый вариант заменяет первое вхождение `.ucs` **где угодно** в имени и не учитывает регистр. Файл `MySong.UCS` сохранит суффикс в label. Файл `StepMaker.ucs.remix.ucs` потеряет только первое вхождение. Все остальные места используют `/\.ucs$/i`.

```ts
// Toolbar.tsx:41
chart.meta.title = file.name.replace('.ucs', '')   // ← баг
// Должно быть:  file.name.replace(/\.ucs$/i, '')
```

---

### 9. `useEditor.ts:96` — перетаскивание вверх молча создаёт tap-ноту

**Серьёзность:** Низкая  
**Сценарий:** `Math.max(drag.startRow, rawRow)` зажимает строку снизу до `startRow`. Если пользователь начинает drag и отпускает указатель **выше** стартовой строки, `currentRow === startRow` и `startedOnNote=false` → `commit()` создаёт tap. Намерение отменить действие (drag вверх = отмена) не распознаётся; вместо этого ставится нота.

---

### 10. `timing.ts:21` — `msToScrollY` не проверяет, что `layouts[i]` существует

**Серьёзность:** Низкая / Защитная  
**Сценарий:** Если `offsets` и `layouts` рассинхронизированы по длине (например, блок удалён между вычислением offsets и следующим RAF-кадром), `layouts[i]` = `undefined`, и обращение к `layouts[i].startY` бросает TypeError, ломая RAF-loop воспроизведения.

---

## Итог

| # | Файл | Строка | Серьёзность |
|---|------|--------|-------------|
| 1 | `App.tsx` | 80 | Высокая |
| 2 | `ChartGrid.tsx` | 151 | Высокая |
| 3 | `WelcomeScreen.tsx` | 27 | Средняя |
| 4 | `tabsStore.ts` | 109 | Средняя |
| 5 | `timing.ts` | 8 | Средняя |
| 6 | `ChartGrid.tsx` | 141 | Средняя |
| 7 | `App.tsx` | 44 | Низкая |
| 8 | `Toolbar.tsx` | 41 | Низкая |
| 9 | `useEditor.ts` | 96 | Низкая |
| 10 | `timing.ts` | 21 | Низкая |
