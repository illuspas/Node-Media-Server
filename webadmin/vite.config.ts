import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Served by the media server under /admin; asset URLs must be prefixed accordingly
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  server: {
    // Dev proxy to the NMS admin API; in production the webadmin is served
    // by the media server itself, so /api is same-origin.
    proxy: {
      "/api": {
        target: process.env.NMS_API_TARGET || "http://localhost:8000",
        changeOrigin: true
      }
    }
  }
})
