# PIU StepMaker

PWA-редактор степчартов для Pump It Up — аналог UCSLite / StepEdit Lite,
работающий офлайн в браузере или как установленное приложение.

## Возможности

- Импорт/экспорт `.ucs` (включая гиммик-чарты: дробный BPM, Split до 128,
  кросс-блочные длинные ноты) и собственный формат `.piu.json` с настройками
  редактора (масштаб, скорость, позиция).
- Вкладки: несколько чартов одновременно, каждый со своим аудио; сессия
  (вкладки, позиции) переживает перезагрузку, аудио хранится в IndexedDB.
- Редактирование: клик = tap, drag = hold (в том числе через границы блоков),
  Alt+drag = серия тапов, выделение с копированием/вставкой/трансформациями
  (flip X/Y/mirror), операции над блоками (split/merge/delete below/resize).
- Live-запись нот во время воспроизведения; две раскладки клавиш —
  UCS Lite (`Z Q S E C` + NumPad) и StepMania (цифры `1…0`).
- Синхронизированное воспроизведение с плавной прокруткой (несколько режимов
  рендера), Rush 0.2–4×, hit-звуки, метроном, счётчик нот.
- Undo/redo (50 шагов), полная клавиатурная навигация — см.
  [docs/KEYBOARD.md](docs/KEYBOARD.md) или File → Keyboard shortcuts в приложении.
- Drag&drop файлов в окно; в установленном PWA `.ucs`/`.piu.json` открываются
  прямо из ОС.

## Разработка

```bash
pnpm install
pnpm dev        # dev-сервер на :5173
pnpm build      # tsc + production-сборка
pnpm test       # юнит-тесты (vitest)
pnpm e2e        # e2e-тесты (Playwright, сам поднимает dev-сервер)
pnpm lint
```

Стек: Vite, React 18, TypeScript, Zustand (+ zundo), Tailwind + shadcn/ui,
Web Audio API, vite-plugin-pwa. Архитектура и ключевые решения — в
[CLAUDE.md](CLAUDE.md), планы на будущее — в [TODO.md](TODO.md).
