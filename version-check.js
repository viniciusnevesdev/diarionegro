(() => {
  const $ = (id) => document.getElementById(id);

  const loadedVersion =
    document.querySelector('meta[name="dn-version"]')?.content || '?';

  const loadedBuild =
    document.querySelector('meta[name="dn-build"]')?.content || '';

  let publishedBuild = '';

  function symbol(el, name) {
    if (!el) return;

    el.setAttribute('data-dn-symbol', name);
    el.innerHTML = '';

    window.DN_SYMBOLS?.hydrate(el.parentElement || document);
  }

  function render(state, version = '?') {
    const pendant = $('dnVersionPendant');
    const pendantIcon = $('dnVersionPendantIcon');
    const panelIcon = $('dnVersionPanelIcon');
    const stateText = $('dnVersionStateText');
    const open = $('dnVersionOpen');
    const published = $('dnVersionPublished');
    const update = $('dnVersionUpdate');

    if (open) {
      open.textContent = `v${loadedVersion}`;
    }

    if (published) {
      published.textContent =
        version === '?' ? 'Não verificada' : `v${version}`;
    }

    if (pendant) {
      pendant.dataset.state = state;
    }

    if (update) {
      update.hidden = state !== 'stale';
    }

    if (state === 'current') {
      symbol(pendantIcon, 'checkmark.circle.fill');
      symbol(panelIcon, 'checkmark.circle.fill');

      if (stateText) {
        stateText.textContent =
          'Você está vendo a versão atual.';
      }

    } else if (state === 'stale') {
      symbol(pendantIcon, 'exclamationmark.circle.fill');
      symbol(panelIcon, 'exclamationmark.circle.fill');

      if (stateText) {
        stateText.textContent =
          'Esta é uma versão antiga em cache.';
      }

    } else {
      symbol(pendantIcon, 'arrow.trianglehead.clockwise');
      symbol(panelIcon, 'arrow.trianglehead.clockwise');

      if (stateText) {
        stateText.textContent =
          'Não foi possível verificar agora.';
      }
    }
  }

  async function checkVersion() {
    try {
      const probe = new URL(location.href);

      probe.hash = '';
      probe.search = '';
      probe.searchParams.set('_dn_version_probe', Date.now());

      const response = await fetch(probe.toString(), {
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const remote =
        new DOMParser().parseFromString(html, 'text/html');

      const remoteVersion =
        remote.querySelector('meta[name="dn-version"]')?.content;

      const remoteBuild =
        remote.querySelector('meta[name="dn-build"]')?.content;

      if (!remoteVersion || !remoteBuild) {
        throw new Error('Metadados de versão ausentes.');
      }

      publishedBuild = remoteBuild;

      render(
        remoteBuild === loadedBuild ? 'current' : 'stale',
        remoteVersion
      );

    } catch (error) {
      console.warn('DN version check:', error);
      render('error');
    }
  }

  function forceUpdate() {
    if (!publishedBuild) return;

    const url = new URL(location.href);

    url.searchParams.set('_dn_build', publishedBuild);
    url.searchParams.set('_dn_reload', Date.now());

    location.replace(url.toString());
  }

  $('dnVersionUpdate')?.addEventListener(
    'click',
    forceUpdate
  );

  $('dnVersionPendant')?.addEventListener('click', () => {
    $('accountButton')?.click();

    setTimeout(() => {
      $('dnVersionPanel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }, 180);
  });

  window.DN_VERSION_CHECK = checkVersion;

  checkVersion();
})();
