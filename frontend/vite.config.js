import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  const backendPort = process.env.PORT || env.PORT || '3000';

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      proxy: { '/api': `http://localhost:${backendPort}` },
    },
  };
});
