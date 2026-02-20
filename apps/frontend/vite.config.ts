import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  clearScreen: false,
  server: {
    port: Number(process.env.PORT) || 3000,
    fs: {
      allow: ['..', '../../packages']
    }
  },
  assetsInclude: ['***.woff2', '***.otf'],
  ssr: {
    noExternal: ['@repo/*'],
    external: ['pino', 'pino-pretty', 'thread-stream', 'worker_threads'],
  },
  build: {
    rollupOptions: {
      external: ['worker_threads'],
      onwarn(warning, warn) {
        if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return;
        warn(warning);
      }
    }
  },
  resolve: {
    alias: {
      'worker_threads': 'worker_threads',
    }
  }
});
