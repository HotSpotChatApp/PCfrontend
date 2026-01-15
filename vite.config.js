import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
<<<<<<< Updated upstream
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: [
      'pcfrontend.onrender.com'
    ]
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
=======
    plugins: [react()],
    server: {
        port: 5173,
        host: '0.0.0.0'
    },
    build: {
        outDir: 'dist',
        sourcemap: false
    }
>>>>>>> Stashed changes
})
