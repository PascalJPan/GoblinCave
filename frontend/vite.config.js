import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/personal/GoblinCave/',
  server: {
    proxy: {
      '/personal/GoblinCave/api': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        rewrite: (path) => path.replace('/personal/GoblinCave/api', ''),
      },
    },
  },
})
