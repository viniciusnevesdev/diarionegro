// DN_FEATURES_V05
(() => {
  const config = window.DIARIO_NEGRO_CONFIG;
  const sdk = window.supabase;

  const NOTE_INPUTS = ['texto', 'ditado', 'audio_ia'];
  const RECORD_STATE_INPUTS = ['registro_excluido', 'registro_restaurado']; // DN_FEATURES_V071_SOFT_DELETE
  const APP_EVENT_TYPES = [
    'tarefa_criada', 'tarefa_editada', 'tarefa_iniciada', 'tarefa_concluida', 'tarefa_excluida',
    'habito_criado', 'habito_editado', 'habito_reiniciado', 'habito_excluido'
  ];
  const TIMELINE_PAGE_SIZE = 20;

  const loginDialog = document.getElementById('loginDialog');
  const registerDialog = document.getElementById('registerDialog');
  let accountDialog = document.getElementById('accountDialog');

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
  let accountEmail = document.getElementById('accountEmail');
  let logoutButton = document.getElementById('logoutButton');
  let closeAccount = document.getElementById('closeAccount');

  const realNotes = document.getElementById('realNotes');
  const homeView = document.getElementById('homeView');
  const timelineView = document.getElementById('timelineView');
  const timelineList = document.getElementById('timelineList');
  const timelineStatus = document.getElementById('timelineStatus');
  const timelineLoader = document.getElementById('timelineLoader');
  const homeNavButton = document.getElementById('homeNavButton');
  const timelineNavButton = document.getElementById('timelineNavButton');
  const openTimelineFromNotes = document.getElementById('openTimelineFromNotes');
  const timelineRefresh = document.getElementById('timelineRefresh');

  const habitGrid = document.getElementById('habitGrid');
  const openHabitsManager = document.getElementById('openHabitsManager');
  const habitsManagerDialog = document.getElementById('habitsManagerDialog');
  const habitsManagerList = document.getElementById('habitsManagerList');
  const addHabitFromManager = document.getElementById('addHabitFromManager');
  const closeHabitsManager = document.getElementById('closeHabitsManager');
  const habitFormDialog = document.getElementById('habitFormDialog');
  const habitForm = document.getElementById('habitForm');
  const habitFormTitle = document.getElementById('habitFormTitle');
  const habitId = document.getElementById('habitId');
  const habitTitle = document.getElementById('habitTitle');
  const habitMode = document.getElementById('habitMode');
  const habitUnit = document.getElementById('habitUnit');
  const habitStartedAt = document.getElementById('habitStartedAt');
  const habitSize = document.getElementById('habitSize');
  const habitColor = document.getElementById('habitColor');
  const habitFormError = document.getElementById('habitFormError');
  const cancelHabitForm = document.getElementById('cancelHabitForm');
  const habitDetailDialog = document.getElementById('habitDetailDialog');
  const habitDetailContent = document.getElementById('habitDetailContent');
  const editHabitButton = document.getElementById('editHabitButton');
  const failHabitButton = document.getElementById('failHabitButton');
  const deleteHabitButton = document.getElementById('deleteHabitButton');
  const closeHabitDetail = document.getElementById('closeHabitDetail');

  const taskList = document.getElementById('taskList');
  const openTasksManager = document.getElementById('openTasksManager');
  const addTaskButton = document.getElementById('addTaskButton');
  const tasksManagerDialog = document.getElementById('tasksManagerDialog');
  const tasksManagerList = document.getElementById('tasksManagerList');
  const addTaskFromManager = document.getElementById('addTaskFromManager');
  const closeTasksManager = document.getElementById('closeTasksManager');
  const taskFormDialog = document.getElementById('taskFormDialog');
  const taskForm = document.getElementById('taskForm');
  const taskFormTitle = document.getElementById('taskFormTitle');
  const taskId = document.getElementById('taskId');
  const taskTitle = document.getElementById('taskTitle');
  const taskFormError = document.getElementById('taskFormError');
  const cancelTaskForm = document.getElementById('cancelTaskForm');
  const taskDetailDialog = document.getElementById('taskDetailDialog');
  const taskDetailContent = document.getElementById('taskDetailContent');
  const editTaskButton = document.getElementById('editTaskButton');
  const changeTaskIconButton = document.getElementById('changeTaskIconButton');
  const taskIconDialog = document.getElementById('taskIconDialog');
  const taskIconGrid = document.getElementById('taskIconGrid');
  const closeTaskIconPicker = document.getElementById('closeTaskIconPicker');
  const startTaskButton = document.getElementById('startTaskButton');
  const completeTaskButton = document.getElementById('completeTaskButton');
  const deleteTaskButton = document.getElementById('deleteTaskButton');
  const closeTaskDetail = document.getElementById('closeTaskDetail');

  const todayLabel = document.getElementById('todayLabel');
  const greetingTitle = document.getElementById('greetingTitle');
  const toast = document.getElementById('toast');

  let client = null;
  let session = null;
  let toastTimer = null;

  let timelineOldest = null;
  let timelineNewest = null;
  let timelineHasMore = true;
  let timelineLoadingOlder = false;
  let timelineInitialLoaded = false;
  let timelineObserver = null;
  const timelineSeenIds = new Set();
  let deletedRecordIds = new Set();

  let habits = [];
  let habitFailures = new Map();
  let tasks = [];
  let taskHistoryIds = new Set();
  let selectedHabitId = null;
  let selectedTaskId = null;

  function ensureAccountDialog() {
    if (accountDialog && accountEmail && logoutButton && closeAccount) return;
    document.getElementById('accountDialog')?.remove();
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="accountDialog" class="demo-dialog auth-account-dialog">
        <div class="demo-sheet account-sheet">
          <div class="sheet-handle" aria-hidden="true"></div>
          <h2>Conta</h2>
          <p class="sheet-copy" id="accountEmail">Conta conectada</p>
          <button type="button" class="secondary-btn sheet-button" id="logoutButton">Sair da conta</button>
          <button type="button" class="primary-btn sheet-button" id="closeAccount">Fechar</button>
        </div>
      </dialog>`);
    accountDialog = document.getElementById('accountDialog');
    accountEmail = document.getElementById('accountEmail');
    logoutButton = document.getElementById('logoutButton');
    closeAccount = document.getElementById('closeAccount');
  }

  ensureAccountDialog();

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

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function dnIcon(name, className = '') {
    const api = window.DN_SYMBOLS;
    return api?.icon ? api.icon(name, className) : '';
  }

  function updateDateAndGreeting() {
    const now = new Date();
    const label = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short', day: '2-digit', month: 'short'
    }).format(now).replaceAll('.', '').toUpperCase();
    todayLabel.textContent = label;

    const hour = now.getHours();
    const hourDecimal = hour + (now.getMinutes() / 60);
    let title = 'Boa noite!';
    let phase = 'night';
    let iconName = 'moon.fill';

    if (hour < 6) {
      title = 'Boa madrugada!';
      phase = 'dawn';
    } else if (hourDecimal < 9.5) {
      title = 'Boa manhã!';
      phase = 'morning';
      iconName = 'sun.max.fill';
    } else if (hourDecimal < 12) {
      title = 'Bom dia!';
      phase = 'day';
      iconName = 'sun.max.fill';
    } else if (hourDecimal < 18) {
      title = 'Boa tarde!';
      phase = 'afternoon';
      iconName = 'sun.max.fill';
    }

    greetingTitle.textContent = title;
    const card = document.getElementById('greetingCard');
    const chip = document.getElementById('dayPhaseChip');
    const iconHost = document.getElementById('dayPhaseIcon');
    if (card) card.dataset.phase = phase;
    if (chip) chip.dataset.phase = phase;
    if (iconHost) iconHost.innerHTML = dnIcon(iconName, 'dn-day-phase-symbol');
  }

  function pad(value, size = 2) {
    return String(value).padStart(size, '0');
  }

  function generateRecordId(date = new Date()) {
    const stamp =
      date.getFullYear() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      'T' +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds()) +
      pad(date.getMilliseconds(), 3);
    const random = Math.floor(100000 + Math.random() * 900000);
    return `dn-${stamp}-${random}`;
  }

  function formatRecordDate(iso) {
    const d = new Date(iso);
    const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return `Hoje · ${time}`;
    const day = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit' })
      .format(d).replace('.', '');
    return `${day} · ${time}`;
  }

  function formatTimelineDate(iso) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d);
    if (d.toDateString() === today.toDateString()) return `Hoje · ${time}`;
    if (d.toDateString() === yesterday.toDateString()) return `Ontem · ${time}`;
    const date = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short', day: '2-digit', month: 'short',
      year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric'
    }).format(d).replaceAll('.', '');
    return `${date} · ${time}`;
  }

  function localDateTimeValue(iso = new Date().toISOString()) {
    const d = new Date(iso);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function parseEventPayload(text) {
    try {
      const value = JSON.parse(text);
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  async function refreshRecordDeletionState() {
    if (!session) return;

    const { data, error } = await client
      .from('registros')
      .select('id, registrado_em, texto_original, entrada')
      .in('entrada', RECORD_STATE_INPUTS)
      .order('registrado_em', { ascending: true })
      .limit(1000);

    if (error) {
      console.warn('Não foi possível atualizar o estado da lixeira:', error);
      return;
    }

    const next = new Set();
    for (const row of data || []) {
      const payload = parseEventPayload(row.texto_original);
      const recordId = String(payload?.record_id || '').trim();
      if (!recordId) continue;
      if (row.entrada === 'registro_excluido') next.add(recordId);
      if (row.entrada === 'registro_restaurado') next.delete(recordId);
    }
    deletedRecordIds = next;
  }

  function visibleRecordRows(rows) {
    return (rows || []).filter((row) => !deletedRecordIds.has(String(row.id)));
  }

  async function insertStructuredEvent(type, payload) {
    if (!session) throw new Error('Sessão não disponível.');
    const now = new Date();
    const row = {
      id: generateRecordId(now),
      schema_version: 2,
      registrado_em: now.toISOString(),
      texto_original: JSON.stringify(payload),
      origem: 'pwa',
      entrada: type,
      versao_cliente: 'pwa-0.5'
    };
    const { error } = await client.from('registros').insert(row);
    if (error) throw error;
    return row;
  }

  // DN_FEATURES_V072_AI_TASK_SYNC
  window.DN_APP_API = window.DN_APP_API || {};

  window.DN_APP_API.recordEvent = insertStructuredEvent;
  window.DN_APP_API.getClient = () => client;
  window.DN_APP_API.getSession = () => session;
  window.DN_APP_API.recordNote = async (textValue, inputType = 'texto') => {
    if (!session) throw new Error('Sessão não disponível.');
    const text = String(textValue || '').trim();
    if (!text) return null;
    const now = new Date();
    const row = {
      id: generateRecordId(now), schema_version: 2, registrado_em: now.toISOString(),
      texto_original: text, origem: 'pwa', entrada: NOTE_INPUTS.includes(inputType) ? inputType : 'texto',
      versao_cliente: 'pwa-0.8'
    };
    const { error } = await client.from('registros').insert(row);
    if (error) throw error;
    await loadRecords();
    return row;
  };
  window.DN_APP_API.getTasks = () => tasks.map((item) => ({ ...item }));
  window.DN_APP_API.reloadState = loadAppState;

  window.DN_APP_API.createTaskFromAI = async ({
    sourceRecordId, taskKey, title, priority = 5, priorityReason = '', area = '',
    due = '', effort = 'media', durationMin = null, confidence = null
  } = {}) => {
    if (!session) throw new Error('Sessão não disponível.');

    const sourceId = String(sourceRecordId || '').trim();
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) throw new Error('A IA não forneceu texto suficiente para criar a tarefa.');

    const safeSource = sourceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(-70);
    const safeKey = String(taskKey || cleanTitle).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const id = safeSource
      ? `tk-ai-${safeSource}-${safeKey || 'acao'}`
      : generateRecordId(new Date()).replace('dn-', 'tk-ai-');

    if (taskHistoryIds.has(id)) {
      const existing = tasks.find((item) => item.id === id) || null;
      return { created: false, exists: Boolean(existing), deleted: !existing, task: existing };
    }

    await insertStructuredEvent('tarefa_criada', {
      task_id: id, title: cleanTitle, created_at: new Date().toISOString(),
      source: 'ia', source_record_id: sourceId || null,
      priority: Math.max(0, Math.min(10, Number(priority) || 0)),
      priority_reason: String(priorityReason || ''), area: String(area || ''),
      icon_name: semanticTaskIcon(cleanTitle, area),
      due: String(due || ''), effort: String(effort || 'media'),
      duration_min: durationMin == null ? null : Number(durationMin),
      confidence: confidence == null ? null : Number(confidence)
    });
    await loadAppState();
    return { created: true, exists: true, deleted: false, task: tasks.find((item) => item.id === id) || null };
  };

  window.DN_APP_API.editTask = async (taskIdValue, patch = {}) => {
    const id = String(taskIdValue || '');
    if (!id) throw new Error('Tarefa inválida.');
    await insertStructuredEvent('tarefa_editada', { task_id: id, ...patch });
    await loadAppState();
    return tasks.find((item) => item.id === id) || null;
  };

  window.DN_APP_API.deleteTask = async (taskIdValue) => {
    const id = String(taskIdValue || '');
    if (!id) return;
    await insertStructuredEvent('tarefa_excluida', { task_id: id, deleted_at: new Date().toISOString() });
    await loadAppState();
  };

  window.DN_APP_API.startTask = async (taskIdValue) => {
    const id = String(taskIdValue || '');
    await insertStructuredEvent('tarefa_iniciada', { task_id: id, started_at: new Date().toISOString() });
    await loadAppState();
  };

  window.DN_APP_API.completeTask = async (taskIdValue) => {
    const id = String(taskIdValue || '');
    await insertStructuredEvent('tarefa_concluida', { task_id: id, completed_at: new Date().toISOString() });
    await loadAppState();
  };

  // ---------- LINHA DO TEMPO ----------

  function timelineClassFor(id) {
    const value = String(id || '0').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return ['note-peach', 'note-blue', 'note-lilac', 'note-mint', 'note-sunset', 'note-aqua'][value % 6];
  }

  function timelineCardHtml(row) {
    return `
      <article class="note-card timeline-card ${timelineClassFor(row.id)}" data-record-id="${escapeHtml(row.id)}">
        <div class="note-meta">
          <span>${escapeHtml(formatTimelineDate(row.registrado_em))}</span>
          <span class="timeline-origin">${escapeHtml(row.origem === 'atalho' ? 'ATALHO' : 'PWA')}</span>
        </div>
        <p>${escapeHtml(row.texto_original)}</p>
      </article>`;
  }

  function scrollTimelineToBottom() {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
  }

  function setTimelineLoader(loading, text = 'Carregando anteriores…') {
    timelineLoader.classList.toggle('is-loading', loading);
    const label = timelineLoader.querySelector('span:last-child');
    if (label) label.textContent = text;
  }

  function resetTimelineState() {
    timelineOldest = null;
    timelineNewest = null;
    timelineHasMore = true;
    timelineLoadingOlder = false;
    timelineInitialLoaded = false;
    timelineSeenIds.clear();
    timelineList.innerHTML = '';
    setTimelineLoader(false);
  }

  function rememberTimelineRows(rows) {
    rows.forEach((row) => timelineSeenIds.add(row.id));
  }

  function uniqueTimelineRows(rows) {
    return rows.filter((row) => !timelineSeenIds.has(row.id));
  }

  function showTimelineEmpty() {
    timelineStatus.textContent = '';
    timelineList.innerHTML = `
      <article class="note-card note-blue timeline-card timeline-empty">
        <div class="note-meta">Histórico</div>
        <p>Ainda não há registros para mostrar.</p>
      </article>`;
  }

  function configureTimelineObserver() {
    if (timelineObserver) timelineObserver.disconnect();
    timelineObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !timelineView.hidden) {
        loadOlderTimeline();
      }
    }, { root: null, rootMargin: '420px 0px 0px 0px', threshold: 0.01 });
    timelineObserver.observe(timelineLoader);
  }

  async function loadTimelineInitial(force = false) {
    if (!session || !timelineList) return;
    if (timelineInitialLoaded && !force) return;

    resetTimelineState();
    timelineStatus.textContent = 'Carregando registros…';
    await refreshRecordDeletionState();

    const { data, error } = await client
      .from('registros')
      .select('id, registrado_em, texto_original, origem, entrada')
      .in('entrada', NOTE_INPUTS)
      .order('registrado_em', { ascending: false })
      .limit(TIMELINE_PAGE_SIZE);

    if (error) {
      timelineStatus.textContent = 'Não foi possível carregar';
      timelineList.innerHTML = `
        <article class="note-card note-peach timeline-card">
          <div class="note-meta">Erro ao carregar</div>
          <p>${escapeHtml(error.message)}</p>
        </article>`;
      return;
    }

    if (!data?.length) {
      timelineInitialLoaded = true;
      timelineHasMore = false;
      showTimelineEmpty();
      return;
    }

    const rawRows = [...data].reverse();
    const rows = visibleRecordRows(rawRows);
    rememberTimelineRows(rows);
    timelineOldest = rawRows[0].registrado_em;
    timelineNewest = rawRows[rawRows.length - 1].registrado_em;
    timelineList.innerHTML = rows.map(timelineCardHtml).join('');
    timelineInitialLoaded = true;
    timelineHasMore = data.length === TIMELINE_PAGE_SIZE;
    timelineStatus.textContent = '';
    if (!rows.length) showTimelineEmpty();
    configureTimelineObserver();
    requestAnimationFrame(scrollTimelineToBottom);
  }

  async function loadOlderTimeline() {
    if (!session || !timelineInitialLoaded || !timelineHasMore || timelineLoadingOlder || !timelineOldest) return;

    timelineLoadingOlder = true;
    setTimelineLoader(true);

    const beforeHeight = document.documentElement.scrollHeight;
    const beforeY = window.scrollY;

    const { data, error } = await client
      .from('registros')
      .select('id, registrado_em, texto_original, origem, entrada')
      .in('entrada', NOTE_INPUTS)
      .lt('registrado_em', timelineOldest)
      .order('registrado_em', { ascending: false })
      .limit(TIMELINE_PAGE_SIZE);

    if (error) {
      setTimelineLoader(false);
      timelineStatus.textContent = 'Não foi possível carregar registros anteriores';
      timelineLoadingOlder = false;
      return;
    }

    if (!data?.length) {
      timelineHasMore = false;
      setTimelineLoader(false);
      timelineStatus.textContent = 'Você chegou ao início do histórico.';
      timelineLoadingOlder = false;
      return;
    }

    const rawRows = [...data].reverse();
    timelineOldest = rawRows[0].registrado_em;
    const rows = uniqueTimelineRows(visibleRecordRows(rawRows));
    if (rows.length) {
      timelineList.querySelector('.timeline-empty')?.remove();
      rememberTimelineRows(rows);
      timelineList.insertAdjacentHTML('afterbegin', rows.map(timelineCardHtml).join(''));
      requestAnimationFrame(() => {
        const afterHeight = document.documentElement.scrollHeight;
        window.scrollTo({ top: beforeY + (afterHeight - beforeHeight), behavior: 'auto' });
      });
    }

    timelineHasMore = data.length === TIMELINE_PAGE_SIZE;
    setTimelineLoader(false);
    timelineStatus.textContent = timelineHasMore ? '' : 'Você chegou ao início do histórico.';
    timelineLoadingOlder = false;
  }

  async function refreshTimelineNew({ scrollToPresent = false } = {}) {
    if (!session) return;
    if (!timelineInitialLoaded || !timelineNewest) {
      await loadTimelineInitial();
      return;
    }

    const { data, error } = await client
      .from('registros')
      .select('id, registrado_em, texto_original, origem, entrada')
      .in('entrada', NOTE_INPUTS)
      .gt('registrado_em', timelineNewest)
      .order('registrado_em', { ascending: true })
      .limit(100);

    if (error || !data?.length) {
      if (scrollToPresent) requestAnimationFrame(scrollTimelineToBottom);
      return;
    }

    const rows = uniqueTimelineRows(data);
    if (rows.length) {
      rememberTimelineRows(rows);
      timelineNewest = rows[rows.length - 1].registrado_em;
      timelineList.insertAdjacentHTML('beforeend', rows.map(timelineCardHtml).join(''));
    }
    if (scrollToPresent) requestAnimationFrame(scrollTimelineToBottom);
  }

  function showPage(page) {
    const timelineOpen = page === 'timeline';
    homeView.hidden = timelineOpen;
    timelineView.hidden = !timelineOpen;
    homeNavButton.classList.toggle('active', !timelineOpen);
    timelineNavButton.classList.toggle('active', timelineOpen);

    if (timelineOpen) {
      if (!timelineInitialLoaded) loadTimelineInitial();
      else refreshTimelineNew({ scrollToPresent: true });
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  // ---------- ANOTAÇÕES DA HOME ----------

  function renderRecords(records) {
    if (!records?.length) {
      realNotes.innerHTML = `
        <article class="note-card note-blue empty-note">
          <div class="note-meta">Supabase conectado</div>
          <p>Ainda não há registros. Use “Adicionar” para criar o primeiro.</p>
        </article>`;
      return;
    }

    const classes = ['note-peach', 'note-blue', 'note-lilac', 'note-mint', 'note-sunset', 'note-aqua'];
    realNotes.innerHTML = records.slice(0, 6).map((row, index) => `
      <article class="note-card ${classes[index % classes.length]}">
        <div class="note-meta">${escapeHtml(formatRecordDate(row.registrado_em))}<span>•••</span></div>
        <p>${escapeHtml(row.texto_original)}</p>
      </article>`).join('');
  }

  async function loadRecords() {
    if (!session) return;
    await refreshRecordDeletionState();
    const { data, error } = await client
      .from('registros')
      .select('id, registrado_em, texto_original, entrada')
      .in('entrada', NOTE_INPUTS)
      .order('registrado_em', { ascending: false })
      .limit(30);

    if (error) {
      realNotes.innerHTML = `
        <article class="note-card note-peach empty-note">
          <div class="note-meta">Erro ao carregar</div>
          <p>${escapeHtml(error.message)}</p>
        </article>`;
      return;
    }
    renderRecords(visibleRecordRows(data).slice(0, 6));
  }

  // ---------- HÁBITOS & METAS ----------

  function rebuildAppState(rows) {
    const habitMap = new Map();
    const taskMap = new Map();
    const failureMap = new Map();

    rows.forEach((row) => {
      const payload = parseEventPayload(row.texto_original);
      if (!payload) return;

      if (row.entrada.startsWith('habito_')) {
        const id = payload.habit_id;
        if (!id) return;
        if (row.entrada === 'habito_criado') {
          habitMap.set(id, { ...payload, id, deleted: false, created_at: row.registrado_em });
        } else if (row.entrada === 'habito_editado') {
          const current = habitMap.get(id);
          if (current) habitMap.set(id, { ...current, ...payload, id });
        } else if (row.entrada === 'habito_reiniciado') {
          const current = habitMap.get(id);
          if (current) current.started_at = payload.new_started_at || row.registrado_em;
          if (!failureMap.has(id)) failureMap.set(id, []);
          failureMap.get(id).push({ ...payload, at: row.registrado_em });
        } else if (row.entrada === 'habito_excluido') {
          const current = habitMap.get(id);
          if (current) current.deleted = true;
        }
      }

      if (row.entrada.startsWith('tarefa_')) {
        const id = payload.task_id;
        if (!id) return;
        if (row.entrada === 'tarefa_criada') {
          taskMap.set(id, {
            ...payload, id, status: 'open', deleted: false,
            created_at: payload.created_at || row.registrado_em,
            started_at: null, completed_at: null
          });
        } else if (row.entrada === 'tarefa_editada') {
          const current = taskMap.get(id);
          if (current) Object.assign(current, payload);
        } else if (row.entrada === 'tarefa_iniciada') {
          const current = taskMap.get(id);
          if (current) {
            current.status = 'started';
            current.started_at = payload.started_at || row.registrado_em;
          }
        } else if (row.entrada === 'tarefa_concluida') {
          const current = taskMap.get(id);
          if (current) {
            current.status = 'done';
            current.completed_at = payload.completed_at || row.registrado_em;
          }
        } else if (row.entrada === 'tarefa_excluida') {
          const current = taskMap.get(id);
          if (current) current.deleted = true;
        }
      }
    });

    habits = [...habitMap.values()].filter((item) => !item.deleted)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    taskHistoryIds = new Set(taskMap.keys());
    tasks = [...taskMap.values()].filter((item) => !item.deleted)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    habitFailures = failureMap;
  }

  async function loadAppState() {
    if (!session) return;
    const { data, error } = await client
      .from('registros')
      .select('id, registrado_em, texto_original, entrada')
      .in('entrada', APP_EVENT_TYPES)
      .order('registrado_em', { ascending: true })
      .limit(1000);

    if (error) {
      console.warn('Não foi possível carregar hábitos/tarefas:', error.message);
      renderHabits();
      renderTasks();
      return;
    }

    rebuildAppState(data || []);
    renderHabits();
    renderTasks();
    renderHabitsManager();
    renderTasksManager();
  }

  function habitElapsed(startIso, unit = 'auto') {
    const start = new Date(startIso);
    const now = new Date();
    const ms = Math.max(0, now - start);
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(ms / 3600000);
    const days = Math.floor(ms / 86400000);
    const months = Math.floor(days / 30.4375);
    const years = Math.floor(days / 365.2425);

    let chosen = unit;
    if (chosen === 'auto') {
      chosen = minutes < 60 ? 'minutes' : hours < 48 ? 'hours' : days < 60 ? 'days' : days < 730 ? 'months' : 'years';
    }

    const table = {
      minutes: [minutes, minutes === 1 ? 'minuto' : 'minutos'],
      hours: [hours, hours === 1 ? 'hora' : 'horas'],
      days: [days, days === 1 ? 'dia' : 'dias'],
      months: [months, months === 1 ? 'mês' : 'meses'],
      years: [years, years === 1 ? 'ano' : 'anos']
    };
    return table[chosen] || table.days;
  }

  function exactDuration(startIso, endIso = new Date().toISOString()) {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (!Number.isFinite(start.getTime()) || end <= start) return '0 minutos';

    let cursor = new Date(start);
    let years = 0, months = 0;
    while (true) {
      const next = new Date(cursor);
      next.setFullYear(next.getFullYear() + 1);
      if (next <= end) { cursor = next; years += 1; } else break;
    }
    while (true) {
      const next = new Date(cursor);
      next.setMonth(next.getMonth() + 1);
      if (next <= end) { cursor = next; months += 1; } else break;
    }

    let rest = Math.max(0, end - cursor);
    const days = Math.floor(rest / 86400000); rest -= days * 86400000;
    const hours = Math.floor(rest / 3600000); rest -= hours * 3600000;
    const minutes = Math.floor(rest / 60000);

    const parts = [];
    if (years) parts.push(`${years} ${years === 1 ? 'ano' : 'anos'}`);
    if (months) parts.push(`${months} ${months === 1 ? 'mês' : 'meses'}`);
    if (days) parts.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);
    if (hours) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`);
    parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);
    return parts.join(', ');
  }

  function habitCardHtml(habit) {
    const [value, unit] = habitElapsed(habit.started_at, habit.unit || 'auto');
    return `
      <button class="habit-card habit-${escapeHtml(habit.color || 'cyan')} size-${escapeHtml(habit.size || 'medium')}" type="button" data-habit-id="${escapeHtml(habit.id)}">
        <span class="habit-kicker">${habit.mode === 'avoid' ? 'EVITANDO' : 'MANTENDO'}</span>
        <span class="habit-value">${escapeHtml(value)}</span>
        <span class="habit-unit">${escapeHtml(unit)}</span>
        <span class="habit-title">${escapeHtml(habit.title)}</span>
      </button>`;
  }

  function renderHabits() {
    if (!habits.length) {
      habitGrid.innerHTML = `
        <button class="habit-card habit-add size-medium" type="button" data-add-habit>
          <span class="habit-add-plus">+</span>
          <span class="habit-title">Adicionar hábito</span>
          <span class="habit-hint">Comece um contador real</span>
        </button>
        <div class="habit-card habit-placeholder size-large" aria-hidden="true">
          <span class="habit-kicker">SEU PROGRESSO</span>
          <span class="habit-value">—</span>
          <span class="habit-unit">dias</span>
          <span class="habit-title">Seu próximo hábito</span>
        </div>`;
      return;
    }

    habitGrid.innerHTML = habits.map(habitCardHtml).join('') + `
      <button class="habit-card habit-add size-small" type="button" data-add-habit aria-label="Adicionar hábito">
        <span class="habit-add-plus">+</span>
        <span class="habit-title">Novo</span>
      </button>`;
  }

  function renderHabitsManager() {
    if (!habitsManagerList) return;
    if (!habits.length) {
      habitsManagerList.innerHTML = '<div class="manager-empty">Nenhum hábito cadastrado ainda.</div>';
      return;
    }
    habitsManagerList.innerHTML = habits.map((habit) => {
      const [value, unit] = habitElapsed(habit.started_at, habit.unit || 'auto');
      return `
        <button class="manager-row" type="button" data-habit-id="${escapeHtml(habit.id)}">
          <span class="manager-dot habit-${escapeHtml(habit.color || 'cyan')}"></span>
          <span><strong>${escapeHtml(habit.title)}</strong><small>${value} ${escapeHtml(unit)} · ${habit.mode === 'avoid' ? 'evitando' : 'mantendo'}</small></span>
          ${dnIcon('chevron.right', 'dn-manager-chevron')}
        </button>`;
    }).join('');
  }

  function openHabitForm(existing = null) {
    clearError(habitFormError);
    habitFormTitle.textContent = existing ? 'Editar hábito' : 'Novo hábito';
    habitId.value = existing?.id || '';
    habitTitle.value = existing?.title || '';
    habitMode.value = existing?.mode || 'maintain';
    habitUnit.value = existing?.unit || 'auto';
    habitStartedAt.value = localDateTimeValue(existing?.started_at || new Date().toISOString());
    habitSize.value = existing?.size || 'medium';
    habitColor.value = existing?.color || 'cyan';
    habitFormDialog.showModal();
    setTimeout(() => habitTitle.focus(), 100);
  }

  function openHabitDetail(id) {
    const habit = habits.find((item) => item.id === id);
    if (!habit) return;
    selectedHabitId = id;
    const failures = habitFailures.get(id) || [];
    const started = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(habit.started_at));
    habitDetailContent.innerHTML = `
      <div class="detail-kicker">${habit.mode === 'avoid' ? 'ESTOU EVITANDO' : 'ESTOU MANTENDO'}</div>
      <h2>${escapeHtml(habit.title)}</h2>
      <div class="detail-duration">${escapeHtml(exactDuration(habit.started_at))}</div>
      <p class="detail-muted">Começou em ${escapeHtml(started)}</p>
      <div class="detail-stat-line"><span>Interrupções registradas</span><strong>${failures.length}</strong></div>
      ${failures.length ? `<div class="failure-history">${failures.slice(-3).reverse().map((item) => `<span>${escapeHtml(formatTimelineDate(item.failed_at || item.at))}</span>`).join('')}</div>` : ''}`;
    habitDetailDialog.showModal();
  }

  // ---------- TAREFAS ----------

  function taskStatusText(task) {
    if (task.status === 'done') return `Concluída ${formatRecordDate(task.completed_at)}`;
    if (task.status === 'started') return `Iniciada ${formatRecordDate(task.started_at)}`;
    return `Criada ${formatRecordDate(task.created_at)}`;
  }

  const TASK_ICON_CHOICES = [
    'list.bullet','cart.fill','bag.fill','fork.knife','message.fill','banknote.fill',
    'house.fill','archivebox.fill','paperplane.fill','calendar','paintpalette.fill',
    'pills.fill','bed.double.fill','receipt.fill','storefront.fill','key.fill',
    'car.fill','book.fill','gift.fill','document.fill','lightbulb.fill','trash.fill',
    'heart.fill','person.fill'
  ].filter((name) => window.DN_SYMBOLS?.has?.(name));

  function semanticTaskIcon(title = '', area = '') {
    const text = `${title} ${area}`.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
    const has = (...words) => words.some((word) => text.includes(word));

    if (has('comprar','compra','mercado','luva','areia','material','produto','estoque')) return 'cart.fill';
    if (has('cozinha','louca','louça','comida','comer','almoco','almoço','jantar','cafe','café')) return 'fork.knife';
    if (has('mensagem','whatsapp','responder','conversar','falar com','cliente','familia','família','amigo')) return 'message.fill';
    if (has('pagar','aluguel','dinheiro','boleto','fatura','conta','receber','pix')) return 'banknote.fill';
    if (has('organizar','arrumar','gaveta','armario','armário','caixa','guardar')) return 'archivebox.fill';
    if (has('limpar','limpeza','quarto','casa','banheiro','sala')) return 'house.fill';
    if (has('divulgar','postar','instagram','tiktok','anunciar','publicar')) return 'paperplane.fill';
    if (has('consulta','remedio','remédio','medicamento','saude','saúde')) return 'pills.fill';
    if (has('dormir','sono','descansar','cama')) return 'bed.double.fill';
    if (has('contrato','documento','cpf','imobiliaria','imobiliária')) return 'document.fill';
    if (has('marcar','agenda','horario','horário','amanha','amanhã')) return 'calendar';
    if (has('pintar','tinta','cabelo','cor')) return 'paintpalette.fill';
    if (has('chave','senha','acesso')) return 'key.fill';
    if (has('carro','uber','transporte')) return 'car.fill';
    if (has('livro','ler','estudar')) return 'book.fill';
    if (has('presente','aniversario','aniversário')) return 'gift.fill';
    if (has('lixo','jogar fora','descartar')) return 'trash.fill';
    if (has('ideia','planejar','pensar')) return 'lightbulb.fill';
    if (has('sair','caminhar','passear','rua','visitar')) return 'person.fill';
    return 'list.bullet';
  }

  function taskIconName(task) {
    const requested = String(task?.icon_name || '');
    return window.DN_SYMBOLS?.has?.(requested) ? requested : semanticTaskIcon(task?.title, task?.area);
  }

  function taskRowHtml(task) {
    const done = task.status === 'done';
    const started = task.status === 'started';
    const priority = Number.isFinite(Number(task.priority)) ? Math.max(0, Math.min(10, Number(task.priority))) : 5;
    const iconName = done ? 'checkmark.circle.fill' : started ? 'clock.fill' : taskIconName(task);
    return `
      <button class="task-row ${done ? 'done' : started ? 'running' : ''}" type="button" data-task-id="${escapeHtml(task.id)}">
        <span class="task-icon ${done ? 'task-green' : started ? 'task-blue' : priority >= 8 ? 'task-pink' : 'task-violet'}">
          ${dnIcon(iconName, 'dn-task-symbol')}
        </span>
        <span class="task-name">${escapeHtml(task.title)}<small>${escapeHtml(taskStatusText(task))}${task.area ? ` · ${escapeHtml(task.area)}` : ''}</small></span>
        <span class="task-priority" aria-label="Prioridade ${priority} de 10">${priority}/10</span>
        <span class="${done ? 'checkmark' : 'empty-check'}">${done ? dnIcon('checkmark.circle.fill', 'dn-task-check') : ''}</span>
      </button>`;
  }

  function renderTasks() {
    if (!tasks.length) {
      taskList.innerHTML = [1, 2, 3].map((n) => `
        <button class="task-row task-placeholder" type="button" data-placeholder-task>
          <span class="task-icon task-violet">${dnIcon('list.bullet', 'dn-task-symbol')}</span>
          <span class="task-name">Tarefa ${n}<small>Toque para substituir por uma tarefa real</small></span>
          <span class="task-time">—</span>
          <span class="empty-check"></span>
        </button>`).join('');
      return;
    }

    const ordered = [...tasks].sort((a, b) => {
      const rank = { started: 0, open: 1, done: 2 };
      return rank[a.status] - rank[b.status] || (Number(b.priority || 5) - Number(a.priority || 5)) || new Date(b.created_at) - new Date(a.created_at);
    });
    taskList.innerHTML = ordered.slice(0, 4).map(taskRowHtml).join('');
  }

  function renderTasksManager() {
    if (!tasksManagerList) return;
    if (!tasks.length) {
      tasksManagerList.innerHTML = '<div class="manager-empty">Nenhuma tarefa real ainda.</div>';
      return;
    }
    tasksManagerList.innerHTML = tasks.map((task) => `
      <button class="manager-row" type="button" data-task-id="${escapeHtml(task.id)}">
        <span class="manager-status ${escapeHtml(task.status)}"></span>
        <span><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(taskStatusText(task))}</small></span>
        ${dnIcon('chevron.right', 'dn-manager-chevron')}
      </button>`).join('');
  }

  function openTaskForm(existing = null) {
    clearError(taskFormError);
    taskFormTitle.textContent = existing ? 'Editar tarefa' : 'Nova tarefa';
    taskId.value = existing?.id || '';
    taskTitle.value = existing?.title || '';
    taskFormDialog.showModal();
    setTimeout(() => taskTitle.focus(), 100);
  }

  function openTaskDetail(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    selectedTaskId = id;
    const created = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(task.created_at));
    let extra = '<p class="detail-muted">Ainda não iniciada.</p>';
    if (task.status === 'started') {
      extra = `<div class="detail-duration">${escapeHtml(exactDuration(task.started_at))}</div><p class="detail-muted">Em andamento desde ${escapeHtml(formatTimelineDate(task.started_at))}</p>`;
    } else if (task.status === 'done') {
      const start = task.started_at || task.created_at;
      extra = `<div class="detail-duration">${escapeHtml(exactDuration(start, task.completed_at))}</div><p class="detail-muted">Concluída ${escapeHtml(formatTimelineDate(task.completed_at))}</p>`;
    }

    taskDetailContent.innerHTML = `
      <div class="detail-kicker">TAREFA</div>
      <div class="task-detail-title-row"><span class="task-detail-icon">${dnIcon(taskIconName(task), 'dn-task-symbol')}</span><h2>${escapeHtml(task.title)}</h2></div>
      <div class="detail-priority">Prioridade <strong>${escapeHtml(Number(task.priority ?? 5))}/10</strong>${task.priority_reason ? `<span>${escapeHtml(task.priority_reason)}</span>` : ''}</div>
      ${extra}
      <p class="detail-muted">Criada em ${escapeHtml(created)}</p>`;
    startTaskButton.hidden = task.status !== 'open';
    completeTaskButton.hidden = task.status !== 'started';
    taskDetailDialog.showModal();
  }

  function renderTaskIconPicker(task) {
    if (!taskIconGrid) return;
    const current = taskIconName(task);
    taskIconGrid.innerHTML = TASK_ICON_CHOICES.map((name) => `
      <button type="button" class="task-icon-choice ${name === current ? 'selected' : ''}" data-task-icon="${escapeHtml(name)}" aria-label="${escapeHtml(name)}">
        ${dnIcon(name, 'dn-task-symbol')}
      </button>`).join('');
  }

  function openTaskIconPicker() {
    const task = tasks.find((item) => item.id === selectedTaskId);
    if (!task || !taskIconDialog) return;
    renderTaskIconPicker(task);
    taskIconDialog.showModal();
  }

  // ---------- SESSÃO ----------

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
    if (accountEmail) accountEmail.textContent = session.user?.email || 'Conta conectada';
    await Promise.all([loadRecords(), loadAppState()]);
  }

  async function init() {
    updateDateAndGreeting();
    setInterval(updateDateAndGreeting, 60000);
    renderHabits();
    renderTasks();

    if (!config?.supabaseUrl || !config?.supabasePublishableKey || !sdk?.createClient) {
      realNotes.innerHTML = `
        <article class="note-card note-peach empty-note">
          <div class="note-meta">Configuração incompleta</div>
          <p>Não foi possível iniciar a conexão com o Supabase.</p>
        </article>`;
      return;
    }

    client = sdk.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });

    client.auth.onAuthStateChange((_event, newSession) => {
      session = newSession;
      if (session) {
        closeLogin();
        if (accountEmail) accountEmail.textContent = session.user?.email || 'Conta conectada';
        setTimeout(() => Promise.all([loadRecords(), loadAppState()]), 0);
      }
    });

    await refreshSession();

    // Sem polling por tempo. Atualiza quando o app volta ao primeiro plano.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && session) {
        loadRecords();
        loadAppState();
        if (!timelineView.hidden) {
          if (!timelineInitialLoaded) loadTimelineInitial();
          else refreshTimelineNew();
        }
      }
    });
  }

  // ---------- EVENTOS DE INTERFACE ----------

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(loginError);
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Entrando…';

    const { data, error } = await client.auth.signInWithPassword({
      email: loginEmail.value.trim(), password: loginPassword.value
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
    await Promise.all([loadRecords(), loadAppState()]);
  });

  document.querySelectorAll('[data-demo="register"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!session) return openLogin();
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
      id: generateRecordId(now), schema_version: 2, registrado_em: now.toISOString(),
      texto_original: text, origem: 'pwa', entrada: 'texto', versao_cliente: 'pwa-0.5'
    };
    const { error } = await client.from('registros').insert(payload);
    if (error) return showError(registerError, error.message);

    registerDialog.close();
    showToast('Registro salvo');
    await loadRecords();
    if (!timelineView.hidden) await refreshTimelineNew({ scrollToPresent: true });
  });

  homeNavButton.addEventListener('click', () => showPage('home'));
  timelineNavButton.addEventListener('click', () => showPage('timeline'));
  openTimelineFromNotes.addEventListener('click', () => showPage('timeline'));
  timelineRefresh.addEventListener('click', () => refreshTimelineNew({ scrollToPresent: true }));

  habitGrid.addEventListener('click', (event) => {
    const add = event.target.closest('[data-add-habit]');
    if (add) return openHabitForm();
    const card = event.target.closest('[data-habit-id]');
    if (card) openHabitDetail(card.dataset.habitId);
  });

  openHabitsManager.addEventListener('click', () => {
    renderHabitsManager();
    habitsManagerDialog.showModal();
  });
  closeHabitsManager.addEventListener('click', () => habitsManagerDialog.close());
  addHabitFromManager.addEventListener('click', () => openHabitForm());
  habitsManagerList.addEventListener('click', (event) => {
    const row = event.target.closest('[data-habit-id]');
    if (row) openHabitDetail(row.dataset.habitId);
  });
  cancelHabitForm.addEventListener('click', () => habitFormDialog.close());

  habitForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(habitFormError);
    const title = habitTitle.value.trim();
    if (!title) return;
    const existing = habits.find((item) => item.id === habitId.value);
    const id = existing?.id || generateRecordId(new Date()).replace('dn-', 'hb-');
    const payload = {
      habit_id: id,
      title,
      mode: habitMode.value,
      started_at: new Date(habitStartedAt.value).toISOString(),
      unit: habitUnit.value,
      size: habitSize.value,
      color: habitColor.value
    };
    try {
      await insertStructuredEvent(existing ? 'habito_editado' : 'habito_criado', payload);
      habitFormDialog.close();
      showToast(existing ? 'Hábito atualizado' : 'Hábito criado');
      await loadAppState();
    } catch (error) {
      showError(habitFormError, error.message);
    }
  });

  editHabitButton.addEventListener('click', () => {
    const habit = habits.find((item) => item.id === selectedHabitId);
    if (!habit) return;
    habitDetailDialog.close();
    openHabitForm(habit);
  });
  failHabitButton.addEventListener('click', async () => {
    const habit = habits.find((item) => item.id === selectedHabitId);
    if (!habit) return;
    const now = new Date().toISOString();
    try {
      await insertStructuredEvent('habito_reiniciado', {
        habit_id: habit.id,
        previous_started_at: habit.started_at,
        failed_at: now,
        new_started_at: now
      });
      habitDetailDialog.close();
      showToast('Contagem reiniciada');
      await loadAppState();
    } catch (error) {
      showToast(`Erro: ${error.message}`);
    }
  });
  deleteHabitButton.addEventListener('click', async () => {
    const habit = habits.find((item) => item.id === selectedHabitId);
    if (!habit) return;
    try {
      await insertStructuredEvent('habito_excluido', { habit_id: habit.id });
      habitDetailDialog.close();
      showToast('Hábito excluído');
      await loadAppState();
    } catch (error) {
      showToast(`Erro: ${error.message}`);
    }
  });
  closeHabitDetail.addEventListener('click', () => habitDetailDialog.close());

  addTaskButton.addEventListener('click', () => openTaskForm());
  taskList.addEventListener('click', (event) => {
    if (event.target.closest('[data-placeholder-task]')) return openTaskForm();
    const row = event.target.closest('[data-task-id]');
    if (row) openTaskDetail(row.dataset.taskId);
  });
  openTasksManager.addEventListener('click', () => {
    renderTasksManager();
    tasksManagerDialog.showModal();
  });
  closeTasksManager.addEventListener('click', () => tasksManagerDialog.close());
  addTaskFromManager.addEventListener('click', () => openTaskForm());
  tasksManagerList.addEventListener('click', (event) => {
    const row = event.target.closest('[data-task-id]');
    if (row) openTaskDetail(row.dataset.taskId);
  });
  cancelTaskForm.addEventListener('click', () => taskFormDialog.close());

  taskForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(taskFormError);
    const title = taskTitle.value.trim();
    if (!title) return;
    const existing = tasks.find((item) => item.id === taskId.value);
    const id = existing?.id || generateRecordId(new Date()).replace('dn-', 'tk-');
    try {
      await insertStructuredEvent(existing ? 'tarefa_editada' : 'tarefa_criada', {
        task_id: id,
        title,
        ...(existing ? {} : { created_at: new Date().toISOString(), priority: 5, source: 'manual', icon_name: semanticTaskIcon(title, '') })
      });
      taskFormDialog.close();
      showToast(existing ? 'Tarefa atualizada' : 'Tarefa criada');
      await loadAppState();
    } catch (error) {
      showError(taskFormError, error.message);
    }
  });

  editTaskButton.addEventListener('click', () => {
    const task = tasks.find((item) => item.id === selectedTaskId);
    if (!task) return;
    taskDetailDialog.close();
    openTaskForm(task);
  });
  changeTaskIconButton?.addEventListener('click', () => {
    taskDetailDialog.close();
    openTaskIconPicker();
  });
  closeTaskIconPicker?.addEventListener('click', () => taskIconDialog?.close());
  taskIconGrid?.addEventListener('click', async (event) => {
    const button = event.target.closest?.('[data-task-icon]');
    if (!button) return;
    const task = tasks.find((item) => item.id === selectedTaskId);
    if (!task) return;
    try {
      await insertStructuredEvent('tarefa_editada', { task_id: task.id, icon_name: button.dataset.taskIcon });
      taskIconDialog?.close();
      showToast('Ícone atualizado');
      await loadAppState();
    } catch (error) {
      showToast(`Erro: ${error.message}`);
    }
  });
  startTaskButton.addEventListener('click', async () => {
    const task = tasks.find((item) => item.id === selectedTaskId);
    if (!task) return;
    try {
      await insertStructuredEvent('tarefa_iniciada', { task_id: task.id, started_at: new Date().toISOString() });
      taskDetailDialog.close();
      showToast('Tarefa iniciada');
      await loadAppState();
    } catch (error) {
      showToast(`Erro: ${error.message}`);
    }
  });
  completeTaskButton.addEventListener('click', async () => {
    const task = tasks.find((item) => item.id === selectedTaskId);
    if (!task) return;
    try {
      await insertStructuredEvent('tarefa_concluida', { task_id: task.id, completed_at: new Date().toISOString() });
      taskDetailDialog.close();
      showToast('Tarefa concluída');
      await loadAppState();
    } catch (error) {
      showToast(`Erro: ${error.message}`);
    }
  });
  deleteTaskButton.addEventListener('click', async () => {
    const task = tasks.find((item) => item.id === selectedTaskId);
    if (!task) return;
    try {
      await insertStructuredEvent('tarefa_excluida', { task_id: task.id });
      taskDetailDialog.close();
      showToast('Tarefa excluída');
      await loadAppState();
    } catch (error) {
      showToast(`Erro: ${error.message}`);
    }
  });
  closeTaskDetail.addEventListener('click', () => taskDetailDialog.close());

  accountButton?.addEventListener('click', () => {
    if (!session) return openLogin();
    ensureAccountDialog();
    if (accountEmail) accountEmail.textContent = session.user?.email || 'Conta conectada';
    accountDialog?.showModal();
  });
  closeAccount?.addEventListener('click', () => accountDialog?.close());
  logoutButton?.addEventListener('click', async () => {
    await client.auth.signOut();
    session = null;
    accountDialog?.close();
    habits = [];
    tasks = [];
    renderHabits();
    renderTasks();
    renderRecords([]);
    resetTimelineState();
    openLogin();
  });

  init();
})();
