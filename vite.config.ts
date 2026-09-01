import { fileURLToPath, URL } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// 临时解决 trae 无法正确接收参数的问题
// 使用 "code" 作为文件名，以便 launch-editor 识别为 VS Code 并传递行号参数
const wrapperDir = path.join(os.tmpdir(), 'trae-wrapper')
if (!fs.existsSync(wrapperDir)) {
  fs.mkdirSync(wrapperDir, { recursive: true })
}
const traeWrapperPath = path.join(wrapperDir, 'code')
fs.writeFileSync(
  traeWrapperPath,
  `#!/bin/sh
  /usr/local/bin/trae "$@"
  `,
  { mode: 0o755 },
)

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
  plugins: [
    vue(),
    vueDevTools({
      launchEditor: traeWrapperPath,
    }),
  ],
  server: {
    host: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
