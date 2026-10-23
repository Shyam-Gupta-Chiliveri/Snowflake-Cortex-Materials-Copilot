import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const api = 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/health': api,
      '/ask': api,
      '/kpis': api,
      '/groups': api,
      '/anomalies': api,
      '/servicenow': api,
      '/sem': api,
      '/ncrs': api,
      '/lots': api,
      '/factors': api,
      '/ml': api,
      '/documents': api,
      '/pipeline': api,
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
