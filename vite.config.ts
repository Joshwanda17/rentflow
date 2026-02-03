import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
    __BUILD_TIME__: JSON.stringify(Date.now()),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['welile-logo.png', 'favicon.png'],
      manifest: {
        name: 'Welile.com',
        short_name: 'Welile.com',
        description: "Africa's leading rent facilitation platform",
        start_url: '/dashboard',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#7c3aed',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/welile-logo.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/welile-logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Maximum file size for precaching (5MB)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Skip waiting to activate new SW immediately
        skipWaiting: true,
        clientsClaim: true,
        // Precache app shell for instant offline loading
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/rest/, /^\/auth\/callback/],
        // Clean old caches - CRITICAL for iOS
        cleanupOutdatedCaches: true,
        // iOS-specific: Force cache versioning to prevent stale data
        cacheId: 'welile-v9',
        runtimeCaching: [
          // Google Fonts - cache forever
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // Supabase API - NetworkFirst for iOS compatibility (fresh data priority)
          // This ensures iOS PWA users always get fresh data when online
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache-v2',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5 // 5 minutes max cache age
              },
              networkTimeoutSeconds: 10, // Fall back to cache after 10s
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // Images - cache first for speed
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          },
          // JS/CSS - stale-while-revalidate
          {
            urlPattern: /\.(?:js|css)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-resources',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              }
            }
          }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
