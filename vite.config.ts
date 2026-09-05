import { defineConfig } from 'vite'

export default defineConfig({
  // Served from https://<user>.github.io/pinball-redux-playhere/ on GitHub
  // Pages, so the base must match the repository name or every asset 404s.
  base: '/pinball-redux-playhere/',
  // Fixed port so this and the original pinball-redux repo (which takes vite's
  // default 5173) can run side by side, with a stable port-to-version mapping
  // regardless of which one is started first.
  server: { port: 5174, strictPort: true },
})
