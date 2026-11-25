import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Local development only. The app calls same-origin `/api` and `/auth`
  // (see src/app/api.ts, where BASE = ''), which Vercel rewrites to the
  // deployed backend in production (see vercel.json). In `vite dev` there is
  // no such rewrite, so forward those paths to the local Express backend.
  // Override the target with VITE_API_PROXY_TARGET if the backend runs
  // elsewhere. This has no effect on `vite build` output.
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:10000',
        changeOrigin: true,
      },
      '/auth': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:10000',
        changeOrigin: true,
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'motion': ['motion'],
          'charts': ['recharts'],
          'radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs',
            '@radix-ui/react-accordion',
          ],
        },
      },
    },
  },
})
