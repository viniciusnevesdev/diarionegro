/* DN_FEATURES_V08_COPILOTO */
(() => {
  'use strict';

  const config = window.DIARIO_NEGRO_CONFIG;
  const sdk = window.supabase;
  const SESSION_KEY = 'dn-v08-active-session';
  const MAX_RULES = 60;
  const MAX_PHOTOS = 4;
  const MOOD_PROMPT_KEY = 'dn-v081-last-mood-prompt';
  const MOOD_COOLDOWN_MS = 6 * 60 * 60 * 1000;
  const MOOD_STALE_MS = 48 * 60 * 60 * 1000;

  let client = null;
  let learnedRules = [];
  let recentEmotions = [];
  let activeSession = readJson(SESSION_KEY, null);
  let lastResult = null;
  let currentCorrection = null;
  let resetInputOnNextOpen = false;
  let recorder = null;
  let recorderStream = null;
  let recorderChunks = [];
  const skipOnce = new Set();

  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => [...root.querySelectorAll(q)];
  const icon = (name, cls = '') => window.DN_SYMBOLS?.icon?.(name, cls) || '';
  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
  function uid(prefix = 'dn') {
    const now = new Date();
    const p = (n, s = 2) => String(n).padStart(s, '0');
    return `${prefix}-${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}T${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}${p(now.getMilliseconds(),3)}-${Math.random().toString(36).slice(2,7)}`;
  }
  function parsePayload(value) {
    try { return JSON.parse(value); } catch { return null; }
  }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, Number(n) || 0)); }

  async function ensureSession() {
    if (!client) throw new Error('Supabase não disponível.');
    const { data } = await client.auth.getSession();
    if (!data?.session) throw new Error('Entre no Diário Negro primeiro.');
    return data.session;
  }

  async function recordEvent(type, payload) {
    if (typeof window.DN_APP_API?.recordEvent === 'function') {
      try { return await window.DN_APP_API.recordEvent(type, payload); } catch {}
    }
    await ensureSession();
    const now = new Date();
    const row = {
      id: uid('dn'), schema_version: 2, registrado_em: now.toISOString(),
      texto_original: JSON.stringify(payload), origem: 'pwa', entrada: type, versao_cliente: 'pwa-0.8'
    };
    const { error } = await client.from('registros').insert(row);
    if (error) throw error;
    return row;
  }

  async function loadLearnedContext() {
    if (!client) return;
    const { data: auth } = await client.auth.getSession();
    if (!auth?.session) return;
    const { data } = await client.from('registros')
      .select('registrado_em,texto_original,entrada')
      .in('entrada', ['memoria_ia', 'correcao_ia'])
      .order('registrado_em', { ascending: false }).limit(100);
    const rules = [];
    for (const row of data || []) {
      const p = parsePayload(row.texto_original);
      if (!p) continue;
      if (row.entrada === 'memoria_ia' && p.texto) rules.push(String(p.texto));
      if (row.entrada === 'correcao_ia' && p.remember && p.lesson) rules.push(String(p.lesson));
      if (rules.length >= MAX_RULES) break;
    }
    learnedRules = [...new Set(rules)];
  }

  async function loadRecentEmotions() {
    if (!client) return;
    const { data: auth } = await client.auth.getSession();
    if (!auth?.session) return;
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data } = await client.from('registros')
      .select('registrado_em,texto_original,entrada')
      .in('entrada', ['emocao_registrada', 'emocao_corrigida', 'checkin_humor_resposta'])
      .gte('registrado_em', cutoff)
      .order('registrado_em', { ascending: false }).limit(16);
    recentEmotions = (data || []).map((row) => ({ at: row.registrado_em, ...parsePayload(row.texto_original) })).filter(Boolean);
  }

  function ensureUi() {
    if ($('#dnCopilotCard')) return;
    const greeting = $('.greeting-card');
    const card = document.createElement('section');
    card.id = 'dnCopilotCard';
    card.className = 'dn-copilot-card glass-card';
    card.innerHTML = `
      <div class="dn-copilot-heading">
        <div class="dn-copilot-title-icon">${icon('sparkles')}</div>
        <div class="dn-copilot-heading-copy"><span>COPILOTO</span><h2>O que faço agora?</h2></div>
      </div>
      <div id="dnCopilotIdle" class="dn-copilot-idle">
        <strong id="dnCopilotMicrocopy">Eu tô aqui pra ajudar você.</strong>
        <span>Eu escolho algo possível pra você fazer agora.</span>
      </div>
      <div id="dnNextAction" class="dn-next-action" hidden></div>
      <div class="dn-copilot-actions">
        <button class="dn-primary-action" id="dnChooseNow" type="button" data-intensity="medium">${icon('sparkles')}<span>Escolher agora</span></button>
      </div>
      <div id="dnActiveSession" class="dn-session-home" hidden></div>`;
    greeting?.insertAdjacentElement('afterend', card);

    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="dnInputDialog" class="demo-dialog dn-copilot-dialog">
        <div class="demo-sheet dn-copilot-sheet">
          <div class="sheet-handle"></div>
          <div class="dn-sheet-heading"><div><span class="dn-kicker">ENTRADA UNIVERSAL</span><h2>Jogar algo aqui</h2><p>Você entrega a realidade. Eu organizo.</p></div><button type="button" class="dn-close-dialog" data-close="dnInputDialog">${icon('xmark.circle.fill')}</button></div>
          <div class="dn-input-tabs" role="tablist">
            <button class="dn-input-tab active" type="button" data-input-tab="text">${icon('square.and.pencil')}<span>Escrever</span></button>
            <button class="dn-input-tab" type="button" data-input-tab="photo">${icon('camera.fill')}<span>Foto</span></button>
            <button class="dn-input-tab" type="button" data-input-tab="voice">${icon('microphone.fill')}<span>Voz</span></button>
            <button class="dn-input-tab" type="button" data-input-tab="teach">${icon('brain.head.profile.fill')}<span>Ensinar</span></button>
          </div>

          <section class="dn-input-panel active" data-input-panel="text">
            <textarea id="dnTextInput" class="field-input field-textarea dn-big-textarea" placeholder="Fale do seu jeito. Pode misturar tarefas, pensamentos, compromissos e sentimentos."></textarea>
            <button class="primary-btn sheet-button" id="dnAnalyzeText" type="button">Interpretar</button>
          </section>

          <section class="dn-input-panel" data-input-panel="photo" hidden>
            <label class="dn-photo-picker">
              ${icon('camera.fill','dn-photo-icon')}
              <strong>Escolher ou tirar fotos</strong>
              <span>Até 4 fotos viram uma visão geral leve antes do envio.</span>
              <input id="dnPhotoInput" type="file" accept="image/*" multiple hidden />
            </label>
            <div id="dnPhotoInfo" class="dn-file-info">Nenhuma foto selecionada.</div>
            <textarea id="dnPhotoNote" class="field-input dn-photo-note" placeholder="Opcional: ex. “essa é minha cozinha, me guia por onde começar”"></textarea>
            <button class="primary-btn sheet-button" id="dnAnalyzePhoto" type="button">Analisar ambiente / print</button>
          </section>

          <section class="dn-input-panel" data-input-panel="voice" hidden>
            <div class="dn-voice-box">
              <button id="dnRecordVoice" class="dn-record-button" type="button">${icon('microphone.fill')}<span>Começar a falar</span></button>
              <div id="dnVoiceStatus">Fale normalmente. Eu separo o que significa o quê.</div>
            </div>
          </section>

          <section class="dn-input-panel" data-input-panel="teach" hidden>
            <textarea id="dnTeachText" class="field-input field-textarea" placeholder="Ex.: As toalhas limpas ficam na segunda gaveta. / Sair de casa é importante para mim quando estou me isolando."></textarea>
            <label class="field-label" for="dnTeachType">Tipo de memória</label>
            <select id="dnTeachType" class="field-input">
              <option value="regra">Regra pessoal</option>
              <option value="local_objeto">Objeto / lugar</option>
              <option value="preferencia">Preferência</option>
              <option value="contexto_pessoal">Contexto sobre minha vida</option>
            </select>
            <button class="primary-btn sheet-button" id="dnSaveTeaching" type="button">Lembrar disso</button>
          </section>

          <div id="dnInputStatus" class="dn-input-status"></div>
          <div id="dnInterpretationResult" class="dn-result" hidden></div>
        </div>
      </dialog>

      <dialog id="dnMoodDialog" class="demo-dialog dn-copilot-dialog">
        <div class="demo-sheet dn-mood-sheet">
          <div class="sheet-handle"></div>
          <div class="dn-sheet-heading"><div><span class="dn-kicker">CHECK-IN</span><h2>Como você ficou?</h2><p id="dnMoodPromptText">Quero entender como isso te afetou, sem transformar a resposta em obrigação.</p></div><button type="button" class="dn-close-dialog" data-mood="ignore">${icon('xmark.circle.fill')}</button></div>
          <div class="dn-mood-actions">
            <button type="button" data-mood="better">${icon('heart.fill')}<span>Melhor</span></button>
            <button type="button" data-mood="same">${icon('minus.circle.fill')}<span>Igual</span></button>
            <button type="button" data-mood="worse">${icon('exclamationmark.circle.fill')}<span>Pior</span></button>
          </div>
          <button type="button" class="dn-mood-explain" data-mood="explain">${icon('square.and.pencil')}<span>Quero explicar</span></button>
          <button type="button" class="dn-mood-ignore" data-mood="ignore">Ignorar</button>
        </div>
      </dialog>

      <dialog id="dnCorrectionDialog" class="demo-dialog dn-copilot-dialog">
        <form id="dnCorrectionForm" class="demo-sheet dn-correction-sheet">
          <div class="sheet-handle"></div>
          <div class="dn-sheet-heading"><div><span class="dn-kicker">CORRIGIR A IA</span><h2 id="dnCorrectionTitle">Corrigir</h2><p>Você pode ensinar só este caso ou uma regra para o futuro.</p></div><button type="button" class="dn-close-dialog" data-close="dnCorrectionDialog">${icon('xmark.circle.fill')}</button></div>
          <div id="dnCorrectionFields"></div>
          <label class="dn-remember-row"><input id="dnRememberCorrection" type="checkbox" /><span><strong>Lembrar para situações parecidas</strong><small>Isso entra no contexto das próximas interpretações.</small></span></label>
          <label class="field-label" for="dnCorrectionLesson">O que a IA precisa entender?</label>
          <textarea id="dnCorrectionLesson" class="field-input" rows="3" placeholder="Opcional, mas muito útil para ensinar a regra."></textarea>
          <div class="sheet-actions"><button type="button" class="secondary-btn" data-close="dnCorrectionDialog">Cancelar</button><button type="submit" class="primary-btn">Salvar correção</button></div>
        </form>
      </dialog>`);

    bindUi();
    renderActiveSession();
    watchCopilotMicrocopy();
  }


  /* DN_COPILOT_MICROCOPY_AUTOFIT_V2 */
  function fitCopilotMicrocopy() {
    const el = document.getElementById('dnCopilotMicrocopy');
    if (!el) return;

    const MAX = 13.5;
    const MIN = 12.3;
    const STEP = 0.2;

    el.style.fontSize = MAX + 'px';

    const text = (el.textContent || '').trim();
    if (!text) return;

    const probe = document.createElement('span');

    const cs = getComputedStyle(el);

    probe.textContent = text;

    probe.style.position = 'fixed';
    probe.style.left = '-99999px';
    probe.style.top = '-99999px';
    probe.style.visibility = 'hidden';

    probe.style.whiteSpace = 'nowrap';

    probe.style.fontFamily = cs.fontFamily;
    probe.style.fontWeight = cs.fontWeight;
    probe.style.letterSpacing = cs.letterSpacing;

    document.body.appendChild(probe);

    const available = el.clientWidth;

    let chosen = MAX;
    let fits = false;

    for (let size = MAX; size >= MIN; size -= STEP) {
      probe.style.fontSize = size + 'px';

      if (probe.getBoundingClientRect().width <= available) {
        chosen = size;
        fits = true;
        break;
      }
    }

    /*
      Se uma redução pequena resolver, usamos essa exceção.
      Se precisar reduzir demais, mantém 13.5px e deixa virar 2 linhas.
    */
    if (fits) {
      el.style.fontSize = chosen.toFixed(1) + 'px';
      el.dataset.fitMode = 'single';
    } else {
      /*
        Se realmente precisar de duas linhas,
        não reduzimos demais a fonte.
      */
      el.style.fontSize = '14.4px';
      el.dataset.fitMode = 'double';
    }

    probe.remove();
  }

  function watchCopilotMicrocopy() {
    const el = document.getElementById('dnCopilotMicrocopy');
    if (!el) return;

    fitCopilotMicrocopy();

    const observer = new MutationObserver(() => {
      requestAnimationFrame(fitCopilotMicrocopy);
    });

    observer.observe(el, {
      childList: true,
      characterData: true,
      subtree: true
    });

    window.addEventListener(
      'resize',
      fitCopilotMicrocopy,
      { passive: true }
    );
  }


  function bindUi() {
    $('#dnChooseNow')?.addEventListener('click', chooseNow);
    $$('.dn-close-dialog').forEach((b) => b.addEventListener('click', () => document.getElementById(b.dataset.close)?.close()));
    $$('.dn-input-tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.inputTab)));
    $('#dnAnalyzeText')?.addEventListener('click', () => analyzeText());
    $('#dnAnalyzePhoto')?.addEventListener('click', () => analyzePhoto());
    $('#dnPhotoInput')?.addEventListener('change', updatePhotoInfo);
    $('#dnSaveTeaching')?.addEventListener('click', saveTeaching);
    $('#dnRecordVoice')?.addEventListener('click', toggleRecording);
    $('#dnCorrectionForm')?.addEventListener('submit', saveCorrection);
    $('#dnInterpretationResult')?.addEventListener('click', handleResultClick);
    $('#dnActiveSession')?.addEventListener('click', handleSessionClick);
    $('#dnNextAction')?.addEventListener('click', handleNextActionClick);
    $('#dnMoodDialog')?.addEventListener('click', handleMoodClick);

    document.addEventListener('click', (event) => {
      const trigger = event.target.closest?.('[data-demo="register"]');
      if (!trigger) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openInput('text');
    }, true);
  }

  function resetUniversalInput() {
    const text = $('#dnTextInput'); if (text) text.value = '';
    const photo = $('#dnPhotoInput'); if (photo) photo.value = '';
    const note = $('#dnPhotoNote'); if (note) note.value = '';
    const info = $('#dnPhotoInfo'); if (info) info.textContent = 'Nenhuma foto selecionada.';
    const result = $('#dnInterpretationResult'); if (result) { result.hidden = true; result.innerHTML = ''; }
    const voice = $('#dnVoiceStatus'); if (voice) voice.textContent = 'Fale normalmente. Eu separo o que significa o quê.';
    lastResult = null;
    setStatus('');
  }

  function openInput(tab = 'text') {
    if (resetInputOnNextOpen) {
      resetUniversalInput();
      resetInputOnNextOpen = false;
    }
    switchTab(tab);
    const d = $('#dnInputDialog');
    if (!d?.open) d?.showModal();
    if (tab === 'text') setTimeout(() => $('#dnTextInput')?.focus(), 120);
  }

  function switchTab(tab) {
    $$('.dn-input-tab').forEach((b) => b.classList.toggle('active', b.dataset.inputTab === tab));
    $$('.dn-input-panel').forEach((p) => {
      const active = p.dataset.inputPanel === tab;
      p.classList.toggle('active', active); p.hidden = !active;
    });
    setStatus('');
  }

  function setStatus(text, tone = '') {
    const el = $('#dnInputStatus'); if (!el) return;
    el.textContent = text || ''; el.dataset.tone = tone;
  }

  function setBusy(button, busy, text) {
    if (!button) return;
    if (busy) { button.dataset.original = button.innerHTML; button.disabled = true; button.textContent = text || 'Processando…'; }
    else { button.disabled = false; if (button.dataset.original) { button.innerHTML = button.dataset.original; delete button.dataset.original; } }
  }

  async function invokeCopilot(body) {
    await ensureSession();
    const { data, error } = await client.functions.invoke('copiloto', { body: { ...body, regras: learnedRules } });
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error('A IA respondeu sem dados válidos.');
    return data;
  }

  function interpretationContext() {
    return window.DN_INTERPRETATIONS?.requestContext?.() || {
      tarefas: [],
      agora: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    };
  }

  async function analyzeText(textOverride = '', inputType = 'texto') {
    const text = String(textOverride || $('#dnTextInput')?.value || '').trim();
    if (!text) return setStatus('Escreva ou fale alguma coisa primeiro.', 'warn');
    const button = $('#dnAnalyzeText'); setBusy(button, true, 'Interpretando…'); setStatus('Organizando o que isso significa…');
    try {
      await loadLearnedContext();
      let sourceRecord = null;
      if (typeof window.DN_APP_API?.recordNote === 'function') {
        try { sourceRecord = await window.DN_APP_API.recordNote(text, inputType); } catch {}
      }
      if (!sourceRecord) {
        await ensureSession();
        const now = new Date();
        sourceRecord = { id: uid('dn'), schema_version: 2, registrado_em: now.toISOString(), texto_original: text, origem: 'pwa', entrada: inputType === 'audio_ia' ? 'audio_ia' : 'texto', versao_cliente: 'pwa-0.8' };
        const { error } = await client.from('registros').insert(sourceRecord);
        if (error) throw error;
      }
      const result = await invokeCopilot({ modo: 'interpretar', texto: text, ...interpretationContext() });
      await window.DN_INTERPRETATIONS?.persist?.(sourceRecord.id, result, { origem: 'copiloto', effectsApplied: false }, client);
      await processInterpretation(result, sourceRecord?.id || uid('src'));
      await window.DN_INTERPRETATIONS?.persist?.(sourceRecord.id, result, { origem: 'copiloto', effectsApplied: true }, client);
      renderResult(result);
      resetInputOnNextOpen = true;
      setStatus('Interpretação concluída.', 'ok');
    } catch (error) { setStatus(error?.message || String(error), 'error'); }
    finally { setBusy(button, false); }
  }

  async function analyzePhoto() {
    const input = $('#dnPhotoInput');
    const files = [...(input?.files || [])].slice(0, MAX_PHOTOS);
    if (!files.length) return setStatus('Escolha pelo menos uma foto.', 'warn');
    const button = $('#dnAnalyzePhoto'); setBusy(button, true, 'Preparando fotos…');
    try {
      setStatus('Comprimindo no iPhone antes do envio…');
      const prepared = await prepareImages(files);
      $('#dnPhotoInfo').textContent = `${files.length} foto${files.length > 1 ? 's' : ''} · ${(prepared.bytes / 1024).toFixed(0)} KB para análise`;
      setBusy(button, true, 'Interpretando…');
      await loadLearnedContext();
      const note = String($('#dnPhotoNote')?.value || '').trim();
      const result = await invokeCopilot({ modo: 'interpretar', texto: note, imagem_data_url: prepared.dataUrl, ...interpretationContext() });
      await processInterpretation(result, uid('foto'));
      renderResult(result);
      resetInputOnNextOpen = true;
      setStatus('Foto analisada. Se for uma organização, vou mostrar uma etapa por vez.', 'ok');
    } catch (error) { setStatus(error?.message || String(error), 'error'); }
    finally { setBusy(button, false); }
  }

  async function processInterpretation(result, sourceId) {
    lastResult = result;
    result.__taskActionRefs = await window.DN_INTERPRETATIONS?.applyTaskActions?.(result) || [];
    const taskRefs = [];
    for (let i = 0; i < (result.tarefas || []).length; i++) {
      const t = result.tarefas[i];
      if (typeof window.DN_APP_API?.createTaskFromAI !== 'function') continue;
      try {
        const outcome = await window.DN_APP_API.createTaskFromAI({
          sourceRecordId: sourceId, taskKey: `${i}-${t.titulo}`, title: t.titulo,
          priority: t.prioridade, priorityReason: t.motivo_prioridade, area: t.area,
          due: t.prazo, effort: t.energia, durationMin: t.duracao_min, confidence: t.confianca
        });
        taskRefs.push({ index: i, taskId: outcome?.task?.id || null });
      } catch {}
    }
    result.__taskRefs = taskRefs;

    for (let i = 0; i < (result.emocoes || []).length; i++) {
      const e = result.emocoes[i];
      try {
        const emotionId = uid('em');
        e.__emotionId = emotionId;
        await recordEvent('emocao_registrada', { emotion_id: emotionId, source_id: sourceId, ...e, recorded_at: new Date().toISOString() });
      } catch {}
    }

    if (result.sessao?.ativa && Array.isArray(result.sessao.passos) && result.sessao.passos.length) {
      activeSession = {
        id: uid('sessao'), title: result.sessao.titulo || 'Sessão guiada', environment: result.sessao.ambiente || '',
        steps: result.sessao.passos, index: 0, createdAt: new Date().toISOString(), sourceId
      };
      writeJson(SESSION_KEY, activeSession);
      try { await recordEvent('sessao_guiada_criada', activeSession); } catch {}
      renderActiveSession();
    }
    await loadRecentEmotions();
  }

  function renderResult(result) {
    const box = $('#dnInterpretationResult'); if (!box) return;
    const taskRefByIndex = new Map((result.__taskRefs || []).map((x) => [x.index, x.taskId]));
    const category = [result.categoria, result.subcategoria].filter(Boolean).join(' › ');
    const events = (result.eventos || []).map((event) => `
      <article class="dn-result-card dn-result-event">
        <div class="dn-result-card-icon">${icon('clock.fill')}</div>
        <div class="dn-result-main"><div class="dn-result-top"><span>${esc([event.categoria, event.subcategoria].filter(Boolean).join(' › ') || 'Evento')}</span><b>${esc(event.estado || 'ocorreu')}</b></div><strong>${esc(event.nome)}</strong><p>${esc([event.momento, event.detalhes].filter(Boolean).join(' · '))}</p></div>
      </article>`).join('');
    const taskActions = (result.acoes_tarefas || []).map((action) => {
      const applied = (result.__taskActionRefs || []).find((item) => item.taskId === action.task_id && item.action === action.acao)?.applied;
      const label = action.acao === 'concluir' ? 'Tarefa concluída' : action.acao === 'iniciar' ? 'Tarefa iniciada' : 'Tarefa atualizada';
      return `<article class="dn-result-card dn-result-task-action"><div class="dn-result-card-icon">${icon(applied ? 'checkmark.circle.fill' : 'exclamationmark.circle.fill')}</div><div class="dn-result-main"><div class="dn-result-top"><span>Ação em tarefa existente</span><b>${applied ? 'aplicada' : 'não aplicada'}</b></div><strong>${esc(label)}: ${esc(action.titulo_referencia)}</strong><p>${esc(action.evidencia || '')}</p></div></article>`;
    }).join('');
    const tasks = (result.tarefas || []).map((t, i) => `
      <article class="dn-result-card dn-result-task">
        <div class="dn-result-card-icon">${icon('list.bullet')}</div>
        <div class="dn-result-main"><div class="dn-result-top"><span>${esc(t.area || 'Tarefa')}</span><b>${clamp(t.prioridade,0,10)}/10</b></div><strong>${esc(t.titulo)}</strong><p>${esc(t.motivo_prioridade || '')}</p></div>
        <button type="button" class="dn-mini-edit" data-correct-task="${esc(taskRefByIndex.get(i) || '')}" data-task-index="${i}">${icon('pencil')}<span>Corrigir</span></button>
      </article>`).join('');
    const emotions = (result.emocoes || []).map((e, i) => `
      <article class="dn-result-card dn-result-emotion">
        <div class="dn-result-card-icon emotion">${icon('heart.fill')}</div>
        <div class="dn-result-main"><div class="dn-result-top"><span>Estado emocional</span><b>${e.intensidade >= 0 ? `${e.intensidade}/10` : '—'}</b></div><strong>${esc(e.nome)}</strong><p>${esc(e.contexto || '')}</p></div>
        <button type="button" class="dn-mini-edit" data-correct-emotion="${i}">${icon('pencil')}<span>Corrigir</span></button>
      </article>`).join('');
    const session = result.sessao?.ativa ? `<div class="dn-result-session"><span>${icon('house.fill')}</span><div><b>${esc(result.sessao.titulo || 'Sessão guiada')}</b><small>${result.sessao.passos?.length || 0} etapas temporárias · uma por vez</small></div><button type="button" data-focus-session>Ver primeira etapa</button></div>` : '';
    const memories = (result.memorias_sugeridas || []).filter((m) => m.confianca >= .7).map((m, i) => `<button class="dn-memory-suggestion" type="button" data-save-memory="${i}">${icon('brain.head.profile.fill')}<span><b>Ensinar isso</b><small>${esc(m.texto)}</small></span></button>`).join('');
    box.innerHTML = `<div class="dn-result-summary"><span class="dn-kicker">ENTENDI ASSIM</span><p>${esc(result.resumo || '')}</p>${category ? `<small>${esc(category)}</small>` : ''}</div>${events}${taskActions}${session}${tasks}${emotions}${memories}`;
    box.hidden = false;
  }

  async function handleResultClick(event) {
    const task = event.target.closest('[data-correct-task]');
    if (task) return openTaskCorrection(Number(task.dataset.taskIndex), task.dataset.correctTask);
    const emotion = event.target.closest('[data-correct-emotion]');
    if (emotion) return openEmotionCorrection(Number(emotion.dataset.correctEmotion));
    const mem = event.target.closest('[data-save-memory]');
    if (mem && lastResult) {
      const m = lastResult.memorias_sugeridas?.[Number(mem.dataset.saveMemory)];
      if (!m) return;
      await recordEvent('memoria_ia', { texto: m.texto, tipo: m.tipo, created_at: new Date().toISOString(), source: 'sugestao_ia_confirmada' });
      await loadLearnedContext(); mem.disabled = true; mem.querySelector('b').textContent = 'Aprendido'; return;
    }
    if (event.target.closest('[data-focus-session]')) {
      $('#dnInputDialog')?.close();
      $('#dnActiveSession')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function openTaskCorrection(index, taskId) {
    const item = lastResult?.tarefas?.[index]; if (!item) return;
    currentCorrection = { kind: 'task', index, taskId, before: { ...item } };
    $('#dnCorrectionTitle').textContent = 'Corrigir tarefa';
    $('#dnCorrectionFields').innerHTML = `
      <label class="field-label">Isso deve ser</label><select id="dnCorrectKind" class="field-input"><option value="task">Uma tarefa</option><option value="not_task">Não é tarefa</option></select>
      <label class="field-label">Título</label><input id="dnCorrectTitle" class="field-input" value="${esc(item.titulo)}" maxlength="120" />
      <div class="dn-range-heading"><span>Prioridade</span><strong id="dnCorrectPriorityValue">${clamp(item.prioridade,0,10)}/10</strong></div>
      <input id="dnCorrectPriority" class="dn-range" type="range" min="0" max="10" step="1" value="${clamp(item.prioridade,0,10)}" />`;
    $('#dnCorrectPriority')?.addEventListener('input', (e) => $('#dnCorrectPriorityValue').textContent = `${e.target.value}/10`);
    $('#dnCorrectionLesson').value = '';
    $('#dnRememberCorrection').checked = false;
    $('#dnCorrectionDialog').showModal();
  }

  function openEmotionCorrection(index) {
    const item = lastResult?.emocoes?.[index]; if (!item) return;
    currentCorrection = { kind: 'emotion', index, before: { ...item } };
    $('#dnCorrectionTitle').textContent = 'Corrigir emoção';
    $('#dnCorrectionFields').innerHTML = `
      <label class="field-label">Emoção / estado</label><input id="dnCorrectEmotionName" class="field-input" value="${esc(item.nome)}" />
      <div class="dn-range-heading"><span>Intensidade</span><strong id="dnEmotionIntensityValue">${item.intensidade >= 0 ? item.intensidade : 5}/10</strong></div>
      <input id="dnEmotionIntensity" class="dn-range" type="range" min="0" max="10" value="${item.intensidade >= 0 ? item.intensidade : 5}" />
      <div class="dn-range-heading"><span>Relevância para mim</span><strong id="dnEmotionRelevanceValue">${clamp(item.relevancia,0,10)}/10</strong></div>
      <input id="dnEmotionRelevance" class="dn-range" type="range" min="0" max="10" value="${clamp(item.relevancia,0,10)}" />`;
    $('#dnEmotionIntensity')?.addEventListener('input', (e) => $('#dnEmotionIntensityValue').textContent = `${e.target.value}/10`);
    $('#dnEmotionRelevance')?.addEventListener('input', (e) => $('#dnEmotionRelevanceValue').textContent = `${e.target.value}/10`);
    $('#dnCorrectionLesson').value = '';
    $('#dnRememberCorrection').checked = false;
    $('#dnCorrectionDialog').showModal();
  }

  function fallbackLesson(kind, before, after) {
    if (kind === 'task') {
      if (after.kind === 'not_task') return `Em situações parecidas com “${before.titulo || 'este caso'}”, não presumir automaticamente que isso é uma tarefa.`;
      const titlePart = before.titulo && before.titulo !== after.title ? ` Entender que “${before.titulo}” pode significar “${after.title}”.` : '';
      return `Em situações parecidas com “${after.title || before.titulo || 'esta tarefa'}”, considerar prioridade ${after.priority}/10.${titlePart}`;
    }
    if (kind === 'emotion') return `Quando eu relatar algo parecido com “${before.nome || 'este estado'}”, considerar que para mim isso pode significar “${after.nome}”, com relevância próxima de ${after.relevancia}/10.`;
    if (kind === 'session') return `Em sessões parecidas, não insistir automaticamente no passo “${before?.instrucao || 'este passo'}”; reavaliar a situação antes de orientar.`;
    return '';
  }

  async function saveCorrection(event) {
    event.preventDefault(); if (!currentCorrection) return;
    const remember = $('#dnRememberCorrection').checked;
    const writtenLesson = $('#dnCorrectionLesson').value.trim();
    try {
      if (currentCorrection.kind === 'task') {
        const kind = $('#dnCorrectKind').value;
        const title = $('#dnCorrectTitle').value.trim();
        const priority = Number($('#dnCorrectPriority').value);
        const after = { kind, title, priority };
        const lesson = remember ? (writtenLesson || fallbackLesson('task', currentCorrection.before, after)) : writtenLesson;
        if (kind === 'not_task') {
          if (currentCorrection.taskId && window.DN_APP_API?.deleteTask) await window.DN_APP_API.deleteTask(currentCorrection.taskId);
        } else if (currentCorrection.taskId && window.DN_APP_API?.editTask) {
          await window.DN_APP_API.editTask(currentCorrection.taskId, { title, priority, corrected_by_user: true });
        }
        await recordEvent('correcao_ia', { kind: 'task', before: currentCorrection.before, after, remember, lesson, corrected_at: new Date().toISOString() });
      } else if (currentCorrection.kind === 'emotion') {
        const after = { nome: $('#dnCorrectEmotionName').value.trim(), intensidade: Number($('#dnEmotionIntensity').value), relevancia: Number($('#dnEmotionRelevance').value) };
        const lesson = remember ? (writtenLesson || fallbackLesson('emotion', currentCorrection.before, after)) : writtenLesson;
        await recordEvent('emocao_corrigida', { emotion_id: currentCorrection.before.__emotionId || uid('emc'), before: currentCorrection.before, ...after, corrected_at: new Date().toISOString() });
        await recordEvent('correcao_ia', { kind: 'emotion', before: currentCorrection.before, after, remember, lesson, corrected_at: new Date().toISOString() });
      } else if (currentCorrection.kind === 'session') {
        const after = { skipped: true };
        const lesson = remember ? (writtenLesson || fallbackLesson('session', currentCorrection.before, after)) : writtenLesson;
        await recordEvent('correcao_ia', { kind: 'session_step', before: currentCorrection.before, after, remember, lesson, corrected_at: new Date().toISOString() });
        advanceSession();
      }
      await loadLearnedContext(); await loadRecentEmotions();
      $('#dnCorrectionDialog').close();
      setStatus(remember ? 'Correção salva e lembrada para situações parecidas.' : 'Correção salva só para este caso.', 'ok');
    } catch (error) { $('#dnCorrectionLesson').setCustomValidity(error?.message || String(error)); $('#dnCorrectionLesson').reportValidity(); $('#dnCorrectionLesson').setCustomValidity(''); }
  }

  async function saveTeaching() {
    const text = $('#dnTeachText').value.trim(); if (!text) return setStatus('Escreva o que eu devo aprender.', 'warn');
    try {
      await recordEvent('memoria_ia', { texto: text, tipo: $('#dnTeachType').value, created_at: new Date().toISOString(), source: 'usuario' });
      $('#dnTeachText').value = ''; await loadLearnedContext(); setStatus('Aprendido. Vou usar isso nas próximas interpretações.', 'ok');
    } catch (error) { setStatus(error?.message || String(error), 'error'); }
  }

  function updatePhotoInfo() {
    const files = [...($('#dnPhotoInput')?.files || [])];
    if (!files.length) return $('#dnPhotoInfo').textContent = 'Nenhuma foto selecionada.';
    const shown = Math.min(files.length, MAX_PHOTOS);
    $('#dnPhotoInfo').textContent = files.length > MAX_PHOTOS ? `${files.length} escolhidas · vou usar as primeiras ${MAX_PHOTOS} nesta análise.` : `${shown} foto${shown > 1 ? 's' : ''} selecionada${shown > 1 ? 's' : ''}.`;
  }

  async function loadImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Não consegui abrir uma das fotos.')); img.src = url; });
      return img;
    } finally { /* revoked after draw by caller would invalidate image; browser keeps decoded data */ setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }

  function drawContain(ctx, img, x, y, w, h) {
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    ctx.drawImage(img, x + (w-dw)/2, y + (h-dh)/2, dw, dh);
  }

  async function prepareImages(files) {
    const imgs = await Promise.all(files.map(loadImage));
    const canvas = document.createElement('canvas');
    if (imgs.length === 1) {
      const img = imgs[0], max = 1440, scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    } else {
      const size = 1600, gap = 10; canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f4f4f4'; ctx.fillRect(0,0,size,size);
      const cells = imgs.length === 2
        ? [[0,0,size,(size-gap)/2],[0,(size+gap)/2,size,(size-gap)/2]]
        : [[0,0,(size-gap)/2,(size-gap)/2],[(size+gap)/2,0,(size-gap)/2,(size-gap)/2],[0,(size+gap)/2,(size-gap)/2,(size-gap)/2],[(size+gap)/2,(size+gap)/2,(size-gap)/2,(size-gap)/2]];
      imgs.forEach((img,i) => drawContain(ctx,img,...cells[i]));
    }
    let dataUrl = canvas.toDataURL('image/webp', .76);
    if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', .78);
    const bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * .75);
    return { dataUrl, bytes, width: canvas.width, height: canvas.height };
  }

  async function toggleRecording() {
    if (recorder?.state === 'recording') return recorder.stop();
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return setStatus('A gravação de voz não está disponível neste navegador.', 'error');
    try {
      recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true }); recorderChunks = [];
      recorder = new MediaRecorder(recorderStream);
      recorder.ondataavailable = (e) => { if (e.data?.size) recorderChunks.push(e.data); };
      recorder.onstop = transcribeRecording;
      recorder.start();
      $('#dnRecordVoice').classList.add('recording'); $('#dnRecordVoice').innerHTML = `${icon('xmark.circle.fill')}<span>Parar e interpretar</span>`;
      $('#dnVoiceStatus').textContent = 'Gravando… fale do seu jeito.';
    } catch (error) { setStatus('Não consegui acessar o microfone.', 'error'); }
  }

  async function transcribeRecording() {
    $('#dnRecordVoice').classList.remove('recording'); $('#dnRecordVoice').innerHTML = `${icon('microphone.fill')}<span>Começar a falar</span>`;
    recorderStream?.getTracks().forEach((t) => t.stop());
    const blob = new Blob(recorderChunks, { type: recorder?.mimeType || 'audio/mp4' });
    $('#dnVoiceStatus').textContent = 'Transcrevendo…';
    try {
      const base64 = await blobToBase64(blob);
      await ensureSession();
      const { data, error } = await client.functions.invoke('transcrever-audio', { body: { audio_base64: base64, mime: blob.type || 'audio/mp4' } });
      if (error) throw error;
      const text = String(data?.text || '').trim();
      if (!text) throw new Error('A transcrição veio vazia.');
      $('#dnVoiceStatus').textContent = `“${text}”`;
      await analyzeText(text, 'audio_ia');
    } catch (error) { $('#dnVoiceStatus').textContent = error?.message || String(error); }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader(); r.onerror = reject; r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.readAsDataURL(blob);
    });
  }

  const COPILOT_MICROCOPY_FALLBACK = [
    'Eu tô aqui pra ajudar você.',
    'Vamos escolher uma coisa de cada vez.',
    'Se estiver difícil começar, eu escolho por você.'
  ];

  let COPILOT_MICROCOPY = [...COPILOT_MICROCOPY_FALLBACK];

  async function loadCopilotMicrocopyLibrary() {
    const clean = (values) =>
      (Array.isArray(values) ? values : [])
        .map(value => String(value || '').trim())
        .filter(Boolean);

    /* 1º: tenta frases personalizadas da conta Supabase */
    try {
      const appClient = window.DN_APP_API?.getClient?.();
      const appSession = window.DN_APP_API?.getSession?.();

      let custom = clean(
        appSession?.user?.user_metadata?.dn_copilot_phrases
      );

      if (!custom.length && appClient) {
        const { data, error } = await appClient.auth.getUser();

        if (error) throw error;

        custom = clean(
          data?.user?.user_metadata?.dn_copilot_phrases
        );
      }

      if (custom.length) {
        COPILOT_MICROCOPY = custom;
        return;
      }
    } catch (error) {
      console.warn(
        'Copiloto: não foi possível carregar frases da conta.',
        error
      );
    }

    /* 2º: fallback para o arquivo TXT */
    try {
      const response = await fetch(
        'copiloto-frases.txt',
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('biblioteca padrão não encontrada');
      }

      const text = await response.text();

      const phrases = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line =>
          line &&
          !line.startsWith('#')
        );

      if (phrases.length) {
        COPILOT_MICROCOPY = phrases;
      }
    } catch (error) {
      console.warn(
        'Copiloto: usando frases de fallback.',
        error
      );
    }
  }

  let microcopyIndex = Math.floor(Math.random() * COPILOT_MICROCOPY.length);
  let motionTimer = null;
  let microcopyTimer = null;

  function setCopilotMicrocopy(text = '') {
    const el = $('#dnCopilotMicrocopy');
    if (!el) return;
    el.classList.add('changing');
    setTimeout(() => {
      el.textContent = text || COPILOT_MICROCOPY[microcopyIndex % COPILOT_MICROCOPY.length];
      el.classList.remove('changing');
    }, 160);
  }

  function scheduleMicrocopy() {
    clearTimeout(microcopyTimer);
    const delay = 14000 + Math.random() * 14000;
    microcopyTimer = setTimeout(() => {
      microcopyIndex = (microcopyIndex + 1 + Math.floor(Math.random() * 2)) % COPILOT_MICROCOPY.length;
      setCopilotMicrocopy();
      scheduleMicrocopy();
    }, delay);
  }

  function scheduleCopilotMotion() {
    clearTimeout(motionTimer);
    const button = $('#dnChooseNow');
    if (!button) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      button.classList.add('dn-motion-soft-glow');
      return;
    }
    const intensity = button.dataset.intensity || 'medium';
    const ranges = intensity === 'high' ? [2800, 5200] : intensity === 'low' ? [6500, 11000] : [4200, 8200];
    const delay = ranges[0] + Math.random() * (ranges[1] - ranges[0]);
    motionTimer = setTimeout(() => {
      const moves = intensity === 'high'
        ? ['dn-motion-nudge','dn-motion-glow','dn-motion-hop','dn-motion-wiggle']
        : ['dn-motion-nudge','dn-motion-glow','dn-motion-breathe'];
      const move = moves[Math.floor(Math.random() * moves.length)];
      button.classList.add(move);
      setTimeout(() => button.classList.remove(move), move === 'dn-motion-glow' ? 1500 : 900);
      scheduleCopilotMotion();
    }, delay);
  }

  function setCopilotIntensity(priority = 5) {
    const button = $('#dnChooseNow');
    if (!button) return;
    button.dataset.intensity = priority >= 8 ? 'high' : priority <= 3 ? 'low' : 'medium';
    scheduleCopilotMotion();
  }

  async function chooseNow() {
    const button = $('#dnChooseNow'); setBusy(button, true, 'Escolhendo…');
    try {
      await loadLearnedContext(); await loadRecentEmotions();
      const tasks = (window.DN_APP_API?.getTasks?.() || []).filter((t) => t.status !== 'done' && !skipOnce.has(t.id)).map((t) => ({ id: t.id, title: t.title, priority: t.priority ?? 5, reason: t.priority_reason || '', area: t.area || '', effort: t.effort || 'media', due: t.due || '', status: t.status }));
      const result = await invokeCopilot({ modo: 'decidir_agora', tarefas: tasks, emocoes: recentEmotions.slice(0,8), agora: new Date().toISOString() });
      renderNextAction(result);
    } catch (error) { renderNextAction({ titulo: 'Não consegui escolher agora', prioridade: 0, motivo: error?.message || String(error), primeiro_passo: 'Tente novamente.', tipo: 'nenhuma', task_id: '' }); }
    finally { setBusy(button, false); }
  }

  function renderNextAction(a) {
    const box = $('#dnNextAction'); if (!box) return;
    const priority = clamp(a.prioridade,0,10);
    box.hidden = false;
    $('#dnCopilotIdle')?.setAttribute('hidden','');
    box.dataset.taskId = a.task_id || ''; box.dataset.title = a.titulo || ''; box.dataset.priority = String(priority);
    box.innerHTML = `<div class="dn-next-copy"><div class="dn-next-topline"><span class="dn-next-type">${esc(a.tipo || 'ação')}</span><span class="dn-priority-pill">Prioridade ${priority}/10</span></div><strong>${esc(a.titulo || 'Sem ação agora')}</strong><p>${esc(a.primeiro_passo || '')}</p><small>${esc(a.motivo || '')}</small></div><div class="dn-next-buttons"><button type="button" data-next-done>${icon('checkmark.circle.fill')}<span>Fiz</span></button><button type="button" data-next-other>${icon('clock.fill')}<span>Outra</span></button></div>`;
    setCopilotIntensity(priority);
  }

  async function handleNextActionClick(event) {
    const box = $('#dnNextAction');
    if (event.target.closest('[data-next-done]')) {
      const id = box?.dataset.taskId;
      const title = box?.dataset.title || 'uma tarefa';
      const priority = Number(box?.dataset.priority || 0);
      if (id && window.DN_APP_API?.completeTask) await window.DN_APP_API.completeTask(id);
      box.innerHTML = `<div class="dn-next-copy dn-next-done-copy"><span class="dn-done-icon">${icon('checkmark.circle.fill')}</span><div><strong>Feito.</strong><span>Quando quiser, escolho a próxima.</span></div></div>`; setCopilotMicrocopy('Boa. Uma coisa a menos na sua cabeça.'); setCopilotIntensity(3);
      if (priority >= 7) setTimeout(() => maybePromptMood({ reason: 'tarefa_importante_concluida', context: title }), 450);
    }
    if (event.target.closest('[data-next-other]')) {
      const id = box?.dataset.taskId; if (id) skipOnce.add(id); await chooseNow(); setTimeout(() => skipOnce.delete(id), 60000);
    }
  }

  function renderActiveSession() {
    const box = $('#dnActiveSession'); if (!box) return;
    if (!activeSession?.steps?.length || activeSession.index >= activeSession.steps.length) { box.hidden = true; return; }
    const step = activeSession.steps[activeSession.index];
    box.hidden = false;
    box.innerHTML = `<div class="dn-session-label">${icon('house.fill')}<span>${esc(activeSession.title)}</span><b>${activeSession.index + 1}/${activeSession.steps.length}</b></div><strong>${esc(step.instrucao)}</strong><p>${esc(step.motivo || '')}</p><div class="dn-session-actions"><button type="button" data-session-done>${icon('checkmark.circle.fill')}<span>Feito</span></button><button type="button" data-session-later>${icon('clock.fill')}<span>Depois</span></button><button type="button" data-session-wrong>${icon('pencil')}<span>Não é isso</span></button></div>`;
  }

  async function handleSessionClick(event) {
    if (event.target.closest('[data-session-done]')) return advanceSession(true);
    if (event.target.closest('[data-session-later]')) {
      if (!activeSession || activeSession.steps.length < 2) return;
      const current = activeSession.steps.splice(activeSession.index,1)[0]; activeSession.steps.push(current); writeJson(SESSION_KEY, activeSession); renderActiveSession(); return;
    }
    if (event.target.closest('[data-session-wrong]')) {
      const step = activeSession?.steps?.[activeSession.index]; if (!step) return;
      currentCorrection = { kind: 'session', before: { session: activeSession.title, step } };
      $('#dnCorrectionTitle').textContent = 'Corrigir esta orientação';
      $('#dnCorrectionFields').innerHTML = `<div class="dn-correction-preview">${esc(step.instrucao)}</div>`;
      $('#dnCorrectionLesson').value = ''; $('#dnRememberCorrection').checked = true; $('#dnCorrectionDialog').showModal();
    }
  }

  async function advanceSession(done = false) {
    if (!activeSession) return;
    if (done) {
      try { await recordEvent('sessao_passo_concluido', { session_id: activeSession.id, step_index: activeSession.index, step: activeSession.steps[activeSession.index], at: new Date().toISOString() }); } catch {}
    }
    activeSession.index += 1;
    if (activeSession.index >= activeSession.steps.length) {
      const completedTitle = activeSession.title;
      try { await recordEvent('sessao_guiada_concluida', { session_id: activeSession.id, title: activeSession.title, completed_at: new Date().toISOString() }); } catch {}
      localStorage.removeItem(SESSION_KEY); activeSession = null;
      setTimeout(() => maybePromptMood({ reason: 'sessao_guiada_concluida', context: completedTitle }), 450);
    } else writeJson(SESSION_KEY, activeSession);
    renderActiveSession();
  }

  function lastMoodPromptAt() {
    const n = Number(localStorage.getItem(MOOD_PROMPT_KEY) || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function setMoodPromptNow() {
    try { localStorage.setItem(MOOD_PROMPT_KEY, String(Date.now())); } catch {}
  }

  function lastEmotionAt() {
    const values = recentEmotions.map((e) => new Date(e.at || e.recorded_at || e.corrected_at || 0).getTime()).filter(Number.isFinite);
    return values.length ? Math.max(...values) : 0;
  }

  async function maybePromptMood({ reason = 'tempo_sem_checkin', context = '', force = false } = {}) {
    if (!force && Date.now() - lastMoodPromptAt() < MOOD_COOLDOWN_MS) return false;
    if (reason === 'tempo_sem_checkin') {
      await loadRecentEmotions();
      const last = lastEmotionAt();
      if (last && Date.now() - last < MOOD_STALE_MS) return false;
    }
    const dialog = $('#dnMoodDialog');
    if (!dialog || dialog.open) return false;
    dialog.dataset.reason = reason;
    dialog.dataset.context = context || '';
    const copy = $('#dnMoodPromptText');
    if (copy) {
      if (reason === 'tarefa_importante_concluida') copy.textContent = `Você acabou de concluir “${context}”. Como isso te deixou?`;
      else if (reason === 'sessao_guiada_concluida') copy.textContent = `Você terminou “${context}”. Quero entender como você ficou depois disso.`;
      else copy.textContent = 'Faz um tempo que você não me conta como está. Como você está agora?';
    }
    setMoodPromptNow();
    dialog.showModal();
    try { await recordEvent('checkin_humor_perguntado', { reason, context, asked_at: new Date().toISOString() }); } catch {}
    return true;
  }

  async function handleMoodClick(event) {
    const button = event.target.closest?.('[data-mood]');
    if (!button) return;
    const value = button.dataset.mood;
    const dialog = $('#dnMoodDialog');
    const reason = dialog?.dataset.reason || '';
    const context = dialog?.dataset.context || '';
    if (value === 'ignore') {
      try { await recordEvent('checkin_humor_ignorado', { reason, context, ignored_at: new Date().toISOString() }); } catch {}
      dialog?.close();
      return;
    }
    if (value === 'explain') {
      dialog?.close();
      openInput('text');
      const input = $('#dnTextInput');
      if (input && !input.value.trim()) {
        input.value = context ? `Depois de ${context}, eu estou me sentindo ` : 'Agora eu estou me sentindo ';
        setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 120);
      }
      return;
    }
    const labels = { better: 'melhor', same: 'igual', worse: 'pior' };
    const label = labels[value];
    if (!label) return;
    try {
      await recordEvent('checkin_humor_resposta', {
        variacao: label, reason, context, responded_at: new Date().toISOString(),
        note: 'Resposta relativa. Não inferir emoção específica nem causalidade sem outros dados.'
      });
      await loadRecentEmotions();
    } catch {}
    dialog?.close();
  }

  window.DN_COPILOT = {
    openInput,
    getRules: () => [...learnedRules],
    refreshRules: loadLearnedContext,
    chooseNow,
    checkMood: () => maybePromptMood({ force: true })
  };

  async function boot() {
    ensureUi();
    if (!config?.supabaseUrl || !config?.supabasePublishableKey || !sdk?.createClient) return;
    client = window.DN_APP_API?.getClient?.() || sdk.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    await Promise.allSettled([loadLearnedContext(), loadRecentEmotions()]);
    await loadCopilotMicrocopyLibrary();
    microcopyIndex = Math.floor(
      Math.random() * COPILOT_MICROCOPY.length
    );
    setCopilotMicrocopy();
    scheduleMicrocopy();
    scheduleCopilotMotion();
    setTimeout(() => maybePromptMood({ reason: 'tempo_sem_checkin' }), 1200);
  }


  /* DN_COPILOT_PHRASES_LIVE_SYNC_V1 */
  window.addEventListener(
    'dn:copilot-phrases-updated',
    (event) => {
      const next = (
        Array.isArray(event.detail?.phrases)
          ? event.detail.phrases
          : []
      )
        .map(value => String(value || '').trim())
        .filter(Boolean);

      if (!next.length) return;

      COPILOT_MICROCOPY = next;

      microcopyIndex = Math.floor(
        Math.random() * COPILOT_MICROCOPY.length
      );

      setCopilotMicrocopy();
    }
  );

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
