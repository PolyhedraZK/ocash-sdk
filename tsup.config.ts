import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      browser: 'src/index.browser.ts',
      node: 'src/index.node.ts',
    },
    format: ['esm', 'cjs'],
    splitting: false,
    sourcemap: true,
    dts: {
      entry: {
        index: 'src/index.ts',
        browser: 'src/index.browser.ts',
        node: 'src/index.node.ts',
      },
    },
    clean: true,
    target: 'es2020',
    bundle: true,
    shims: true,
  },
]);
