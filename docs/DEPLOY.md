# Деплой на VPS (Docker + nginx)

Приложение — полностью статический Vite-бандл (PWA), бэкенда нет.
Образ собирается в два этапа: `node:22-alpine` + pnpm делают `pnpm build`,
`nginx:stable-alpine` раздаёт `dist/`. Конфиг nginx — `deploy/nginx.conf`.

## Быстрый старт

```bash
git clone <repo> && cd userstep
docker compose up -d --build
# приложение на http://<vps>:8080
```

Или без compose:

```bash
docker build -t piu-stepmaker .
docker run -d --name piu-stepmaker --restart unless-stopped -p 8080:80 piu-stepmaker
```

## Обновление версии

```bash
git pull
docker compose up -d --build   # пересоберёт и перезапустит
```

Установленное PWA увидит новую версию при следующем открытии (баннер
«New version available» — ручное обновление через `usePwaUpdate`).

## HTTPS — обязателен

Service worker (офлайн-режим, установка PWA, file_handlers) работает
**только по HTTPS** (или на localhost). Контейнер намеренно слушает
голый HTTP — TLS терминируйте снаружи любым способом:

**Caddy на хосте** (самый короткий путь, сертификаты сам получает):

```
example.com {
    reverse_proxy 127.0.0.1:8080
}
```

**Host-nginx + certbot**:

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
    }
}
```

## Кэширование (важно для PWA)

`deploy/nginx.conf` уже настроен:

| Путь | Политика |
|---|---|
| `sw.js`, `manifest.webmanifest`, `index.html` | `no-cache` (ревалидация каждый раз — иначе клиенты не узнают об обновлении) |
| `/assets/*`, `workbox-*.js` (хэш в имени) | `immutable, max-age=1y` |

Если ставите перед контейнером CDN/прокси со своим кэшем — не кэшируйте
`sw.js` и `index.html` дольше, чем на ревалидацию.
