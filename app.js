(() => {
  const config = window.DIARIO_NEGRO_CONFIG;
  const sdk = window.supabase;

  const loginDialog = document.getElementById('loginDialog');
  const registerDialog = document.getElementById('registerDialog');
  const accountDialog = document.getElementById('accountDialog');

  const loginForm = document.getElementById('loginForm');
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  const loginError = document.getElementById('loginError');
  const loginSubmit = document.getElementById('loginSubmit');

  const registerForm = document.getElementById('registerForm');
  const registerText = document.getElementById('registerText');
  const registerError = document.getElementById('registerError');
  const cancelRegister = document.getElementById('cancelRegister');

  const accountButton = document.getElementById('accountButton');
  const accountEmail = document.getElementById('accountEmail');
  const logoutButton = document.getElementById('logoutButton');
  const closeAccount = document.getElementById('closeAccount');

  const realNotes = document.getElementById('realNotes');
  const todayLabel = document.getElementById('todayLabel');
  const greetingTitle = document.getElementById('greetingTitle');
  const toast = document.getElementById('toast');

  let client = null;
  let session = null;
  let toastTimer = null;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function showError(el, message) {
    el.textContent = message || 'Ocorreu um erro.';
    el.hidden = false;
  }

  function clearError(el) {
    el.textContent = '';
    el.hidden = true;
  }

  function updateDateAndGreeting() {
    const now = new Date();
    const label = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short'
    }).format(now).replaceAll('.', '').toUpperCase();
    todayLabel.textContent = label;

    const hour = now.getHours();
    greetingTitle.textContent =
      hour < 12 ? 'Bom dia!' :
      hour < 18 ? 'Boa tarde!' :
      'Boa noite!';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatRecordDate(iso) {
    const d = new Date(iso);
    const time = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);

    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();

    if (sameDay) return `Hoje · ${time}`;

    const day = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short',
      day: '2-digit'
    }).format(d).replace('.', '');

    return `${day} · ${time}`;
  }

  function renderRecords(records) {
    if (!records?.length) {
      realNotes.innerHTML = `
        <article class="note-card note-blue empty-note">
          <div class="note-meta">Supabase conectado</div>
          <p>Ainda não há registros reais. Use “Registrar” para fazer o primeiro teste.</p>
        </article>`;
      return;
    }

    const classes = ['note-peach', 'note-blue', 'note-lilac'];
    realNotes.innerHTML = records.slice(0, 6).map((row, index) => `
      <article class="note-card ${classes[index % classes.length]}">
        <div class="note-meta">${escapeHtml(formatRecordDate(row.registrado_em))}<span>•••</span></div>
        <p>${escapeHtml(row.texto_original)}</p>
      </article>
    `).join('');
  }

  async function loadRecords() {
    if (!session) return;

    const { data, error } = await client
      .from('registros')
      .select('id, registrado_em, texto_original')
      .order('registrado_em', { ascending: false })
      .limit(6);

    if (error) {
      realNotes.innerHTML = `
        <article class="note-card note-peach empty-note">
          <div class="note-meta">Erro ao carregar</div>
          <p>${escapeHtml(error.message)}</p>
        </article>`;
      return;
    }

    renderRecords(data);
  }

  function openLogin() {
    if (!loginDialog.open) loginDialog.showModal();
  }

  function closeLogin() {
    if (loginDialog.open) loginDialog.close();
  }

  async function refreshSession() {
    const { data: { session: currentSession } } = await client.auth.getSession();
    session = currentSession;

    if (!session) {
      openLogin();
      return;
    }

    closeLogin();
    accountEmail.textContent = session.user?.email || 'Conta conectada';
    await loadRecords();
  }

  async function init() {
    updateDateAndGreeting();

    if (!config?.supabaseUrl || !config?.supabasePublishableKey || !sdk?.createClient) {
      realNotes.innerHTML = `
        <article class="note-card note-peach empty-note">
          <div class="note-meta">Configuração incompleta</div>
          <p>Não foi possível iniciar a conexão com o Supabase.</p>
        </article>`;
      return;
    }

    client = sdk.createClient(
      config.supabaseUrl,
      config.supabasePublishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      }
    );

    client.auth.onAuthStateChange((_event, newSession) => {
      session = newSession;
      if (session) {
        closeLogin();
        accountEmail.textContent = session.user?.email || 'Conta conectada';
        setTimeout(loadRecords, 0);
      }
    });

    await refreshSession();

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && session) loadRecords();
    });
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(loginError);
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Entrando…';

    const { data, error } = await client.auth.signInWithPassword({
      email: loginEmail.value.trim(),
      password: loginPassword.value
    });

    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Entrar';

    if (error) {
      showError(loginError, 'Não consegui entrar. Confira e-mail e senha.');
      return;
    }

    session = data.session;
    loginPassword.value = '';
    closeLogin();
    showToast('Conectado ao Supabase');
    await loadRecords();
  });

  document.querySelectorAll('[data-demo="register"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!session) {
        openLogin();
        return;
      }
      clearError(registerError);
      registerText.value = '';
      registerDialog.showModal();
      setTimeout(() => registerText.focus(), 120);
    });
  });

  cancelRegister.addEventListener('click', () => registerDialog.close());

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(registerError);

    const text = registerText.value.trim();
    if (!text) return;

    const now = new Date();
    const payload = {
      id: crypto.randomUUID(),
      schema_version: 2,
      registrado_em: now.toISOString(),
      fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      texto_original: text,
      origem: 'pwa',
      entrada: 'texto',
      versao_cliente: 'pwa-0.2'
    };

    const { error } = await client.from('registros').insert(payload);

    if (error) {
      showError(registerError, error.message);
      return;
    }

    registerDialog.close();
    showToast('Registro salvo');
    await loadRecords();
  });

  accountButton.addEventListener('click', () => {
    if (!session) {
      openLogin();
      return;
    }
    accountDialog.showModal();
  });

  closeAccount.addEventListener('click', () => accountDialog.close());

  logoutButton.addEventListener('click', async () => {
    await client.auth.signOut();
    session = null;
    accountDialog.close();
    renderRecords([]);
    openLogin();
  });

  init();
})();
