import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import { siteSeoPlugin } from './seo-plugin.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(fs.readFileSync(new URL('./site.config.json', import.meta.url), 'utf8'));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  const backendPort = process.env.PORT || env.PORT || '3000';

  return {
    plugins: [react(), siteSeoPlugin(site)],
    server: {
      host: '127.0.0.1',
      proxy: { '/api': `http://localhost:${backendPort}` },
    },
  };
});
