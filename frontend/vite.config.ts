import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5286, proxy: { '/api': 'http://127.0.0.1:4286', '/health': 'http://127.0.0.1:4286' } },
  build: { chunkSizeWarningLimit: 750 },
});
