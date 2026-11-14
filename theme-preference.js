/* Preferência visual independente dos dados pessoais e da sessão de autenticação.
 * Aplicado no <head> antes dos CSS para evitar flash de tema incorreto.
 */
(() => {
  'use strict';
  const KEY = 'copiloto-theme-preference-v1';
  const CHOICES = new Set(['light', 'dark', 'auto']);
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  let preference = 'auto';
  try {
    const stored = window.localStorage.getItem(KEY);
    if (CHOICES.has(stored)) preference = stored;
  } catch (_) {
    // Safari em navegação privada pode impedir armazenamento.
  }
  const resolve = () => preference === 'auto' ? (media?.matches ? 'dark' : 'light') : preference;
  const render = () => {
    const effective = resolve();
    document.documentElement.setAttribute('data-theme', effective);
    document.documentElement.setAttribute('data-theme-preference', preference);
    document.documentElement.style.colorScheme = effective;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = effective === 'dark' ? '#11151f' : '#f7f6f2';
    document.querySelectorAll('input[name="copilotoTheme"]').forEach(input => {
      input.checked = input.value === preference;
    });
    const description = document.getElementById('copilotoThemeDescription');
    if (description) description.textContent =
      preference === 'auto' ? 'Segue a aparência definida no iPhone.' :
      preference === 'dark' ? 'Aparência escura ativada.' : 'Aparência clara ativada.';
  };
  const setPreference = (value, save = true) => {
    if (!CHOICES.has(value)) return;
    preference = value;
    if (save) {
      try { window.localStorage.setItem(KEY, value); } catch (_) {}
    }
    render();
  };
  media?.addEventListener?.('change', () => { if (preference === 'auto') render(); });
  window.addEventListener('storage', e => {
    if (e.key === KEY) setPreference(CHOICES.has(e.newValue) ? e.newValue : 'auto', false);
  });
  document.addEventListener('change', e => {
    if (e.target?.matches?.('input[name="copilotoTheme"]')) setPreference(e.target.value);
  });
  document.addEventListener('DOMContentLoaded', render, { once: true });
  window.COPILOTO_THEME = Object.freeze({
    getPreference: () => preference,
    getEffectiveTheme: resolve,
    setPreference
  });
  render();
})();