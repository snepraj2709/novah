import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import viteConfig from '../vite.config.ts';

describe('local development launcher', () => {
  it('preserves configured Auth and proxies only Edge Function requests', async () => {
    const [
      rootPackageSource,
      api,
      viteConfigSource,
      webSupabase,
      extensionApi,
    ] = await Promise.all([
      readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
      readFile(new URL('../src/lib/api.ts', import.meta.url), 'utf8'),
      readFile(new URL('../vite.config.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../extension/lib/api.ts', import.meta.url), 'utf8'),
    ]);
    const rootPackage = JSON.parse(rootPackageSource) as {
      scripts?: Record<string, string>;
    };

    assert.equal(
      rootPackage.scripts?.dev,
      'set -a; . ./.env; set +a; pnpm --filter web dev --host 127.0.0.1 --port 5173 --strictPort',
    );
    assert.match(api, /import\.meta\.env\.DEV/u);
    assert.match(api, /\/functions\/v1\/\$\{functionName\}/u);
    for (const functionName of [
      'search-notes',
      'telegram-link-code',
      'delete-account',
      'manage-practice',
    ]) {
      assert.match(api, new RegExp(`'${functionName}'`, 'u'));
    }
    assert.match(
      webSupabase,
      /createClient<Database>\(\s*configuration\.supabaseUrl/u,
    );
    assert.match(
      extensionApi,
      /\$\{configuration\.supabaseUrl\}\/functions\/v1\/\$\{functionName\}/u,
    );
    assert.match(viteConfigSource, /proxy/u);
    assert.match(viteConfigSource, /VITE_SUPABASE_URL/u);
    assert.match(viteConfigSource, /APP_URL/u);

    const target = 'https://fqinppulljqefbvukcpg.supabase.co';
    const applicationOrigin = 'https://novah.example.com';
    const previousTarget = process.env.VITE_SUPABASE_URL;
    const previousApplicationOrigin = process.env.APP_URL;
    process.env.VITE_SUPABASE_URL = target;
    process.env.APP_URL = applicationOrigin;
    try {
      assert.equal(typeof viteConfig, 'function');
      const configuration = await viteConfig({ command: 'serve' } as never);
      const buildConfiguration = await viteConfig({
        command: 'build',
      } as never);
      assert.equal(buildConfiguration.server, undefined);
      const proxyOptions = configuration.server?.proxy?.['/functions/v1'];
      assert.equal(typeof proxyOptions, 'object');
      assert.equal(typeof proxyOptions.configure, 'function');

      let rewriteOrigin:
        | ((request: { setHeader(name: string, value: string): void }) => void)
        | undefined;
      proxyOptions.configure(
        {
          on(event: string, handler: typeof rewriteOrigin) {
            if (event === 'proxyReq') rewriteOrigin = handler;
          },
        } as never,
        proxyOptions,
      );

      const headers = new Map<string, string>();
      rewriteOrigin?.({
        setHeader(name, value) {
          headers.set(name, value);
        },
      });
      assert.equal(headers.get('origin'), applicationOrigin);
    } finally {
      if (previousTarget === undefined) {
        delete process.env.VITE_SUPABASE_URL;
      } else {
        process.env.VITE_SUPABASE_URL = previousTarget;
      }
      if (previousApplicationOrigin === undefined) {
        delete process.env.APP_URL;
      } else {
        process.env.APP_URL = previousApplicationOrigin;
      }
    }
  });
});
