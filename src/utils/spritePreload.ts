// Предзагрузка спрайтов нот при старте приложения. На задеплоенной версии без
// этого картинки подтягиваются по мере первого использования (первый визит до
// активации service worker, обновление кэша) — ноты «прогружаются на ходу».
// Загружаем и ДЕКОДИРУЕМ все спрайты скина заранее; ссылки держим в модуле,
// чтобы браузер не выкинул их из memory-кэша.

export const SPRITE_DIRECTIONS = ['DownLeft', 'UpLeft', 'Center', 'UpRight', 'DownRight'] as const

const SPRITE_PARTS = ['Tap-Note', 'Hold-Body', 'Hold-BottomCap', 'Hold-BottomCapArrow', 'Hold-HeadStub'] as const

const preloaded: HTMLImageElement[] = []

export function preloadSprites(): void {
  if (preloaded.length > 0) return
  for (const dir of SPRITE_DIRECTIONS) {
    for (const part of SPRITE_PARTS) {
      // Базовый скин + серые подложки ритм-окраски (тот же набор частей).
      for (const src of [`/skin/basic/${dir}-${part}.png`, `/skin/basic/rhythm/${dir}-${part}.png`]) {
        const img = new Image()
        img.src = src
        // decode() прогревает и декод (иначе первый кадр с новым спрайтом всё
        // равно платил бы за него); ошибки глотаем — предзагрузка best-effort.
        img.decode().catch(() => {})
        preloaded.push(img)
      }
    }
  }
}
