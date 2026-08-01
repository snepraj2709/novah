import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    envDir: '../..',
  }),
  manifest: {
    name: 'Novah',
    description: 'Save what matters. Recall it when it matters.',
    version: '0.1.0',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnHpWqu2r15v5areyRInaQFkkelbaseeTOD2v7j9d3Gq2jPc33aGDe9XtfCU1nJVvuswCqmUJo+azr3oGxQnBfGYTN4j6aVXKxkYsnxJbKaXtI+IklPYMOK1Gec9M5ubydimtJZyM0GJJf9jU/GvIZQz83iEe9Q3943CuUQFAB0OILCycWUIXjBj3Dse0nkyhmA6nQbDAuqcZS8pIAYHRajSqseZy/Vv9y6LDkOgnxvbFmL0k5NvP+12UlvZsePdP3OtHtVfdzsg16WPdBIZCRvpWW0/1WXECgGCdh9mz2iVUeRIvQFKz1wbObTLe5ABHUnE9Kjtw3wOFS06zwRGRjwIDAQAB',
    permissions: ['contextMenus', 'storage', 'activeTab'],
    host_permissions: ['https://fqinppulljqefbvukcpg.supabase.co/*'],
    action: {
      default_title: 'Open Novah',
    },
  },
});
