import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND = process.env.VITE_BACKEND_ORIGIN || 'http://localhost:8000';

// Every path prefix owned by the API. Anything not listed here is served by
// the dev server itself and comes back as the SPA's index.html, which the
// client then reports as a confusing 404 — so a new backend router must be
// added here too. (That is exactly how /email-accounts was missed.)
const API_PREFIXES = [
  '/auth',
  '/emails',
  '/email-accounts',
  '/profile',
  '/documents',
  '/comparison',
  '/reviews',
  '/evaluation',
  '/upload',
  '/dashboard',
  '/submit',
  '/health',
  '/audit',
  '/shipments',
];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: Object.fromEntries(API_PREFIXES.map((p) => [p, BACKEND])),
  },
});
// Storm theme reload trigger
