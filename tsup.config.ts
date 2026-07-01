import { defineConfig } from 'tsup'

const cliConfig = {
  entry: ['src/index.ts'],
  format: ['cjs'],
  outDir: 'dist',
  bundle: true,
  minify: false,
  clean: true,
  shims: true,
  outExtension: () => ({ js: '.cjs' }),
}

const extensionConfig = {
  entry: { popup: 'extension/src/popup.ts' },
  format: ['iife'],
  outDir: 'extension/dist',
  bundle: true,
  platform: 'browser' as const,
  target: 'chrome114',
  minify: false,
  clean: true,
  sourcemap: false,
  outExtension: () => ({ js: '.js' }),
}

export default defineConfig(process.env.TARGET === 'extension'
  ? extensionConfig
  : [cliConfig, extensionConfig])
