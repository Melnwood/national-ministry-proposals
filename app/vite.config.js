import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// The live Netlify function backend. In `npm run dev` we proxy all function
// calls to production so the local app signs in against the real Airtable data
// without needing `netlify dev` or local secrets.
// NOTE: this repo deploys to `national-ministry-proposals.netlify.app`. There is
// a second, stale site (`national-ministry-projects-grant-dep`, the old URL in
// DEPLOY.md) that now 404s — do not point at it.
const BACKEND = 'https://national-ministry-proposals.netlify.app';

export default defineConfig({
  plugins: [preact()],
  // Visible build stamp shown in the app header, so anyone can tell at a
  // glance whether their browser is running the latest deploy.
  define: {
    __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
  server: {
    proxy: {
      '/.netlify/functions': { target: BACKEND, changeOrigin: true, secure: true },
    },
  },
  build: {
    // Built assets land in app/dist. When we cut over (Phase 5) Netlify will
    // publish this directory; until then nothing here is deployed.
    outDir: 'dist',
    emptyOutDir: true,
  },
});
