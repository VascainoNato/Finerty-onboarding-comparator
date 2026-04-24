import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
    watch: {
      // O backend grava em server/data/sessions.json a cada turno de onboarding.
      // Sem este ignore, o Vite detecta a escrita e força um full reload do
      // browser — exatamente o que estava "levando" a UI de volta pra home.
      ignored: ['**/server/data/**'],
    },
  },
})
