import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API + Socket.IO to the backend so the app is served from a single
    // origin (no CORS, no mixed-content). Mic works over http on localhost,
    // which browsers treat as a secure context.
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:8000', changeOrigin: true, ws: true },
    },
  },
})
