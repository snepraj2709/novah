# Store screenshot checklist

Place original screenshots in the ignored `raw/` subdirectory. Codex will
inspect them and produce final 1280x800 PNG assets in this directory.

Use only a disposable Novah account and synthetic or public example text. Hide
bookmarks, unrelated tabs, profile pictures, emails, passwords, extension IDs,
tokens and notification previews.

## Screenshot 1 — Deliberate capture

- Open `https://example.com` in the temporary Chrome profile.
- Select the example paragraph and open the right-click menu.
- Capture the visible **Save to Novah** action.
- Keep the Novah toolbar icon visible if possible.

## Screenshot 2 — Preserve source context

- Invoke **Save to Novah** so the side panel opens.
- Capture the Capture tab showing the selected text, source title and URL.
- Do not show a real personal-context value or any account identifier.

## Screenshot 3 — Recall by meaning

- Save the synthetic note and search for a short phrase from it.
- Capture Recall showing the matching original note and source.
- If an answer is withheld because evidence is weak, that state is acceptable
  only if the matching note remains visible.

## Image requirements

- Provide PNG or JPEG originals at 1280x800 or larger.
- Do not stretch the UI or place it inside a misleading device mockup.
- Keep text legible and show only behavior present in version `0.1.0`.
- Up to five screenshots are allowed; these three cover the core extension
  purpose without adding unrelated claims.

## Final assets

- `store-01-save-to-novah.png` — selected text and the context-menu action.
- `store-02-review-selection.png` — captured text and source context in the
  Novah side panel.
- `store-03-recall-result.png` — grounded Recall with cited ranked notes.

Each final image uses a focal-point-aware 16:10 crop from its high-resolution
source and then scales proportionally to 1280x800. The context-menu image is
anchored left; Capture and Recall are anchored right so the complete Novah side
panel remains visible. No UI is stretched, padded or regenerated.
