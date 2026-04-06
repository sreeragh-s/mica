import { resolve } from 'path'
import { loadEnv } from 'vite'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const authUrl = env.VITE_AUTH_URL ?? ''

  return {
    main: {
      define: {
        __APP_AUTH_URL__: JSON.stringify(authUrl),
      },
      build: {
        rollupOptions: {
          /** Native addons and runtime-loaded modules — must load from node_modules at runtime */
          external: ['electron-liquid-glass', '@lancedb/lancedb', 'electron-ollama'],
        },
      },
    },
    preload: {},
    renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()],
  },
}
})
