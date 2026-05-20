import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  outDir: 'dist',
  bundle: true,
  minify: false,
  clean: true,
  shims: true,
  outExtension: () => ({ js: '.cjs' }),
})
