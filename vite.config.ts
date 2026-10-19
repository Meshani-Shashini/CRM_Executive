import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        configure(proxy) {
          proxy.on('error', (_error, _request, response) => {
            if (response.headersSent) return;
            response.writeHead(503, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({
              error: 'Authentication and data API is unavailable. Configure MongoDB and JWT settings in .env, then restart npm run dev.',
            }));
          });
        },
      },
    },
  },
});
