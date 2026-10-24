import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages 專案網站的網址是 https://<帳號>.github.io/hsr-commuter/
export default defineConfig({
  base: '/hsr-commuter/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: '高鐵通勤票券最佳化',
        short_name: '高鐵通勤票',
        description: '高鐵新竹⇌台北通勤:月票、回數票、全票哪個划算',
        lang: 'zh-Hant-TW',
        start_url: '/hsr-commuter/',
        scope: '/hsr-commuter/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f6fa',
        theme_color: '#0b5cab',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'] },
    }),
  ],
});
