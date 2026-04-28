import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    proxy: {
      '/pds-data': {
        target: 'https://pds-geosciences.wustl.edu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pds-data/, ''),
        secure: true,
      },
      '/pds-ode-files': {
        target: 'https://ode.rsl.wustl.edu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pds-ode-files/, ''),
        secure: true,
      },
    },
  },
})
