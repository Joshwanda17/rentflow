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
      // Cap peak memory during the render phase: instead of one enormous
      // entry chunk (8 MB+) that rollup must hold + minify in memory at once,
      // split every node_modules dependency into its own vendor chunk.
      maxParallelFileOps: 2,
      output: {
        // Split every node_modules dependency into its own vendor chunk so
        // rollup never has to hold one enormous chunk in memory during the
        // render/minify phase (that was OOM-killing the production build).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          const parts = id.split('node_modules/').pop()!.split('/');
          const pkg = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
          // Keep the React runtime in a single chunk to avoid duplicate copies.
          if (['react', 'react-dom', 'react-router', 'react-router-dom', 'scheduler'].includes(pkg)) {
            return 'vendor-react';
          }
          return `vendor-${pkg.replace('@', '').replace('/', '-')}`;
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
