import { defineConfig } from 'wxt';

const developmentExtensionPublicKey =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApQet3wJrKilHFBI44/O00Za6oe+5hyxo2SVCAm5XvaHxTN/Aem8UBzC8mKY6cXWxyLGToLG9X/ZgQk9y+rAQCcBnTmHD3uZmhblN7nm/PM2H5XV3/ZRAwnjNXp3CLlsbpCS+N+D6l8FJx3+V+bL/4XACeRLidccekse339d3Fj7jlxdAfN0TRr4PRGoYa0Sqa96dD2QF7HeAwzVNtGZVtTyuHa3nBZTzqjNrlelaHEYa/ZEReIKxJWE3xV+r1dIN4WeM4W+vematGtISaw4gme1O8wFQv6y47dWxpZ4iKWn1KwwPV3M5E2pUv5vQ8SzypTnoQHw+cdQH/uCR1wuXOQIDAQAB';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    envDir: '../..',
  }),
  manifest: ({ mode }) => ({
    name: 'Novah',
    description: 'Save what matters. Find it and keep it in Practice.',
    version: '0.1.0',
    minimum_chrome_version: '141',
    ...(mode === 'store' ? {} : { key: developmentExtensionPublicKey }),
    permissions: ['contextMenus', 'storage', 'activeTab', 'scripting'],
    host_permissions: ['https://fqinppulljqefbvukcpg.supabase.co/*'],
    action: {
      default_title: 'Open Novah',
    },
    commands: {
      'save-selection-to-novah': {
        suggested_key: {
          default: 'Ctrl+Shift+S',
          mac: 'Command+Shift+S',
        },
        description: 'Save selected text to Novah',
      },
    },
  }),
});
