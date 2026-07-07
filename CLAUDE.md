# PIU StepMaker — CLAUDE.md

PWA-редактор степчартов для Pump It Up. Аналог UCSLite. Офлайн-работа, импорт/экспорт `.ucs`.

## Стек

Vite + React 18 + TypeScript + Zustand (+ zundo для undo) + shadcn/ui + Tailwind  
Аудио: нативный Web Audio API. Хранилище аудио-файлов: IndexedDB (idb-keyval).  
PWA: vite-plugin-pwa (Workbox), ручное обновление через `usePwaUpdate`.

## Ключевые решения

- **Форматы**: `.piu.json` (внутренний) + импорт/экспорт `.ucs`
- **UCS**: ноты — `.`=пусто `X`=tap `M`=hold-start `H`=hold-body `W`=hold-end; блоки разделены заголовками `:BPM=` / `:Delay=` / `:Beat=` / `:Split=`
- **Курсор**: фиксирован сверху viewport, чарт скроллится снизу вверх при воспроизведении (`CURSOR_LINE_Y = 40` в `geometry.ts`)
- **Виртуализация**: только строки в ±`BUFFER_PX` (300px) от viewport рендерятся в DOM (`ChartGrid.tsx`)
- **Табы**: независимые открытые чарты (разные песни/сложности), каждый со своим аудио
- **Difficulty**: цифровая 1–29, без именованных уровней
- **Delay**: ненулевой только для первых блоков или пауз между блоками
- **Undo/redo**: `zundo` Zustand middleware, глубина 50 операций; Ctrl+Z, Ctrl+Y
- **Клавиши**: Space = play/pause, Ctrl+S = сохранить, Ctrl+Z/Y = undo/redo, Ctrl+N/O/W = таб-операции, Ctrl+Tab = перебор табов, ↑↓/PgUp/PgDn/Home/End = навигация, Ctrl+колесо = зум. Полная справка: `docs/KEYBOARD.md` и в приложении (File → Keyboard shortcuts, `ShortcutsModal.tsx`)
- **Выделение**: `editorStore.selection` — `rows` (диапазон строк одного блока) | `block` (весь блок); Shift+клик/drag, Ctrl+A, Esc. Не в undo-истории, не персистится
- **Операции над выделением** (`services/selectionOps.ts`): Delete, Ctrl+C/X/V (внутренний клипборд), Ctrl+Shift+V (вставка со сдвигом колонок), X/Y/M (flip h/v/mirror)
- **Операции над блоками** (`utils/blockOps.ts` + кнопки в BlockSettingsPopup): split here / merge with next / delete below; смена Split пересчитывает строки нот (adjust beat-split); resize блока перетаскиванием нижней границы за рельсу
- **Ввод нот**: Alt+drag = серия тапов; live-запись при playback: Z/Q/S/E/C (кол. 0–4) и NumPad 1/7/5/9/3 (кол. 5–9)
- **Метроном**: чекбокс Metronome, тики на долях (`computeMetronomeTicks` в `utils/hitSounds.ts`)
- **Drag&drop файлов** в окно + PWA `file_handlers` (`launchQueue` в main.tsx). Файловые операции централизованы в `services/fileActions.ts`
- Фичи перенесены из StepEdit Lite по плану `PLAN_STEPEDIT.md` (выполнен целиком)

## Геометрия (`src/utils/geometry.ts`)

```
rowHeight = BASE_BEAT_HEIGHT(32) * scale / split
blockPixelHeight = rowCount * rowHeight
BLOCK_DIVIDER_HEIGHT = 0   // нулевая высота! линия только border-t, не занимает layout
COLUMN_WIDTH = 40
```

`BLOCK_DIVIDER_HEIGHT = 0` намеренно: делитель блоков — чисто визуальный `border-t`, не влияет на layout и не создаёт разрыв в координатах скролла (иначе при переходе между блоками playback прыгал бы).

## Тайминг (`src/utils/timing.ts`)

`computeBlockOffsets` → массив `{ startMs, msPerRow }` для каждого блока (учитывает `delay`).  
`msToScrollY` / `scrollYToMs` — конвертация между временем и пикселями через `blockLayouts`.

## Структура

```
src/
├── types/chart.ts            — Note, Block, Chart, Tab, BlockOffset
├── store/
│   ├── tabsStore.ts          — открытые табы, активный таб
│   └── editorStore.ts        — scale, scroll, isPlaying, currentTime
├── services/
│   ├── ucsParser.ts          — .ucs → Chart
│   ├── ucsSerializer.ts      — Chart → .ucs
│   ├── audioEngine.ts        — singleton Web Audio (load/play/pause/seek/getCurrentMs)
│   └── sessionStorage.ts     — сохранение табов в localStorage (debounce 500ms)
├── hooks/
│   ├── useEditor.ts          — pointer events → tap/hold/delete
│   ├── usePlayback.ts        — RAF loop: getCurrentMs → msToScrollY → scrollTop
│   ├── useAudio.ts           — загрузка аудио + IndexedDB
│   └── usePwaUpdate.ts       — SW update lifecycle
├── utils/
│   ├── geometry.ts           — rowHeight, blockPixelHeight, CONSTANTS
│   └── timing.ts             — computeBlockOffsets, msToScrollY, scrollYToMs
└── components/editor/
    ├── ChartGrid.tsx         — главный компонент: scroll, виртуализация, pointer events
    ├── NoteRow.tsx           — одна строка нот
    ├── BlockDivider.tsx      — border-t разделитель блоков (height: 0)
    ├── Cursor.tsx            — фиксированный плейхед
    ├── BlockLabels.tsx       — подписи блоков слева (BPM, Beat/Split)
    └── ColumnHeaders.tsx     — иконки стрелок PIU
```

## Статус (2026-06-08)

Все фазы выполнены: сетка, редактирование нот, аудио+playback, файловые операции, PWA, undo, восстановление сессии.

Примеры UCS-файлов для тестов: `fileExamples/CS266.ucs`, `fileExamples/CS349.ucs`.  
Тесты парсера: `src/services/__tests__/ucsParser.test.ts` (10/10).
