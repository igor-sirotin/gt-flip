# GT Flip

A Google Chrome extension that automatically switches the **target language** on [Google Translate](https://translate.google.com) whenever the detected input language changes.

**Use case:** you work in two languages (e.g. Russian and English). When you type Russian, GT Flip sets the target to English. When you type English, GT Flip sets the target to Russian — no manual clicking needed.

---

## How it works

1. Google Translate auto-detects the source language as you type.
2. GT Flip watches for that detection (via DOM mutations and URL changes).
3. When the detected language changes, the extension clicks the correct target-language tab on your behalf.

The MVP hard-codes **English ↔ Russian**. See [Customisation](#customisation) to change the pair.

---

## Local testing (load unpacked)

### Prerequisites

- Google Chrome (or any Chromium-based browser)
- Node.js ≥ 18 (only needed for the one-time icon generation step)

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/igor-sirotin/gt-flip.git
cd gt-flip

# 2. Generate the PNG icons (only needed once)
node icons/create-icons.js

# 3. Open Chrome and navigate to the extensions page
#    chrome://extensions

# 4. Enable "Developer mode" (toggle in the top-right corner)

# 5. Click "Load unpacked" and select the gt-flip directory

# 6. Navigate to https://translate.google.com
#    Make sure "Detect language" is selected as the source.
#    Start typing in Russian → target switches to English.
#    Clear and type in English → target switches to Russian.
```

### Verifying it works

Open DevTools on `translate.google.com` (`F12`) and check the **Console** tab.
GT Flip logs every flip action:

```
[GT Flip] source: ru → target: en
[GT Flip] Clicked target tab: en
```

---

## Customisation

To use a different language pair, edit the `LANGUAGES` array near the top of `content.js`:

```js
const LANGUAGES = [
  { code: 'de', names: ['German', 'Deutsch'] },
  { code: 'fr', names: ['French', 'Français'] },
];
```

- `code` – the BCP-47 language code that Google Translate uses in the URL (`sl=` / `tl=` query params)
- `names` – how that language appears in the Google Translate UI (checked case-insensitively; add variants if needed)

After saving, go to `chrome://extensions` and click the **↺ refresh** button for GT Flip.

---

## Publishing to the Chrome Web Store

> Publishing requires a one-time $5 developer registration fee.

### Prepare the submission package

```bash
# From the repo root — creates gt-flip.zip ready for upload
zip -r gt-flip.zip . \
  --exclude "*.git*" \
  --exclude "*.DS_Store" \
  --exclude "icons/create-icons.js" \
  --exclude "README.md"
```

### Upload

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Click **New Item** and upload `gt-flip.zip`.
3. Fill in the store listing:
   - **Name:** GT Flip
   - **Short description:** Auto-switches Google Translate target language when the input language is detected.
   - **Category:** Productivity
   - Add at least one screenshot (1280×800 or 640×400 px).
4. Under **Privacy**, state that the extension does not collect any user data.
5. Click **Submit for review** — approval typically takes 1–3 business days.

### Required privacy policy (if requested)

GT Flip does not collect, transmit, or store any user data. All logic runs locally in the browser tab.

---

## File structure

```
gt-flip/
├── manifest.json        # Extension manifest (Manifest V3)
├── content.js           # Core logic – runs inside translate.google.com tabs
├── icons/
│   ├── create-icons.js  # Node.js script to generate PNG icons (run once)
│   ├── icon16.png       # Generated icon
│   ├── icon48.png       # Generated icon
│   └── icon128.png      # Generated icon
└── README.md
```

---

## Limitations & known issues

- Google may update the GT DOM at any time, which could break detection. If the extension stops working, open an issue — the fix is usually a selector update in `content.js`.
- If neither language in the pair is visible in the target quick-tabs, GT Flip falls back to updating the URL's `tl` parameter. The translation re-runs on the next user interaction.
- Only the two configured languages are handled; any other detected language is ignored.

---

## License

MIT
