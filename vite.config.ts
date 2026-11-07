import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Duas páginas: o site de vendas em / (index.html) e o app em /app/ (app/index.html).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { site: resolve(__dirname, 'index.html'), app: resolve(__dirname, 'app/index.html') },
    },
  },
})
