import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Allow external connections
    // Removed proxy since we're using direct API calls
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})