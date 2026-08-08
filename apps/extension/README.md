# Novah Chrome extension

The Manifest V3 extension provides a persistent side panel for authenticated
Capture and semantic Find. Selecting text and choosing **Save to Novah** stores
a local draft with the page title and URL before opening the panel. After a
successful save, the success state clears automatically after two seconds;
**Done** clears it immediately and **Keep this with me** explicitly activates
the note through `manage-practice`.

The production bundle reads only the public `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` values from the ignored root `.env`. OpenAI and
privileged Supabase credentials must never be added to this application.

```bash
pnpm --filter extension test
pnpm --filter extension typecheck
pnpm --filter extension build
```

## Local Chrome installation

Use `apps/extension/.output/chrome-mv3` as the only unpacked development
extension directory. Do not load `apps/extension/.output/chrome-mv3-store` or
anything under `release/chrome-web-store`; those are packaging snapshots and
do not receive normal development builds.

To replace an extension loaded from another directory:

1. Save or discard any pending local drafts. Removing an unpacked extension can
   clear its local drafts and authentication session; notes already saved to
   Novah remain in the account.
2. Close the Novah side panel.
3. Open `chrome://extensions`, enable **Developer mode**, and remove the
   existing Novah extension.
4. Run `pnpm --filter extension build` from the repository root.
5. Click **Load unpacked**. In the folder picker, press **Command-Shift-G** and
   enter the absolute path to `apps/extension/.output/chrome-mv3`.
6. Confirm the extension ID is `illdnfhcgdhkgbifepbejobplgikmmlp`, then sign
   in again if Chrome requests it.

For every later code change, run `pnpm --filter extension build`, close the
open side panel, click **Reload** on the Novah card in `chrome://extensions`,
and reopen the panel. There is no need to remove or load the extension again.

The committed public manifest key gives the unpacked build the stable ID
`illdnfhcgdhkgbifepbejobplgikmmlp`; that ID must be present in the server-side
extension-origin allowlist.

`pnpm --filter extension zip` uses the dedicated `store` build mode and omits
the development-only manifest `key`, as required for a new Chrome Web Store
item. After the first upload, replace the development public key and expected
ID with the values assigned by the Store before the final clean-profile test.
