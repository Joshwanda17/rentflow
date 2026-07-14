import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify('2026-05-31-safari-recovery-steps'),
    __CACHE_VERSION__: JSON.stringify('2026-05-31-safari-recovery-steps'),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mcpPlugin(),
    mcpPlugin({ mcpEntry: "src/lib/mcp-public/index.ts", functionName: "mcp-public" }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-tooltip', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs', '@radix-ui/react-select'],
          'vendor-motion': ['framer-motion'],
          'vendor-charts': ['recharts'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-maps': ['leaflet', 'react-leaflet'],
        },
      },
    },
    // es2015 (ES6) is the widest safe syntax floor: it runs on very old
    // Android System WebViews / stock browsers (Android 5+, Chrome 51+,
    // Samsung Internet 5+, Safari 10+) while modern phones execute it natively
    // with no meaningful cost. Combined with the feature-guarded runtime
    // polyfills in src/lib/runtimePolyfills.ts (which only patch MISSING
    // methods), a SINGLE bundle serves every supported browser — no separate
    // legacy build or differential serving needed.
    target: 'es2015',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1500,
    sourcemap: false,
    // Smaller chunks for slow 2G/3G networks
    assetsInlineLimit: 4096,
    // Use esbuild minifier — dramatically lower memory footprint than terser
    // (terser with passes:2 on 6000+ modules was OOM-killing the build).
    minify: 'esbuild',
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
}));
