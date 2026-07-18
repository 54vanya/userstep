# PIU StepMaker — CLAUDE.md

PWA-редактор степчартов для Pump It Up. Аналог UCSLite / StepEdit Lite. Офлайн-работа, импорт/экспорт `.ucs`.

## Стек

Vite + React 18 + TypeScript + Zustand (+ zundo для undo) + shadcn/ui + Tailwind  
Аудио: нативный Web Audio API. Хранилище аудио-файлов: IndexedDB (idb-keyval).  
PWA: vite-plugin-pwa (Workbox), ручное обновление через `usePwaUpdate`.

Команды: `pnpm dev` / `pnpm build` / `pnpm test` (vitest, юнит) / `pnpm e2e` (Playwright, сам поднимает dev-сервер).

## Ключевые решения

- **Язык UI — английский**: все строки интерфейса, тултипы, справка (ShortcutsModal). Русский — только в комментариях кода и внутренней документации
- **Форматы**: `.piu.json` (внутренний, + `editorSettings`: scale/rush/позиция) + импорт/экспорт `.ucs` + экспорт `.sm` (StepMania: pump-single/double, таймлайн в битах точными дробями, BPM блоков → `#BPMS`, Delay первого блока → `#OFFSET`, остальных → `#DELAYS` — у них семантика UCS Delay в отличие от `#STOPS`; кросс-блочный холд → одна пара 2…3; такт = 4×LCM знаменателей позиций, свыше 192 строк — квантование на 48/бит)
- **UCS**: ноты — `.`=пусто `X`=tap `M`=hold-start `H`=hold-body `W`=hold-end; блоки разделены заголовками `:BPM=` / `:Delay=` / `:Beat=` / `:Split=`. Заголовки валидируются при парсинге (мусор/0 → дефолты, BPM=120, Beat/Split=4); Delay — дробные мс (`parseFloat`)
- **Кросс-блочные холды**: один холд через границу блоков — цепочка нот с флагами `continues`/`continued`; вся логика цепочек — в `utils/holds.ts` (`collectHoldChain`, `sanitizeHoldFlags`). Холд без `W` тянется сквозь хвостовые `.` и пустые блоки (гиммики CS241)
- **Курсор**: фиксирован у верха вьюпорта (`CURSOR_LINE_Y = 40`, умножается на fieldZoom), чарт движется под ним
- **Playback**: скролл заморожен (`overflowY:hidden`), контент-слой движется `translate3d` в RAF-цикле (`usePlayback`); позиция — линейная функция таймстампа кадра от якоря, ре-якорь на аудио-часы только при разрыве >80мс. Режимы (View → Playback): `snap` (дефолт; сетка контр-трансформом на физический пиксель), `smooth`, `framelock`, `raw`
- **Рендер**: виртуализации нет — сетка блока рисуется одним `repeating-linear-gradient` фоном (`GridLayer.tsx`), ноты — memo-слой спрайтов на блок (`BlockLayer.tsx`). Разделители блоков не занимают высоту (`BLOCK_DIVIDER_HEIGHT = 0`) — иначе рвались бы координаты скролла. Тело холда начинается от нижней грани клетки головы; в самой клетке — спрайт-заглушка `<dir>-Hold-HeadStub.png` (тело, обрезанное по нижнему контуру стрелки, генератор `scripts/gen-hold-head-stubs.mjs`), чтобы рельсы выходили из-под стрелки, а не висели срезом сбоку от неё
- **Табы**: независимые открытые чарты, каждый со своим аудио (IndexedDB, ключ `audio:<tabId>`, удаляется при закрытии таба) и своими scale/rush; позиции воспроизведения — в `tabTimes` (Map вне стора, `utils/tabTime.ts`)
- **Сессия**: localStorage `piu-session` (табы без audioBlob + times), debounce 500ms + синхронный flush на `pagehide`/`visibilitychange:hidden`. При загрузке табы с битым чартом отбрасываются (`utils/chartGuard.ts` — та же валидация защищает импорт `.piu.json`)
- **Undo/redo**: `zundo` на tabsStore, глубина 50; `equality` пропускает в историю только правки чартов и состава табов (scale/rush/isDirty/audioBlob/переключение таба снэпшотов не создают). Одна операция = один `updateChart` = один снэпшот
- **Выделение**: `editorStore.selection` — `rows` (диапазон строк одного блока) | `block` (весь блок); Shift+клик/drag, Shift+клик по рельсе, Ctrl+A, Esc. Не в undo-истории, не персистится
- **Операции над выделением** (`services/selectionOps.ts`): Delete, Ctrl+C/X/V (внутренний клипборд), Ctrl+Shift+V (вставка со сдвигом колонок), X/Y/M (flip h/v/mirror)
- **Операции над блоками** (`utils/blockOps.ts` + кнопки в BlockSettingsPopup): split here / merge with next / delete below; смена Split пересчитывает строки нот (adjust beat-split, коллизии после округления схлопываются); resize блока перетаскиванием нижней границы за рельсу
- **Ввод нот**: клик = tap (по ноте — удалить), drag вниз = hold (через границы блоков), Alt+drag = серия тапов; клавиши-колонки работают всегда — при playback live-запись (tap на ближайшую строку, замещение), на паузе тогл ячейки в строке под курсором (клавиша снимает фокус с INPUT-контролов сайдбара — навигация стрелками пропускает INPUT ради слайдеров), зажатая клавиша + ↓/↑ растягивает холд в ОБЕ стороны от якоря, в т.ч. кросс-блочный (undo-история на паузе, жест = один снэпшот; постановка холдов — `holds.ts:placeHoldSpan` с двусторонней расчисткой clearStart/clearEnd, общий с мышиным drag; слушатель навигации в ChartGrid регистрируется один раз через navDataRef — пере-регистрация на каждый updateChart роняла шаг навигации посреди keydown-диспатча); обе раскладки активны одновременно (коды не пересекаются, настройки нет): UCS Lite = Z/Q/S/E/C (кол. 0–4) и NumPad 1/7/5/9/3 (кол. 5–9), StepMania = верхний ряд цифр 1…9,0 (кол. 0–9)
- **Клавиши**: Space = play/pause, Ctrl+S = сохранить, Ctrl+Z/Y = undo/redo, Ctrl+N/O/W = таб-операции, Ctrl+Tab = перебор табов, ↑↓/PgUp/PgDn/Home/End = навигация, Ctrl+колесо = зум поля. Полная справка: `docs/KEYBOARD.md` и в приложении (File → Keyboard shortcuts, `ShortcutsModal.tsx`). Глобальные шорткаты — в `ChartEditor.tsx`, навигация — в `ChartGrid.tsx`; текстовые поля различаются через `utils/dom.ts:isTextEntry` (пробел на слайдерах/чекбоксах уходит в play/pause)
- **Сайдбар** (слева, бывший тулбар): play, per-tab Scale, Zoom поля (50–300%), Rush 0.2–4×, Volume, счётчик нот (`utils/noteCount.ts`), чекбоксы Rhythm coloring / Hit sounds / Metronome, кнопка аудио-файла. Метаданные чарта (Title/Artist/Level/Mode) — в модалке File → Chart info (`ChartInfoModal.tsx`)
- **Звуковой ассист** (`utils/hitSounds.ts` + `useHitSounds`): бипы по нотам у курсора (высота зависит от доли) и метроном по долям; планируются наперёд через `audioEngine.scheduleBeep`, идут мимо musicGain (слайдер Volume на них не влияет)
- **Ритм-окраска** (`utils/rhythmColors.ts`): цвет ноты по доле (4-я/8-я/16-я…), перекраска спрайта через `mix-blend-mode:color` по маске (BlockLayer); тело и хвостовой кэп холда — единым синим (`RHYTHM_HOLD_BLUE`) на нормализованных серых подложках, ритм-цвет несёт только голова. Серые спрайты (тапы, тела, кэпы) — `public/skin/basic/rhythm/`, генератор — `scripts/gen-rhythm-sprites.mjs` (нужен запущенный dev-сервер)
- **View-настройки** (`utils/viewSettings.ts`, localStorage `piu-view-settings`): линии сетки, скин (basic/blocks), FPS-метр, счётчик нот, окраска секций рельсы, режим playback (+ кап 60 FPS для записи видео), зум, выравнивание поля (left/center, сдвигает и комбо-оверлей), звуки; тема (system/light/dark) — отдельно в `utils/theme.ts`
- **Difficulty**: цифровая 1–29, без именованных уровней
- **Delay**: ненулевой для первого блока (тишина до старта) или паузы между блоками; сериализатор сохраняет delay всех блоков
- **AudioEngine** (singleton): `resume()` suspended-контекста при play (автоплей-политика после восстановления сессии), счётчик поколений `loadBlob` против гонки декодирования при переключении табов, фиксация позиции в `onended`
- **Drag&drop файлов** в окно + PWA `file_handlers` (`launchQueue` в main.tsx). Файловые операции централизованы в `services/fileActions.ts`
- **Деплой**: `Dockerfile` (node build → nginx-статика), `deploy/nginx.conf` (кэш-политика под PWA: sw.js/manifest/index.html — no-cache, хэшированные ассеты — immutable), `docker-compose.yml` (порт 8080, TLS — внешним прокси); инструкция — `docs/DEPLOY.md`
- Функциональность и раскладки повторяют StepEdit Lite (декомпилированный эталон)

## Геометрия (`src/utils/geometry.ts`)

```
rowHeight = BASE_BEAT_HEIGHT(32) * scale / split      (scale = tab.scale * fieldZoom/100)
blockPixelHeight = rowCount * rowHeight
BLOCK_DIVIDER_HEIGHT = 0   // делитель блоков не занимает layout
COLUMN_WIDTH = 40          // умножается на fieldZoom/100 (cw)
```

`blockRowCount = rowCount ?? round(beat*split*measures)` — `rowCount` авторитетен (целый), `measures` дробное (неполные такты в гиммик-чартах).  
Хит-тест: `hitLine` (зона-квадрат вокруг линии, мёртвые зоны в редких блоках) / `snapRow` (ближайшая линия без мёртвых зон — для холдов и выделения).

## Тайминг (`src/utils/timing.ts`)

`computeBlockOffsets` → `{ startMs, msPerRow }` для каждого блока (учитывает `delay`).  
`msToScrollY` / `scrollYToMs` — конвертация время↔пиксели через `blockLayouts`; `msToScrollY` клампит строку концом блока (у Delay нет пикселей — конвейер паузится на границе).  
`blockRowAtMs` — блок+строка под плейхедом (Ctrl+A, вставка, live-запись).

## Структура

```
src/
├── types/chart.ts            — Note, Block, Chart, Tab, BlockOffset
├── store/
│   ├── tabsStore.ts          — табы, активный таб; zundo + equality; flush сессии
│   └── editorStore.ts        — isPlaying, currentTime, selection, view-настройки
├── services/
│   ├── ucsParser.ts          — .ucs → Chart (валидация заголовков, carryOver холдов)
│   ├── ucsSerializer.ts      — Chart → .ucs / .piu.json
│   ├── smSerializer.ts       — Chart → .sm (StepMania), экспорт-only
│   ├── audioEngine.ts        — singleton Web Audio (play/pause/getCurrentMs/scheduleBeep)
│   ├── fileActions.ts        — импорт/экспорт/открытие файлов, таб-операции (меню+шорткаты)
│   ├── selectionOps.ts       — delete/copy/cut/paste/flip выделения, клипборд
│   └── sessionStorage.ts     — save/load сессии (валидация через chartGuard)
├── hooks/
│   ├── useChart.ts           — операции над чартом активного таба (add/remove note, блоки)
│   ├── useEditor.ts          — pointer events → tap/hold/удаление/выделение/серия тапов
│   ├── usePlayback.ts        — RAF-цикл playback (transform, режимы snap/smooth/…)
│   ├── useAudio.ts           — загрузка аудио (IndexedDB), отмена при смене таба
│   ├── useHitSounds.ts       — планирование бипов/метронома при playback
│   └── usePwaUpdate.ts       — SW update lifecycle
├── utils/
│   ├── geometry.ts           — rowHeight, layouts, hitLine/snapRow, константы
│   ├── timing.ts             — computeBlockOffsets, msToScrollY/scrollYToMs, blockRowAtMs
│   ├── blockOps.ts           — splitBlockAt / mergeWithNext / deleteBelow (чистые)
│   ├── holds.ts              — collectHoldChain, sanitizeHoldFlags
│   ├── hitSounds.ts          — computeHitSounds, computeMetronomeTicks, частоты
│   ├── noteCount.ts          — computeHitTimes, countPassed (счётчик нот)
│   ├── rhythmColors.ts       — цвет ноты по доле
│   ├── chartGuard.ts         — isValidChart (импорт .piu.json, восстановление сессии)
│   ├── viewSettings.ts       — типы+персист view-настроек (localStorage)
│   ├── theme.ts, tabTime.ts, dom.ts
├── components/
│   ├── editor/
│   │   ├── ChartEditor.tsx   — глобальные шорткаты, live-запись, обёртка грида
│   │   ├── ChartGrid.tsx     — главный: layout, скролл, попап блока, resize, статус-бар
│   │   ├── GridLayer.tsx     — сетка блока одним gradient-фоном (pixel-snap слой)
│   │   ├── BlockLayer.tsx    — спрайты нот блока (memo), ритм-окраска, превью
│   │   ├── BlockRail.tsx     — рельса справа: BPM/beat/split, клик → попап, + внизу
│   │   ├── BlockSettingsPopup.tsx, Cursor.tsx
│   │   ├── NoteCounterOverlay.tsx, WelcomeScreen.tsx
│   ├── menu/MenuBar.tsx, menu/ShortcutsModal.tsx, menu/ChartInfoModal.tsx
│   ├── tabs/TabBar.tsx, tabs/TabItem.tsx
│   ├── sidebar/Sidebar.tsx   — левый сайдбар: play/время/счётчик, слайдеры, чекбоксы
│   ├── FpsMeter.tsx
└── app/App.tsx               — каркас, drag&drop, PWA-баннер обновления
```

## Тесты

- Юнит (vitest, `pnpm test`): `ucsParser`, `smSerializer`, `selectionOps`, `blockOps` — `src/**/__tests__/`
- E2E (Playwright, `pnpm e2e`): `e2e/*.spec.ts` — редактор, шорткаты, блок-операции, ввод нот
- Примеры UCS для тестов: `fileExamples/` — CS266, CS349, а также гиммик-чарты CS241 (дробный BPM, Split=128, холды сквозь пустые блоки), CS355, CS677 (+ mp3)

## Статус (2026-07-07)

Функциональность StepEdit Lite перенесена целиком. Известные хвосты — в `TODO.md`
(пустые сегменты `.` внутри холдов и их подсчёт, UI редактирования сегментов).
