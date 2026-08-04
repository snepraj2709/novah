# Novah Chrome Web Store submission

This sheet is the source of truth for the next Practice-compatible Chrome Web
Store listing update. Do not copy it into the publisher dashboard or upload a
new package without separate Store authorization. The already submitted
`0.1.0` listing and screenshots describe the prior product and remain external
historical state until that approved update.

## Publisher account

- **Publisher name:** Orion Mind
- **Extension name:** Novah
- **Publisher administrator:** `snevandan27@gmail.com`
- **Public contact/support email:** `snevandan27@gmail.com`

Orion Mind is the umbrella publisher shown by the Chrome Web Store. Novah
remains the extension's product name and branding.

## Product details

**Name:** Novah

**Summary:** Save what matters. Find it when it matters.

**Category:** Education

**Language:** English

**Single purpose:**

Save ideas deliberately selected by the user, preserve their source context,
and retrieve the user's saved notes from a Chrome side panel.

**Detailed description:**

Novah helps you capture ideas and reflections wherever they occur, find them
again by meaning, and deliberately practise selected notes until you decide
they have become part of how you think or act.

Select text on a webpage, right-click **Save to Novah**, and review the exact
selection in the side panel before saving. Novah can keep the page title and
source URL, optional personal context, and a note Type. You can also write a
note manually.

Connect Novah to its Telegram bot to capture ideas away from the browser. Send
plain text, forwarded text, or a voice note in a private Telegram chat. Voice
notes are transcribed and saved as text; Novah does not durably store the raw
audio.

Use Find to search your own saved notes in natural language. Results show the
original note, its context and source. When the retrieved evidence is strong
enough, Novah can provide a short grounded answer with citations to the actual
notes. When it is not, Novah shows possible matches without inventing an
answer.

After a successful capture, choose **Done** or **Keep this with me**. Activation
is explicit and never happens automatically. Up to three active Practices can
be scheduled from 1 through 30 calendar days apart. Practice always shows the
exact original note; **Reread** completes an encounter without a memory grade
or required writing. The full web app supports optional append-only Reflection
and Story entries, pause and resume, user-declared Integrated status, and
monthly integration check-ins. The extension itself remains focused on Capture
and Find, plus activating the note it just saved.

Novah requires an account. Information that you deliberately submit—including
selected webpage text, manual or Telegram text, voice-note transcriptions,
optional context, source details, and Find queries—is sent over HTTPS to
Novah's Supabase backend so it can be stored and retrieved. OpenAI processes
the minimum information needed for voice transcription, optional Type
classification, search embeddings, and grounded Find synthesis. New captures do not
receive generated summaries, tags, or per-note recall prompts.

Core features:

- Capture selected text from the right-click menu.
- Add notes manually from a persistent side panel.
- Capture ideas and reflections as text or voice notes through the linked
  Telegram bot.
- Preserve original text and source context.
- Classify a note only when you leave Type blank.
- Retrieve your own notes using natural-language search.
- Explicitly activate a newly saved note with **Keep this with me**.
- Keep at most three notes in active Practice without displacing another note.
- Manage due, upcoming, paused, and Integrated Practices in the Novah web app.
- Keep failed drafts locally so you can retry.
- Review privacy details and delete or export data from the Novah web app.

Novah does not inject content into webpages, read browsing history in the
background, show advertisements, sell personal data or use note content for
third-party analytics.

## URLs

- Homepage: `https://novah-ten.vercel.app`
- Privacy policy: `https://novah-ten.vercel.app/privacy`
- Public contact/support email: `snevandan27@gmail.com`
- Support URL: omit unless Orion Mind publishes a dedicated support page before
  submission.

## Permission justifications

### `contextMenus`

Adds **Save to Novah** to Chrome's context menu only when the user has selected
text. The menu action is the extension's intentional capture entry point.

### `sidePanel`

Displays Novah's sign-in, Capture, and Find interface beside the source page
without injecting a content script into the page.

### `storage`

Stores the user's Supabase authentication session, explicit settings and
unsaved capture drafts locally. Draft storage prevents data loss after a
network failure or sign-in interruption.

### `activeTab`

After the user invokes **Save to Novah**, allows Novah to read only the active
tab's title and URL for source attribution. Novah does not use this permission
for continuous or background browsing observation.

### Host permission

`https://fqinppulljqefbvukcpg.supabase.co/*` is the sole application backend.
The extension uses it for Supabase authentication and authenticated Novah API
requests. No broad host permission is requested.

## Remote code declaration

**Does the extension use remote code?** No.

All executable JavaScript is packaged inside the extension. The extension sends
HTTPS requests to the Novah Supabase backend and receives data; it does not
download or evaluate remote JavaScript, WebAssembly or executable commands.

## Data-use disclosures

Declare the following data types because the extension handles them as part of
its visible capture, authentication and Find features:

- **Personally identifiable information:** the email address used for the Novah
  account.
- **Authentication information:** the user's sign-in credential is processed by
  Supabase Auth, and the resulting session is stored locally by the extension.
- **Website content:** only text the user deliberately selects, plus the active
  page title and URL captured after the user invokes **Save to Novah**.
- **Web history:** the source URL attached to a deliberately saved capture. The
  extension does not collect continuous browsing history.
- **Personal communications:** text and voice-note transcriptions deliberately
  sent to the linked Telegram bot, plus manually entered notes, personal
  context, Find queries and explicit note Types that the extension can store
  or retrieve.

Do not select financial information, health information, precise location, or
general user-activity tracking unless the product changes before submission.

The disclosed data is used only to provide Novah's single purpose: account
access, deliberate capture, secure storage, semantic retrieval and user-requested
Find. It is not sold, used for personalized advertising, used for credit or
lending, or transferred for unrelated purposes. Data is transmitted over HTTPS.

Certify the Chrome Web Store Limited Use disclosure only if the submitted build
and public privacy policy still match these statements.

## Distribution

Use **Unlisted** for the first beta. The item will not appear in Chrome Web
Store search or browsing, but anyone who receives its direct store URL can
install it. Share that URL only with the intended beta testers. Unlisted items
go through the same Chrome Web Store review process as other visibility modes.

## First-upload item ID check

**Chrome Web Store item ID:** `illdnfhcgdhkgbifepbejobplgikmmlp`

The unpacked production build uses the Store public key and therefore resolves
to the same ID, `illdnfhcgdhkgbifepbejobplgikmmlp`. The hosted CORS allowlist
contains this exact ID: the final Store origin and production web origin return
the intended preflight headers, while the obsolete development origin is
denied.

The initial Chrome Web Store upload ZIP intentionally has no manifest `key`.
After creating the draft item, open **Package**, select **View public key**, and
compare the dashboard Item ID with the unpacked development ID. The initial IDs
differed, and the development build has now been reconciled to the Store key:

Completed reconciliation:

1. The development manifest key was replaced with the dashboard public key.
2. The final Store Item ID replaced the obsolete ID in the server-side
   `ALLOWED_EXTENSION_IDS` configuration after explicit hosted-write approval.
3. The unpacked production build resolves to the dashboard Item ID; the Store
   upload ZIP remains keyless.

The draft was submitted only after the final-origin clean-profile test and all
remaining Store fields passed. Chrome Web Store status is now **Pending
review**; keep the dedicated reviewer account active until review completes.

Never weaken CORS to accept arbitrary `chrome-extension://` origins to avoid
this reconciliation.

## Test instructions for the reviewer

1. Open the Novah side panel from the toolbar action.
2. Sign in using the temporary reviewer account supplied privately in the
   dashboard's test-instructions field. Never put credentials in this file.
3. Open a normal HTTPS article, select text, right-click and choose **Save to
   Novah**.
4. Confirm the selected text, page title and URL appear in the Capture tab.
5. Save the note with an explicit Type to avoid waiting for optional
   classification.
6. Choose **Done**, open Find, and search for words from the saved note.
7. Confirm the saved note appears as a result.

If Chrome's PDF viewer does not expose a selected URL, paste the source URL into
the optional field; this is the documented private-beta fallback.

## Publisher checks before submission

- Publisher name is exactly **Orion Mind** and is intentionally public-facing.
- Extension name remains exactly **Novah**.
- Public contact email is `snevandan27@gmail.com`; verify it in the dashboard
  and monitor it actively.
- Two-Step Verification is enabled on every publishing account.
- Privacy and homepage URLs return HTTP 200 without requiring sign-in.
- Store images show the submitted build and contain no real user data.
- Reviewer credentials are disposable and supplied only in the private dashboard
  field.
- The package version is `0.1.0`, and `manifest.json` is at the ZIP root.
