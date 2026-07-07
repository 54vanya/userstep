import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,ico,png,svg}'],
        runtimeCaching: [],
      },
      manifest: {
        name: 'PIU StepMaker',
        short_name: 'StepMaker',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
        // Открытие чартов через ОС в установленном PWA (launchQueue в main.tsx).
        file_handlers: [
          {
            action: '/',
            accept: {
              'text/plain': ['.ucs'],
              'application/json': ['.json', '.piu.json'],
            },
          },
        ],
      },
    }),
  ],
})
