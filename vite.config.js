import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode === 'production' && !env.VITE_API_URL && !process.env.VITE_API_URL) {
    console.warn('\x1b[33m%s\x1b[0m', '[WARN] VITE_API_URL is not set. Ensure VITE_API_URL is defined in production deployment environment.')
  }
  return {
    plugins: [react()],
    oxc: {
      drop: mode === 'production' ? ['console', 'debugger'] : []
    }
  }
})
