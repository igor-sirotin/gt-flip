/**
 * GT Flip – content script
 *
 * Monitors Google Translate for the currently detected / selected source
 * language and automatically switches the target language to its pair.
 *
 * MVP: hardcoded English ↔ Russian pair.
 * To change the pair, edit the LANGUAGES array below.
 */
(function () {
  'use strict';

  // ── Configuration ────────────────────────────────────────────────────────────
  // Each entry needs:
  //   code  – BCP-47 language code used by Google Translate in the URL (sl=/tl=)
  //   names – display names as they appear in the GT UI (checked case-insensitively)
  const LANGUAGES = [
    { code: 'en', names: ['English'] },
    { code: 'ru', names: ['Russian', 'Русский'] },
  ];

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

  // ── Source-language detection ─────────────────────────────────────────────────
  //
  // Google Translate uses role="tablist" / role="tab" for the language selector
  // strips at the top.  The SOURCE strip is the first tablist; the TARGET strip
  // is the second.  When "Detect language" is active the tab that was selected
  // by the user has aria-selected="true" and its label contains the detected
  // language name (e.g. "Russian - Detected" or just "Russian").
  //
  // As a faster first check we also look at the `sl` URL parameter, which GT
  // sets to the actual language code when the user manually selects one.

  function detectSourceLang() {
    // 1. URL `sl` parameter (set when user explicitly picks a source language)
    const sl = urlParams().get('sl');
    if (sl && sl !== 'auto') {
      const found = LANGUAGES.find((l) => l.code === sl);
      if (found) return found;
    }

    // 2. Source tablist only (always the FIRST [role="tablist"] on the page).
    //
    //    We intentionally do NOT do a broad document-wide tab scan — that would
    //    pick up the TARGET tablist too, causing an infinite flip loop.
    //
    //    When "Detect language" is active and GT has auto-detected a language,
    //    it updates the selected tab's aria-label to something like
    //    "Russian – Detected".  We therefore check for a language name match
    //    FIRST, before deciding to skip the tab.  A tab whose label contains
    //    only "Detect language" (no language name) will simply match nothing
    //    and we return null — meaning "not yet detected, do nothing".
    const tabLists = document.querySelectorAll('[role="tablist"]');
    if (tabLists.length > 0) {
      const srcTabs = tabLists[0].querySelectorAll('[role="tab"]');
      for (const tab of srcTabs) {
        if (tab.getAttribute('aria-selected') !== 'true') continue;
        const label = (tab.getAttribute('aria-label') ?? '') + ' ' + (tab.textContent ?? '');
        for (const lang of LANGUAGES) {
          if (textMatchesLang(label, lang)) return lang;
        }
      }
    }

    return null;
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
            console.debug('[GT Flip] Clicked target tab:', lang.code);
          }
          return;
        }
      }
    }

    // 2. Fallback: update the `tl` URL parameter.
    //    Useful when the desired language is not currently shown in the quick
    //    tabs (e.g. user has never used it before).  GT reads the URL on mount,
    //    so a replaceState update takes effect after the next user interaction
    //    or soft navigation.
    const params = urlParams();
    if (params.get('tl') === lang.code) return;
    params.set('tl', lang.code);
    window.history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
    console.debug('[GT Flip] Updated URL tl →', lang.code);
  }

  // ── Core flip logic ───────────────────────────────────────────────────────────
  let lastSourceCode = null;
  let isSwitching = false; // prevents re-entry while our own click/replaceState mutates the DOM

  function checkAndFlip() {
    if (isSwitching) return;

    const src = detectSourceLang();
    if (!src) return;
    if (src.code === lastSourceCode) return; // nothing changed

    const target = getOpposite(src.code);
    if (!target) return;

    const currentTarget = getCurrentTargetLang();
    if (currentTarget?.code === target.code) {
      // Target is already correct – just update our bookkeeping.
      lastSourceCode = src.code;
      return;
    }

    console.debug(`[GT Flip] source: ${src.code} → target: ${target.code}`);
    isSwitching = true;
    setTargetLang(target);
    lastSourceCode = src.code;
    // Release the guard after GT's event handlers have had time to settle.
    setTimeout(() => { isSwitching = false; }, 1500);
  }

  // ── Observers & polling ───────────────────────────────────────────────────────
  let debounceTimer = null;

  function schedule() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkAndFlip, 600);
  }

  // Watch DOM mutations (language tab changes, re-renders after typing, etc.)
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-selected', 'aria-label', 'class'],
    characterData: true,
  });

  // Watch for SPA navigations that change the URL without a full page load
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      schedule();
    }
  }, 500);

  // Run once after the page has settled to handle the initial load state
  setTimeout(checkAndFlip, 1500);
})();
