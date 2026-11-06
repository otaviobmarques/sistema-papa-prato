import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build` gera o app normal (dist/); `npm run build:single` gera um HTML único
// (dist-single/) para pré-visualização, com a base de alimentos servida ao lado.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: mode === 'single' ? { outDir: 'dist-single', copyPublicDir: true } : { outDir: 'dist' },
}))
