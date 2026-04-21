/**
 * GT Flip – content script
 *
 * Watches the Google Translate source textarea for input, detects the typed
 * language via chrome.i18n.detectLanguage(), and automatically switches the
 * target language to the configured pair's opposite.
 *
 * MVP: hardcoded English ↔ Russian pair.
 * To change the pair, edit the LANGUAGES array below.
 */
(function () {
  'use strict';

  // ── Configuration ────────────────────────────────────────────────────────────
  // code  – BCP-47 language code used by Google Translate in the URL (sl=/tl=)
  // names – display names as they appear in the GT target-tab UI
  const LANGUAGES = [
    { code: 'en', names: ['English'] },
    { code: 'ru', names: ['Russian', 'Русский'] },
  ];

  // Minimum confidence % from chrome.i18n.detectLanguage to act on a result.
  // Lower values react faster on short input; higher values reduce false flips.
  const MIN_CONFIDENCE = 40;

  // Minimum number of characters in the source box before attempting detection.
  const MIN_TEXT_LENGTH = 4;

  // ── Utilities ─────────────────────────────────────────────────────────────────
  function getOpposite(code) {
    return LANGUAGES.find((l) => l.code !== code) ?? null;
  }

  function textMatchesLang(text, lang) {
    const lower = (text ?? '').toLowerCase();
    return lang.names.some((n) => lower.includes(n.toLowerCase()));
  }

  function urlParams() {
    return new URLSearchParams(window.location.search);
  }

  // ── Target-language switching ─────────────────────────────────────────────────
  function getCurrentTargetLang() {
    const tl = urlParams().get('tl');
    return LANGUAGES.find((l) => l.code === tl) ?? null;
  }

  function setTargetLang(lang) {
    // 1. Click the appropriate tab in the TARGET tablist (second tablist).
    //    This is the most reliable method because it triggers GT's own event
    //    handlers and keeps the UI fully in sync.
    const tabLists = document.querySelectorAll('[role="tablist"]');
    if (tabLists.length >= 2) {
      const tgtTabs = tabLists[1].querySelectorAll('[role="tab"]');
      for (const tab of tgtTabs) {
        const label = (tab.getAttribute('aria-label') ?? '') + ' ' + (tab.textContent ?? '');
        if (textMatchesLang(label, lang)) {
          if (tab.getAttribute('aria-selected') !== 'true') {
            tab.click();
            console.log('[GT Flip] Clicked target tab:', lang.code);
          }
          return;
        }
      }
    }

    // 2. Fallback: update the `tl` URL parameter.
    const params = urlParams();
    if (params.get('tl') === lang.code) return;
    params.set('tl', lang.code);
    window.history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
    console.log('[GT Flip] Updated URL tl →', lang.code);
  }

  // ── Language detection & flip ─────────────────────────────────────────────────
  let lastSourceCode = null;
  let isSwitching = false;
  let debounceTimer = null;

  function handleDetected({ languages } = {}) {
    if (isSwitching || !languages?.length) return;

    // Pick the highest-confidence result that belongs to our configured pair.
    for (const { language, percentage } of languages) {
      if (percentage < MIN_CONFIDENCE) continue;
      const src = LANGUAGES.find((l) => l.code === language);
      if (!src) continue;

      if (src.code === lastSourceCode) return; // no change, nothing to do

      const target = getOpposite(src.code);
      if (!target) return;

      const currentTarget = getCurrentTargetLang();
      if (currentTarget?.code === target.code) {
        lastSourceCode = src.code; // already correct, just sync bookkeeping
        return;
      }

      console.log(`[GT Flip] detected ${src.code} (${percentage}%) → switching target to ${target.code}`);
      isSwitching = true;
      setTargetLang(target);
      lastSourceCode = src.code;
      // Release the guard after GT's own event handlers have settled.
      setTimeout(() => { isSwitching = false; }, 1500);
      return; // act only on the first (highest-confidence) match
    }
  }

  function scheduleDetection(text) {
    clearTimeout(debounceTimer);

    if (text.length === 0) {
      // Input was cleared — reset so the next typing session starts fresh.
      lastSourceCode = null;
      return;
    }

    if (text.length < MIN_TEXT_LENGTH) return;

    debounceTimer = setTimeout(() => {
      chrome.i18n.detectLanguage(text, handleDetected);
    }, 500);
  }

  // ── Source textarea discovery & attachment ────────────────────────────────────
  console.log('[GT Flip] content script loaded');
  //
  // Google Translate is a SPA — the <textarea> may not exist when the content
  // script first runs.  We use a MutationObserver to spot it as soon as it
  // appears, then attach a single 'input' listener.

  let attachedEl = null;

  function onInput(e) {
    scheduleDetection((e.target.value ?? '').trim());
  }

  function tryAttach() {
    // If the element we already attached to is still in the DOM, do nothing.
    if (attachedEl && document.contains(attachedEl)) return;

    // Google Translate's source box is the only <textarea> on the page.
    const el = document.querySelector('textarea');
    if (!el || el === attachedEl) return;

    if (attachedEl) attachedEl.removeEventListener('input', onInput);
    attachedEl = el;
    attachedEl.addEventListener('input', onInput);
    console.log('[GT Flip] Attached to source textarea');

    // If the textarea already contains text (e.g. loaded from URL), detect now.
    const existing = attachedEl.value.trim();
    if (existing.length >= MIN_TEXT_LENGTH) {
      chrome.i18n.detectLanguage(existing, handleDetected);
    }
  }

  // Watch for DOM changes so we re-attach after SPA navigations.
  const observer = new MutationObserver(tryAttach);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Also attempt immediately in case the textarea is already in the DOM.
  setTimeout(tryAttach, 1000);
})();
