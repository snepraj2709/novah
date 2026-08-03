# Novah Chrome extension

The Manifest V3 extension provides a persistent side panel for authenticated
capture and semantic recall. Selecting text and choosing **Save to Novah**
stores a local draft with the page title and URL before opening the panel.

The production bundle reads only the public `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` values from the ignored root `.env`. OpenAI and
privileged Supabase credentials must never be added to this application.

```bash
pnpm --filter extension test
pnpm --filter extension typecheck
pnpm --filter extension build
```

Load `apps/extension/.output/chrome-mv3` through Chrome's **Load unpacked**
control after a production build. The committed public manifest key gives the
unpacked build the stable ID `illdnfhcgdhkgbifepbejobplgikmmlp`; that ID must
be present in the server-side extension-origin allowlist.

`pnpm --filter extension zip` uses the dedicated `store` build mode and omits
the development-only manifest `key`, as required for a new Chrome Web Store
item. After the first upload, replace the development public key and expected
ID with the values assigned by the Store before the final clean-profile test.
