import { defineConfig } from 'vite'

// GitHub Pages serviert das Projekt unter /fynnox-city/.
// Ohne base laden auf Pages weder Bundle noch Assets.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/fynnox-city/' : '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
})
