# PIU StepMaker — План разработки

## Суть проекта

PWA-редактор степчартов для Pump It Up. Аналог UCSLite. Полная офлайн-работа, импорт/экспорт .ucs.

---

## Стек

| Слой | Инструмент | Обоснование |
|---|---|---|
| Сборка | Vite | Быстрый HMR, нативный ESM, отличная поддержка PWA |
| UI framework | React 18 + TypeScript | Требование |
| UI компоненты | **shadcn/ui** + Tailwind CSS | Компактный, нативный, нет лишнего веса |
| Состояние | Zustand | Минималистичный, синхронный, без boilerplate |
| PWA | vite-plugin-pwa (Workbox) | Генерирует SW, precache, ручное обновление |
| Аудио | Web Audio API (нативный) | Достаточно для playback+sync, нет лишних зависимостей |
| Drag-to-hold | Нативные pointer events | Точный контроль без доп. библиотек |

---

## Формат файлов

### UCS (целевой игровой формат)

```
:Format=1
:Mode=Single|Double
:BPM=200
:Delay=100        ← мс задержки перед блоком
:Beat=4           ← долей в такте (числитель размера)
:Split=4          ← делений на долю (subdivision)

XOOOO             ← нота: X=tap, M=hold start, H=hold body, W=hold end, .=пусто
.....
MOOO.
HOOO.
WOOO.

:BPM=200          ← начало следующего блока
:Delay=0
:Beat=4
:Split=3
...
```

Каждый блок содержит `Beat × Split × N_measures` строк (определяется числом строк до следующего `:BPM=` или конца файла).

### Внутренний формат (.piu.json)

```json
{
  "version": 1,
  "meta": { "title": "", "artist": "" },
  "chartType": "Double",
  "difficulty": 15,
  "blocks": [
    {
      "id": "uuid",
      "bpm": 200,
      "delay": 100,
      "beat": 4,
      "split": 4,
      "measures": 39,
      "notes": [
        { "row": 48, "col": 2, "type": "tap" },
        { "row": 52, "col": 4, "type": "hold", "endRow": 56 }
      ]
    }
  ]
}
```

Для каждого чарта в табе хранятся: мета, chartType, difficulty, blocks, путь к аудио (через FileSystem Access API или хранится blob в IndexedDB).

---

## TypeScript типы (core)

```typescript
type NoteType = 'tap' | 'hold'
type ChartMode = 'Single' | 'Double'

interface Note {
  row: number       // 0-based row внутри блока
  col: number       // 0-based колонка
  type: NoteType
  endRow?: number   // только для hold
}

interface Block {
  id: string
  bpm: number
  delay: number     // мс
  beat: number      // долей в такте
  split: number     // subdivision
  measures: number
  notes: Note[]
}

interface Chart {
  id: string
  version: number
  meta: { title: string; artist: string }
  chartType: ChartMode
  difficulty: number  // 1-29
  blocks: Block[]
  audioFileName?: string
}

interface Tab {
  id: string
  chart: Chart
  audioBlob?: Blob
  isDirty: boolean
  filePath?: string  // для пересохранения
}

interface EditorState {
  scale: number           // 1-10, step 0.1
  activeBlockId: string | null
  scrollY: number
  isPlaying: boolean
  currentTime: number     // мс от начала песни
}
```

---

## Архитектура приложения

```
src/
├── app/
│   ├── App.tsx               ← корень: TabBar + EditorLayout
│   └── main.tsx
├── components/
│   ├── editor/
│   │   ├── ChartEditor.tsx   ← контейнер редактора для одного таба
│   │   ├── ChartGrid.tsx     ← прокручиваемая сетка нот
│   │   ├── NoteRow.tsx       ← одна строка (Beat×Split делений)
│   │   ├── BlockDivider.tsx  ← визуальный разделитель блоков
│   │   ├── Cursor.tsx        ← фиксированный плейхед сверху viewport
│   │   └── ColumnHeaders.tsx ← заголовки колонок (иконки стрелок)
│   ├── sidebar/
│   │   ├── Sidebar.tsx       ← левый сайдбар
│   │   ├── BlockList.tsx     ← список блоков
│   │   └── BlockEditor.tsx   ← форма редактирования блока
│   ├── toolbar/
│   │   ├── Toolbar.tsx
│   │   ├── ScaleControl.tsx  ← слайдер 1.0 – 10.0
│   │   ├── ModeToggle.tsx    ← Single / Double
│   │   └── FileActions.tsx   ← Import / Export / Open Audio
│   └── tabs/
│       ├── TabBar.tsx
│       └── TabItem.tsx
├── hooks/
│   ├── useChart.ts           ← CRUD для блоков и нот
│   ├── useAudio.ts           ← Web Audio API: load, play, pause, seek
│   ├── usePlayback.ts        ← синхронизация scroll с аудио
│   ├── useEditor.ts          ← mouse/pointer события → нота
│   └── usePwaUpdate.ts       ← ServiceWorker update lifecycle
├── store/
│   ├── tabsStore.ts          ← открытые табы, активный таб
│   └── editorStore.ts        ← scale, scroll, playback state
├── services/
│   ├── ucsParser.ts          ← .ucs → Chart[]
│   ├── ucsSerializer.ts      ← Chart → .ucs строка
│   ├── chartStorage.ts       ← IndexedDB (idb-keyval) для аудио blobs
│   └── audioEngine.ts        ← singleton Web Audio context
├── utils/
│   ├── timing.ts             ← rowToMs, msToRow конвертации
│   └── geometry.ts           ← pixelToRow, pixelToCol
├── sw.ts                     ← Workbox service worker
└── manifest.json
```

---

## Визуальная схема редактора

```
┌─────────────────────────────────────────────────────────┐
│  [TabBar: Chart1 ✕  Chart2 ✕  + ]                      │ ← TabBar
├──────────┬──────────────────────────────┬───────────────┤
│          │  [Toolbar: Scale▼ Mode▼ ...]  │               │
│          ├─────────────────────────────-┤               │
│          │  ┌─ ─ ─cursor/playhead ─ ─ ┐│               │
│ Sidebar  │  │  Col: ↙  ↖  ↑  ↗  ↘    ││               │
│          │  │─────────────────────────││               │
│ BlockList│  │  ....  ....  ...  ...   ││  ← ChartGrid  │
│          │  │  [X]   ...   ...  ...   ││               │
│ BlockEd. │  │  ...   [M]   ...  ...   ││               │
│ (active  │  │  ...   [H]   ...  ...   ││               │
│  block)  │  │  ...   [W]   ...  ...   ││               │
│          │  │─────────────────────────││               │
│          │  │  Block 2 (BPM 130 4/8)  ││               │
│          │  └─────────────────────────┘│               │
└──────────┴─────────────────────────────┴───────────────┘
```

---

## Курсор и прокрутка

- Курсор (`Cursor.tsx`) — фиксированная горизонтальная линия в верхней части viewport сетки (CSS `position: sticky` или абсолютно позиционированный оверлей).
- При воспроизведении: `scrollY` вычисляется из `currentTime` через `msToRow` → `rowToPixel(row, scale)`.
- Во время редактирования: прокрутка свободная, курсор отображает "редактируемый момент" (позицию скролла).

---

## Расчёт времени и позиции

```typescript
// Для каждого блока вычислить абсолютное время начала
function computeBlockOffsets(blocks: Block[]): BlockOffset[] {
  let timeMs = 0
  return blocks.map(b => {
    const offset = timeMs + b.delay
    const msPerRow = (60000 / b.bpm) / b.split
    const totalRows = b.beat * b.split * b.measures
    timeMs = offset + totalRows * msPerRow
    return { blockId: b.id, startMs: offset, msPerRow }
  })
}

function msToScrollY(ms: number, offsets: BlockOffset[], scale: number): number {
  // найти блок, вычислить пиксельную позицию
}
```

---

## Редактирование нот (pointer events)

```
pointerdown → начало взаимодействия
  → запомнить row/col, startRow
  
pointermove (при нажатой кнопке, вниз)
  → если currentRow > startRow → предпросмотр hold
  
pointerup
  → если startRow === currentRow → создать tap
  → если currentRow > startRow → создать hold(startRow, currentRow)
  → если клик на существующую ноту → удалить её
```

Рассчёт row/col из координат мыши:
- `col = Math.floor(x / columnWidth)`
- `row = Math.floor((scrollY + y - cursorOffsetY) / rowHeight)` — с учётом текущего блока и его `scale`

---

## Аудио движок

```typescript
// audioEngine.ts
class AudioEngine {
  private ctx: AudioContext
  private source: AudioBufferSourceNode | null
  private buffer: AudioBuffer | null
  private startedAt: number   // AudioContext.currentTime при старте
  private offsetMs: number    // откуда начали играть

  async loadBlob(blob: Blob): Promise<void>
  play(fromMs: number): void
  pause(): void
  getCurrentMs(): number      // ctx.currentTime - startedAt + offsetMs
  on(event: 'end', cb: () => void): void
}
```

Пробел (Space):
1. Если не играет → `audioEngine.play(currentTime)`, запустить анимационный цикл обновления `scrollY`
2. Если играет → `audioEngine.pause()`, остановить цикл

---

## Sidebar — редактор блока

Поля формы:
- BPM (number input, 1–999)
- Beat (select: 2, 3, 4, 6, 8)
- Split (select: 2, 3, 4, 6, 8, 12, 16)
- Delay (number, мс, только для первого блока или при вставке паузы)
- Measures (number, 1–256)
- Кнопки: [+ Добавить блок после] [Дублировать] [Удалить]

При изменении Beat/Split/Measures — пересчитать ноты блока (удалить ноты вышедшие за диапазон).

---

## Tab-система

- Каждый таб независим: свой Chart, своё аудио, свой EditorState
- Можно открыть несколько .ucs или .piu.json файлов
- `TabBar` с крестиком (с подтверждением при isDirty)
- Кнопка `+` → открывает диалог создания нового пустого чарта

---

## Импорт / Экспорт

```typescript
// ucsParser.ts
function parseUcs(text: string): Chart

// ucsSerializer.ts  
function serializeToUcs(chart: Chart): string
```

**Import .ucs** → `FileReader` → `parseUcs` → новый таб  
**Export .ucs** → `serializeToUcs` → `Blob` → `URL.createObjectURL` → `<a download>`  
**Save .piu.json** → `JSON.stringify(chart)` → download  
**Open audio** → `FileReader` → `audioEngine.loadBlob` + сохранить blob в IndexedDB (ключ = tabId)

---

## PWA и офлайн

```typescript
// vite.config.ts
VitePWA({
  registerType: 'prompt',   // НЕ autoUpdate — ручное обновление
  workbox: {
    globPatterns: ['**/*.{js,css,html,woff2,ico,png,svg}'],
    runtimeCaching: []       // только shell, аудио не кешируется
  },
  manifest: {
    name: 'PIU StepMaker',
    short_name: 'StepMaker',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a'
  }
})
```

**Ручное обновление** (`usePwaUpdate.ts`):
1. SW обнаруживает новую версию → `waiting` state
2. Показывается toast/banner "Доступно обновление" с кнопкой "Обновить"
3. По клику → `wb.messageSkipWaiting()` → перезагрузка страницы

**Аудио в IndexedDB**: файлы песен хранятся через `idb-keyval`, т.к. они могут быть большими и не должны попадать в cache.

---

## Фазы разработки

### Фаза 1 — Основа ✅ ВЫПОЛНЕНО (2026-06-07)
- [x] Инициализация: `pnpm create vite`, TypeScript, Tailwind, shadcn/ui
- [x] vite-plugin-pwa, manifest
- [x] TypeScript типы (`types/chart.ts`)
- [x] Zustand stores: `tabsStore`, `editorStore`
- [x] UCS парсер + сериализатор + тесты на примерах из `fileExamples/` (10/10 тестов)
- [x] App layout: TabBar, Sidebar, Editor area

### Фаза 2 — Сетка и ноты ✅ ВЫПОЛНЕНО (2026-06-07)
- [x] `ChartGrid.tsx`: виртуализированный скролл (только видимые строки)
- [x] `NoteRow.tsx`: рендер нот (tap, hold-start, hold-body, hold-end)
- [x] `BlockDivider.tsx`: визуальный разделитель с подписью BPM/Beat/Split
- [x] `Cursor.tsx`: фиксированный плейхед
- [x] `ColumnHeaders.tsx`: иконки стрелок PIU
- [x] ScaleControl: слайдер 1.0–10.0 с шагом 0.1
- [x] Расчёт геометрии: `rowHeight = baseHeight * scale / split` (`src/utils/geometry.ts`)

### Фаза 3 — Редактирование ✅ ВЫПОЛНЕНО (2026-06-07)
- [x] `useEditor.ts`: pointer events → tap/hold/delete
- [x] Предпросмотр hold при перетаскивании
- [x] Клик на существующую ноту → удаление
- [x] `BlockList.tsx` + `BlockEditor.tsx` в sidebar
- [x] Добавление, дублирование, удаление блоков

### Фаза 4 — Аудио и воспроизведение ✅ ВЫПОЛНЕНО (2026-06-07)
- [x] `audioEngine.ts`: load, play, pause, seek, getCurrentMs
- [x] `useAudio.ts` hook
- [x] Открытие аудио файла + сохранение в IndexedDB
- [x] Spacebar → play/pause + синхронизация скролла
- [x] `usePlayback.ts`: `requestAnimationFrame` → `scrollY` из `getCurrentMs()`
- [x] `timing.ts`: `computeBlockOffsets`, `msToScrollY`, `scrollYToMs`

### Фаза 5 — Файловые операции и табы ✅ ВЫПОЛНЕНО (2026-06-07)
- [x] Import .ucs → новый таб
- [x] Export .ucs
- [x] Save/Load .piu.json (внутренний формат)
- [x] Tab создание, закрытие, переключение (isDirty guard)
- [x] Мета-данные чарта: title, artist, chartType, difficulty

### Фаза 6 — PWA, polish ✅ ВЫПОЛНЕНО (2026-06-07)
- [x] `usePwaUpdate.ts` + UI обновления
- [x] Touch-события для планшетов (pointer events уже абстрагированы)
- [x] Тема: светлая/тёмная берётся из `prefers-color-scheme` браузера (без ручного переключателя)
- [x] Клавиатурные шорткаты: Space, Ctrl+Z (undo), Ctrl+S (save)
- [x] Базовый undo/redo через Zustand `temporal` (zundo)

### Фаза 7 — Корректность воспроизведения и восстановление сессии ✅ ВЫПОЛНЕНО (2026-06-07)
- [x] **Скролл при воспроизведении по BPM**: проверено — математика корректна. `rowHeight / msPerRow = BASE_BEAT_HEIGHT * scale * bpm / 60000` px/ms, не зависит от `split`. Один бит = `BASE_BEAT_HEIGHT * scale` пикселей = `60000/bpm` мс. Изменений кода не требовалось.
- [x] **Восстановление сессии при перезагрузке**: `sessionStorage.ts` сохраняет `tabs` (без `audioBlob`) в `localStorage` с дебаунсом 500 мс; `tabsStore` инициализирует начальное состояние из `loadSession()` при старте. Аудио восстанавливается через существующий механизм `useAudio` (idb-keyval `audio:{tabId}`) при монтировании активного таба.

---

## Зависимости (предварительный список)

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "zustand": "^5",
    "zundo": "^2",
    "idb-keyval": "^6",
    "uuid": "^10"
  },
  "devDependencies": {
    "vite": "^6",
    "@vitejs/plugin-react": "^4",
    "vite-plugin-pwa": "^1",
    "tailwindcss": "^3",
    "typescript": "^5",
    "shadcn/ui": "latest"
  }
}
```

shadcn/ui компоненты: Button, Slider, Input, Select, Tabs, Separator, ScrollArea, Toast, Dialog.

---

## Открытые вопросы / решения по умолчанию

| Вопрос | Решение |
|---|---|
| Виртуализация сетки | Только строки в ±viewport*2 рендерятся в DOM |
| Undo/redo | zundo (Zustand middleware), глубина 50 операций |
| Аудио форматы | mp3, ogg, wav (через Web Audio API) |
| Клавиши PIU (иконки) | SVG-иконки стрелок (↙↖↑↗↘) |
| Несколько нот в одной строке | Поддерживается (X в нескольких колонках) |
| Отображение hold body | CSS градиент / сплошная заливка колонки между M и W |
| Задержка (Delay) | Только первый блок использует ненулевой Delay, остальные 0 |
