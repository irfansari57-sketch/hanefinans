import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  // loadEnv ile tüm değişkenleri al (VITE_ olmayanlar dahil — proxy config server-side)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      basicSsl(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'bg-finance.svg'],
        // Dev sırasında SW devre dışı — canlı API yanıtlarının cache'lenmesini önler
        devOptions: { enabled: false },
        // Yeniden açılışlarda eski SW'yi temizle (kullanıcının tarayıcısı eski cache'i bırakır)
        selfDestroying: mode === 'development',
        manifest: {
          name: 'Hane Finans',
          short_name: 'Hane Finans',
          description: 'BIST hisse, KAP haberleri, makro göstergeler ve sentiment için canlı asistan',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          lang: 'tr-TR',
          start_url: '/',
          icons: [
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
          // Yeni SW indiğinde hemen aktif olsun + tüm açık sekmeleri yönetsin
          // (eski deploy'lar kullanıcı sekme kapatana kadar takılı kalmasın).
          skipWaiting: true,
          clientsClaim: true,
          // API çağrılarını ASLA cache'leme (canlı veri için)
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            { urlPattern: /^\/api\//, handler: 'NetworkOnly' },
            { urlPattern: /^https:\/\/api\.frankfurter\.app/, handler: 'NetworkOnly' },
            { urlPattern: /^https:\/\/api\.twelvedata\.com/, handler: 'NetworkOnly' },
            { urlPattern: /^https:\/\/gnews\.io/, handler: 'NetworkOnly' },
            { urlPattern: /^https:\/\/www\.goldapi\.io/, handler: 'NetworkOnly' },
            // jsdelivr CDN cache'i bypass — günde 1 kez güncellenen veri için NetworkFirst
            { urlPattern: /^https:\/\/cdn\.jsdelivr\.net\//, handler: 'NetworkFirst', options: { cacheName: 'jsdelivr', expiration: { maxAgeSeconds: 600 } } },
          ],
        },
      }),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        // Dev-only CORS proxy → Yahoo Finance (BIST + endeks + Brent + VIX)
        '/api/yahoo': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/yahoo/, ''),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          },
        },
        // Dev proxy → TCMB EVDS. Anahtar header'a injekte edilir (frontend görmez).
        '/api/tcmb': {
          target: 'https://evds2.tcmb.gov.tr',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/tcmb/, '/service/evds'),
          headers: {
            key: env.TCMB_API_KEY ?? '',
          },
        },
        // Dev proxy → Telegram Bot API. Token URL'e injekte edilir (frontend görmez).
        '/api/telegram': {
          target: 'https://api.telegram.org',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/telegram/, `/bot${env.TELEGRAM_BOT_TOKEN ?? ''}`),
        },
      },
    },
    preview: { host: true, port: 5173 },
  };
});
