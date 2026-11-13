import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  clearScreen: false,
  optimizeDeps: { exclude: ['@facile/muse', '@facile/client', '@facile/blob'] },
  server: {
    port: Number(process.env.PORT) || 3000,
    proxy: {
      '/trpc': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/auth/config': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/auth/oidc': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/docs': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/api/registre/sync': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/api/auth/backchannel-logout': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/api/agent/': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/api/integrations/ardoise/webhook': {
        target: backendUrl,
        changeOrigin: true,
      },
      '^/mcp(\\?.*)?$': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/.well-known/oauth-protected-resource': {
        target: backendUrl,
        changeOrigin: true,
      },
    },
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
