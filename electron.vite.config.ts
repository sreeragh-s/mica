import { resolve } from 'path'
import { loadEnv } from 'vite'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const authUrl = env.VITE_AUTH_URL ?? ''
  const serverUrl = env.VITE_NOTELAB_SERVER_URL ?? ''

  return {
    main: {
      resolve: {
        alias: {
          '@shared': resolve('src/shared'),
        },
      },
      define: {
        __APP_AUTH_URL__: JSON.stringify(authUrl),
        __APP_SERVER_URL__: JSON.stringify(serverUrl),
      },
      build: {
        rollupOptions: {
          external: ['electron-ollama'],
        },
      },
    },
    preload: {
      resolve: {
        alias: {
          '@shared': resolve('src/shared'),
        },
      },
    },
    renderer: {
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'src/renderer/index.html'),
          },
        },
      },
      resolve: {
        alias: {
          '@': resolve('src/renderer'),
          '@renderer': resolve('src/renderer'),
          '@shared': resolve('src/shared'),
        },
      },
      plugins: [react(), tailwindcss()],
    },
  }
})
