# Chrome Web Store assets

- `store-icon-128.png`: required 128x128 store icon.
- `promo-tile.png`: 440x280 small promotional tile.
- `marquee-promo.png`: optional 1400x560 marquee image.
- `promo-tile.svg` and `marquee-promo.svg`: editable source artwork.
- `novah-0.1.0-chrome.zip`: ignored local upload package generated from the
  dedicated Store build. Its manifest intentionally omits the development-only
  `key` field.

The tracked 1280x800 screenshots under `screenshots/` document the previously
submitted pre-Practice `0.1.0` extension. They are historical evidence and must
not be reused for a Practice-compatible Store update. Capture new screenshots
from the approved current build before any future submission. Their ignored
`screenshots/raw/` sources and the local unpacked build remain available as
reproducible historical evidence. Do not use mock data that looks like a real
person's private note, account, or source history.

The exact ZIP is also extracted to the ignored
`novah-0.1.0-unpacked/` directory for the clean-profile **Load unpacked** test.
