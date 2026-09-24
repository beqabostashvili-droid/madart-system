import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Workspace packages @madart/domain, @madart/types and @madart/hardware-adapters
// are compiled to CommonJS (the NestJS API needs CJS). Linked packages are not
// pre-bundled by default, so we force esbuild interop for them – also when they
// are imported indirectly through the source-only @madart/ui / @madart/api-client.
const CJS_WORKSPACE_DEPS = ['@madart/domain', '@madart/types', '@madart/hardware-adapters'];
const VIA = ['@madart/ui', '@madart/api-client'];
// only the packages a given VIA package really imports (Vite errors on unresolvable entries)
const VIA_DEPS = ['@madart/domain', '@madart/types'];

export default defineConfig({
  // Relative asset paths: the packaged Electron app loads index.html over
  // file://, where Vite's default absolute "/assets/…" resolves to the drive
  // root and the window stays blank. Also valid for the Vercel deployment.
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  optimizeDeps: {
    include: [...CJS_WORKSPACE_DEPS, ...VIA.flatMap((v) => VIA_DEPS.map((d) => `${v} > ${d}`)), '@madart/api-client > socket.io-client', '@madart/ui > @madart/hardware-adapters', '@madart/ui > qrcode'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    commonjsOptions: { include: [/node_modules/, /packages[\/](domain|types|hardware-adapters)[\/]dist/] },
  },
});
