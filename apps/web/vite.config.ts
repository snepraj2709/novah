import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/$/u, '');
  const applicationOrigin = process.env.APP_URL?.replace(/\/$/u, '');

  if (command === 'serve' && (!supabaseUrl || !applicationOrigin)) {
    throw new Error(
      'VITE_SUPABASE_URL and APP_URL are required. Start the app with `pnpm dev` from the repository root.',
    );
  }

  return {
    plugins: [react(), tailwindcss()],
    server:
      command === 'serve' && supabaseUrl && applicationOrigin
        ? {
            proxy: {
              '/functions/v1': {
                target: supabaseUrl,
                changeOrigin: true,
                configure(proxy) {
                  proxy.on('proxyReq', (proxyRequest) => {
                    proxyRequest.setHeader('origin', applicationOrigin);
                  });
                },
              },
            },
          }
        : undefined,
  };
});
