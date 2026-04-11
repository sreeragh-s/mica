// electron.vite.config.ts
import { resolve } from 'path'
import { loadEnv } from 'vite'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
var __electron_vite_injected_dirname = '/Users/sreeraghs/Documents/projects/notelab'
var electron_vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const authUrl = env.VITE_AUTH_URL ?? ''
  const serverUrl = env.VITE_NOTELAB_SERVER_URL ?? ''
  return {
    main: {
      define: {
        __APP_AUTH_URL__: JSON.stringify(authUrl),
        __APP_SERVER_URL__: JSON.stringify(serverUrl)
      },
      build: {
        rollupOptions: {
          /** Native addons and runtime-loaded modules — must load from node_modules at runtime */
          external: ['electron-ollama']
        }
      }
    },
    preload: {},
    renderer: {
      build: {
        rollupOptions: {
          input: {
            index: resolve(__electron_vite_injected_dirname, 'src/renderer/index.html')
          }
        }
      },
      resolve: {
        alias: {
          '@': resolve('src/renderer/src'),
          '@renderer': resolve('src/renderer/src')
        }
      },
      plugins: [react(), tailwindcss()]
    }
  }
})
export { electron_vite_config_default as default }
