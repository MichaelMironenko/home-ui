import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5175,
    proxy: {
      // всё /api/* шлём на бэк
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      // и всё /auth/* тоже на бэк
      '/auth': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
    watch: {
      usePolling: true,
      interval: 100
    }
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]'
      }
    }
  }
})
