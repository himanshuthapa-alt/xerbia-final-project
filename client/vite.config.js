import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // dev convenience: same-origin API calls, no CORS drama
      '/api': 'http://localhost:5002',
    },
  },
});
