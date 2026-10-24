/* DN_FEATURES_V082_MEMORY_GOVERNANCE */
(() => {
  'use strict';

  const PAGE_SIZE = 30;
  const EXPORT_VERSION = 'diario-negro-memorias-v1';
  const ACTIVE_STATUSES = ['ativa'];
  const TYPES = [
    ['fato_pessoal', 'Fato pessoal'], ['preferencia', 'Preferência'],
    ['regra_pessoal', 'Regra pessoal'], ['objeto_lugar', 'Objeto / lugar'],
    ['rotina', 'Rotina'], ['trabalho', 'Trabalho'], ['social', 'Social'],
    ['dinheiro', 'Dinheiro'], ['casa', 'Casa'], ['saude_contextual', 'Saúde contextual'],
    ['significado_pessoal', 'Significado pessoal'], ['relacao', 'Relação'],
    ['contexto_vida', 'Contexto de vida'], ['outro', 'Outro']
  ];
  const ORIGINS = {
    ensinado_explicitamente: 'Ensinado por você',
    correcao_explicitamente_lembrada: 'Correção lembrada',
    registro_declaracao_clara: 'Declaração em registro',
    inferencia_ia_confirmada: 'Inferência da IA confirmada',
    inferencia_ia_nao_confirmada: 'Inferência aguardando confirmação',
    migrada_sistema_antigo: 'Migrada do sistema anterior',
    importada: 'Importada', outra: 'Outra origem'
  };
  const STATUSES = {
    ativa: 'Ativa', candidata: 'Candidata', aguardando_confirmacao: 'Aguardando confirmação',
    desativada: 'Desativada', substituida: 'Substituída', conflitante: 'Conflitante', excluida: 'Excluída'
  };
  const BASE_CONTEXT_RULES = [
    { title: 'Registros não são memórias', text: 'Acontecimentos e estados momentâneos permanecem na linha do tempo; só conhecimento reutilizável entra na memória.', source: 'Regra de produto · BASE_CONTEXT v0.8.2' },
    { title: 'Inferência pede confirmação', text: 'Uma inferência não confirmada não é tratada como verdade pessoal e não entra no contexto ativo.', source: 'Regra de produto · política de aprendizado' },
    { title: 'Sua correção prevalece', text: 'Ensino e correção explícitos do usuário têm prioridade sobre inferências e sinais indiretos.', source: 'Regra de produto · hierarquia de confiança' },
    { title: 'Transparência sem raciocínio oculto', text: 'A auditoria mostra fontes, regras e dados fornecidos ao modelo, mas não expõe raciocínio interno privado.', source: 'Regra de produto · explicabilidade' }
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const icon = (name, cls = '') => window.DN_SYMBOLS?.icon?.(name, cls) || '';

  function normalizeText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function hashString(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function fingerprint(value) {
    return hashString(normalizeText(value));
  }

  function canonicalKey(value, type = 'outro') {
    const raw = normalizeText(value);
    const ownedSubject = raw.match(/\b(?:meu|minha|meus|minhas)\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,2}?)\s+(?:fica|ficam|esta|estao|vai|vao|e|sao|na|no)\b/);
    if (ownedSubject) return `${type}:subject:${ownedSubject[1]}`;
    const normalized = raw
      .replace(/^(lembre que|eu quero que voce lembre que|nao esqueca que)\s+/, '')
      .replace(/^(eu|meu|minha|meus|minhas)\s+/, '')
      .replace(/\b(agora|atualmente|sempre)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const subject = normalized.split(/\b(?:fica|ficam|esta|estao|prefiro|gosto|trabalho|significa|e|sao)\b/)[0].trim();
    return `${type}:${(subject || normalized).split(' ').slice(0, 8).join(' ')}`;
  }

  function detectPotentialConflict(incoming, existing) {
    return Boolean(incoming && existing && incoming.fingerprint !== existing.fingerprint
      && incoming.canonical_key === existing.canonical_key
      && !existing.deleted_at && !existing.merged_into);
  }

  function sourceFingerprint(source = {}) {
    return hashString([source.record_id || '', source.relation_type || 'origem', source.source_excerpt || source.source_label || ''].join('|'));
  }

  function typeLabel(value) {
    return TYPES.find(([key]) => key === value)?.[1] || 'Outro';
  }

  function originLabel(value) { return ORIGINS[value] || 'Outra origem'; }
  function statusLabel(value) { return STATUSES[value] || value || '—'; }
  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function confidencePercent(value) {
    return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
  }

  function isUnavailableError(error) {
    return ['42P01', 'PGRST205', 'PGRST204'].includes(error?.code)
      || /relation .* does not exist|schema cache/i.test(String(error?.message || ''));
  }

  function appClient() { return window.DN_APP_API?.getClient?.() || null; }
  async function currentSession(client = appClient()) {
    const known = window.DN_APP_API?.getSession?.();
    if (known?.user?.id) return known;
    if (!client) throw new Error('Supabase não disponível.');
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data?.session?.user?.id) throw new Error('Entre no Diário Negro primeiro.');
    return data.session;
  }

  function sanitizedMemory(input = {}) {
    const text = String(input.texto || input.text || '').trim();
    if (!text) throw new Error('A memória precisa ter um texto.');
    const type = TYPES.some(([key]) => key === input.tipo) ? input.tipo : 'outro';
    const origin = ORIGINS[input.origem] ? input.origem : 'outra';
    const isUnconfirmedInference = origin === 'inferencia_ia_nao_confirmada';
    const confidence = Math.max(0, Math.min(1, Number(input.confidence_current ?? input.confianca ?? 0.5)));
    return {
      texto: text,
      titulo_curto: String(input.titulo_curto || '').trim() || null,
      tipo: type,
      categoria: String(input.categoria || typeLabel(type)).trim() || 'Outro',
      subcategoria: String(input.subcategoria || '').trim() || null,
      origem: origin,
      status: isUnconfirmedInference ? 'aguardando_confirmacao' : String(input.status || 'ativa'),
      ativa: isUnconfirmedInference ? false : input.ativa !== false,
      confirmed_by_user: isUnconfirmedInference ? false : Boolean(input.confirmed_by_user),
      confirmed_at: isUnconfirmedInference ? null : (input.confirmed_by_user ? (input.confirmed_at || new Date().toISOString()) : null),
      confianca: confidence,
      confidence_initial: Math.max(0, Math.min(1, Number(input.confidence_initial ?? confidence))),
      confidence_current: confidence,
      source_record_id: input.source_record_id ? String(input.source_record_id) : null,
      source_type: input.source_type ? String(input.source_type) : null,
      source_label: input.source_label ? String(input.source_label) : null,
      source_excerpt: input.source_excerpt ? String(input.source_excerpt).slice(0, 1000) : null,
      source_metadata: input.source_metadata && typeof input.source_metadata === 'object' ? input.source_metadata : {},
      first_learned_at: input.first_learned_at || new Date().toISOString(),
      fingerprint: fingerprint(text),
      canonical_key: canonicalKey(text, type),
      correction_reason: input.correction_reason ? String(input.correction_reason) : null,
      metadata_json: input.metadata_json && typeof input.metadata_json === 'object' ? input.metadata_json : {}
    };
  }

  function provenanceText(memory, sources = []) {
    const date = formatDate(memory.first_learned_at || memory.created_at);
    const first = sources.find((source) => source.relation_type === 'origem') || sources[0];
    if (memory.origem === 'ensinado_explicitamente') return `Você me ensinou isso em ${date} na área Ensinar.`;
    if (memory.origem === 'correcao_explicitamente_lembrada') return `Você pediu para lembrar esta correção em ${date}.`;
    if (memory.origem === 'registro_declaracao_clara') return `Aprendi isto a partir de um registro seu de ${date}${first?.source_excerpt ? `: “${first.source_excerpt}”` : '.'}`;
    if (memory.origem === 'inferencia_ia_confirmada') return `Eu inferi isto a partir de ${sources.length || 1} fonte(s), e você confirmou a conclusão${memory.confirmed_at ? ` em ${formatDate(memory.confirmed_at)}` : ''}.`;
    if (memory.origem === 'inferencia_ia_nao_confirmada') return 'Esta é uma inferência da IA ainda não confirmada. Ela não é usada como verdade pessoal.';
    if (memory.origem === 'migrada_sistema_antigo') return `Esta memória foi migrada do sistema anterior${first?.source_label ? ` (${first.source_label})` : ''}.`;
    if (memory.origem === 'importada') return `Esta memória entrou por uma importação revisada em ${date}.`;
    return `${originLabel(memory.origem)} em ${date}.`;
  }

  async function findDuplicate(memory, client, userId) {
    const { data, error } = await client.from('memorias').select('*')
      .eq('user_id', userId).eq('fingerprint', memory.fingerprint).is('deleted_at', null).is('merged_into', null).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function addSource(memoriaId, source = {}, client = appClient()) {
    const session = await currentSession(client);
    const row = {
      user_id: session.user.id, memoria_id: memoriaId,
      record_id: source.record_id ? String(source.record_id) : null,
      source_type: String(source.source_type || 'outra'),
      source_label: String(source.source_label || '').trim() || null,
      source_excerpt: String(source.source_excerpt || '').trim().slice(0, 1000) || null,
      relation_type: String(source.relation_type || 'origem'),
      confidence_contribution: source.confidence_contribution == null ? null : Number(source.confidence_contribution),
      fingerprint: sourceFingerprint(source),
      metadata_json: source.metadata_json && typeof source.metadata_json === 'object' ? source.metadata_json : {}
    };
    const { data, error } = await client.from('memoria_fontes').upsert(row, { onConflict: 'user_id,memoria_id,fingerprint', ignoreDuplicates: true }).select('*').maybeSingle();
    if (error && error.code !== '23505') throw error;
    return data || null;
  }

  async function create(input, options = {}, client = appClient()) {
    const session = await currentSession(client);
    const memory = sanitizedMemory(input);
    const duplicate = await findDuplicate(memory, client, session.user.id);
    if (duplicate) {
      if (options.source) await addSource(duplicate.id, { ...options.source, relation_type: options.source.relation_type || 'reforco' }, client);
      const nextConfidence = Math.max(Number(duplicate.confidence_current || 0), memory.confidence_current);
      const { data, error } = await client.from('memorias').update({
        last_reinforced_at: new Date().toISOString(), confidence_current: nextConfidence,
        confianca: nextConfidence, metadata_json: { ...(duplicate.metadata_json || {}), action_origin: 'deduplicacao' }
      }).eq('user_id', session.user.id).eq('id', duplicate.id).select('*').single();
      if (error) throw error;
      return { memory: data, duplicate: true };
    }
    const { data: collisions, error: collisionError } = await client.from('memorias').select('*')
      .eq('user_id', session.user.id).eq('canonical_key', memory.canonical_key).is('deleted_at', null).is('merged_into', null)
      .neq('fingerprint', memory.fingerprint).limit(1);
    if (collisionError) throw collisionError;
    const collision = (collisions || [])[0] || null;
    const explicitPriority = ['ensinado_explicitamente', 'correcao_explicitamente_lembrada'].includes(memory.origem);
    if (collision && !explicitPriority) { memory.status = 'conflitante'; memory.ativa = false; }
    if (collision && explicitPriority) memory.supersedes = collision.id;
    const { data, error } = await client.from('memorias').insert({ ...memory, user_id: session.user.id }).select('*').single();
    if (error) throw error;
    if (options.source) await addSource(data.id, options.source, client);
    if (collision && explicitPriority) {
      await update(collision.id, { status: 'substituida', ativa: false, superseded_by: data.id,
        metadata_json: { superseded_reason: 'Ensino ou correção explícita mais recente' } }, 'resolucao_automatica_prioridade', client);
    } else if (collision) {
      await addSource(data.id, { source_type: 'memoria_existente', source_label: 'Possível contradição',
        source_excerpt: collision.texto, relation_type: 'conflito', metadata_json: { conflicting_memory_id: collision.id } }, client);
    }
    return { memory: data, duplicate: false, conflict: collision || null };
  }

  async function createExplicit(text, details = {}, client = appClient()) {
    return create({ ...details, texto: text, origem: 'ensinado_explicitamente', status: 'ativa', ativa: true,
      confirmed_by_user: true, confianca: details.confianca ?? 1, confidence_initial: details.confidence_initial ?? 1 }, details, client);
  }

  async function createCorrection(text, details = {}, client = appClient()) {
    return create({ ...details, texto: text, origem: 'correcao_explicitamente_lembrada', status: 'ativa', ativa: true,
      confirmed_by_user: true, confianca: details.confianca ?? 1, confidence_initial: details.confidence_initial ?? 1 }, details, client);
  }

  async function createCandidate(text, details = {}, client = appClient()) {
    return create({ ...details, texto: text, origem: 'inferencia_ia_nao_confirmada', status: 'aguardando_confirmacao',
      ativa: false, confirmed_by_user: false, confianca: details.confianca ?? 0.5 }, details, client);
  }

  async function list(filters = {}, client = appClient()) {
    const session = await currentSession(client);
    const page = Math.max(0, Number(filters.page) || 0);
    let query = client.from('memorias').select('*', { count: 'exact' }).eq('user_id', session.user.id);
    if (filters.status) query = query.eq('status', filters.status);
    else if (!filters.includeDeleted) query = query.is('deleted_at', null);
    if (filters.category) query = query.eq('categoria', filters.category);
    if (filters.type) query = query.eq('tipo', filters.type);
    if (filters.origin) query = query.eq('origem', filters.origin);
    if (filters.confirmed === 'yes') query = query.eq('confirmed_by_user', true);
    if (filters.confirmed === 'no') query = query.eq('confirmed_by_user', false);
    if (filters.hasSource === 'yes') query = query.not('source_record_id', 'is', null);
    if (filters.hasSource === 'no') query = query.is('source_record_id', null);
    if (filters.minConfidence) query = query.gte('confidence_current', Number(filters.minConfidence));
    if (filters.dateFrom) query = query.gte('created_at', new Date(`${filters.dateFrom}T00:00:00`).toISOString());
    if (filters.dateTo) query = query.lte('created_at', new Date(`${filters.dateTo}T23:59:59`).toISOString());
    if (filters.search) {
      const term = String(filters.search).replace(/[,%()]/g, ' ').trim();
      if (term) query = query.or(`texto.ilike.%${term}%,titulo_curto.ilike.%${term}%,categoria.ilike.%${term}%,source_excerpt.ilike.%${term}%`);
    }
    const sort = filters.sort || 'updated_desc';
    const sortMap = {
      updated_desc: ['updated_at', false], newest: ['created_at', false], oldest: ['created_at', true],
      confidence_desc: ['confidence_current', false], confidence_asc: ['confidence_current', true],
      reinforced: ['last_reinforced_at', false], category: ['categoria', true]
    };
    const [column, ascending] = sortMap[sort] || sortMap.updated_desc;
    query = query.order(column, { ascending, nullsFirst: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    const { data, error, count } = await query;
    if (error) throw error;
    const ids = (data || []).map((item) => item.id);
    let sourceCounts = new Map();
    let usageCounts = new Map();
    if (ids.length) {
      const [sources, usages] = await Promise.all([
        client.from('memoria_fontes').select('memoria_id').eq('user_id', session.user.id).in('memoria_id', ids),
        client.from('memoria_usos').select('memoria_id').eq('user_id', session.user.id).in('memoria_id', ids)
      ]);
      if (sources.error) throw sources.error;
      if (usages.error) throw usages.error;
      for (const source of sources.data || []) sourceCounts.set(source.memoria_id, (sourceCounts.get(source.memoria_id) || 0) + 1);
      for (const usage of usages.data || []) usageCounts.set(usage.memoria_id, (usageCounts.get(usage.memoria_id) || 0) + 1);
    }
    return { data: (data || []).map((item) => ({ ...item, source_count: sourceCounts.get(item.id) || 0, usage_count: usageCounts.get(item.id) || 0 })), count: count || 0, page, pageSize: PAGE_SIZE };
  }

  async function summary(client = appClient()) {
    const session = await currentSession(client);
    const { data, error } = await client.from('memorias')
      .select('id,status,ativa,categoria,confidence_current,source_record_id,last_reinforced_at,created_at,updated_at,deleted_at')
      .eq('user_id', session.user.id).order('updated_at', { ascending: false }).limit(1000);
    if (error) throw error;
    const rows = data || [];
    const [sourceResult, usageResult] = await Promise.all([
      client.from('memoria_fontes').select('memoria_id').eq('user_id', session.user.id),
      client.from('memoria_usos').select('memoria_id').eq('user_id', session.user.id)
    ]);
    if (sourceResult.error) throw sourceResult.error;
    if (usageResult.error) throw usageResult.error;
    const withSources = new Set((sourceResult.data || []).map((item) => item.memoria_id));
    const withUses = new Set((usageResult.data || []).map((item) => item.memoria_id));
    const counts = { active: 0, pending: 0, disabled: 0, conflicts: 0, deleted: 0 };
    const categories = new Map();
    for (const row of rows) {
      if (row.deleted_at || row.status === 'excluida') counts.deleted += 1;
      else if (row.status === 'conflitante') counts.conflicts += 1;
      else if (['candidata', 'aguardando_confirmacao'].includes(row.status)) counts.pending += 1;
      else if (!row.ativa || row.status === 'desativada') counts.disabled += 1;
      else counts.active += 1;
      if (!row.deleted_at) categories.set(row.categoria, (categories.get(row.categoria) || 0) + 1);
    }
    const live = rows.filter((row) => !row.deleted_at);
    const staleCutoff = Date.now() - 180 * 86400000;
    return { ...counts, noSource: live.filter((row) => !row.source_record_id && !withSources.has(row.id)).length,
      lowConfidence: live.filter((row) => Number(row.confidence_current) < .5).length,
      neverUsed: live.filter((row) => !withUses.has(row.id)).length,
      stale: live.filter((row) => new Date(row.last_reinforced_at || row.created_at).getTime() < staleCutoff).length,
      categories: [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5), lastChanged: rows[0]?.updated_at || null,
      lastLearned: [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]?.created_at || null };
  }

  async function detail(id, client = appClient()) {
    const session = await currentSession(client);
    const [memory, sources, history, uses] = await Promise.all([
      client.from('memorias').select('*').eq('user_id', session.user.id).eq('id', id).single(),
      client.from('memoria_fontes').select('*').eq('user_id', session.user.id).eq('memoria_id', id).order('created_at'),
      client.from('memoria_historico').select('*').eq('user_id', session.user.id).eq('memoria_id', id).order('created_at', { ascending: false }).limit(100),
      client.from('memoria_usos').select('*').eq('user_id', session.user.id).eq('memoria_id', id).order('created_at', { ascending: false }).limit(50)
    ]);
    for (const response of [memory, sources, history, uses]) if (response.error) throw response.error;
    return { memory: memory.data, sources: sources.data || [], history: history.data || [], uses: uses.data || [] };
  }

  async function update(id, patch = {}, actionOrigin = 'usuario', client = appClient()) {
    const session = await currentSession(client);
    const allowed = ['texto', 'titulo_curto', 'tipo', 'categoria', 'subcategoria', 'origem', 'status', 'ativa', 'confirmed_by_user',
      'confirmed_at', 'confidence_current', 'confianca', 'disabled_at', 'disabled_reason', 'deleted_at', 'correction_reason',
      'superseded_by', 'supersedes', 'merged_into', 'metadata_json'];
    const safe = {};
    for (const key of allowed) if (Object.hasOwn(patch, key)) safe[key] = patch[key];
    if (safe.texto) {
      safe.fingerprint = fingerprint(safe.texto);
      safe.canonical_key = canonicalKey(safe.texto, safe.tipo || 'outro');
    }
    safe.metadata_json = { ...(patch.metadata_json || {}), action_origin: actionOrigin };
    const { data, error } = await client.from('memorias').update(safe).eq('user_id', session.user.id).eq('id', id).select('*').single();
    if (error) throw error;
    return data;
  }

  const confirm = (id, client) => update(id, { confirmed_by_user: true, confirmed_at: new Date().toISOString(), status: 'ativa', ativa: true }, 'confirmacao_usuario', client);
  const unconfirm = (id, client) => update(id, { confirmed_by_user: false, confirmed_at: null, status: 'aguardando_confirmacao', ativa: false }, 'desconfirmacao_usuario', client);
  const disable = (id, reason = '', client) => update(id, { status: 'desativada', ativa: false, disabled_at: new Date().toISOString(), disabled_reason: reason || null }, 'usuario', client);
  const reactivate = (id, client) => update(id, { status: 'ativa', ativa: true, disabled_at: null, disabled_reason: null, deleted_at: null }, 'usuario', client);
  const softDelete = (id, client) => update(id, { status: 'excluida', ativa: false, deleted_at: new Date().toISOString() }, 'usuario', client);
  const restore = (id, client) => update(id, { status: 'ativa', ativa: true, deleted_at: null, disabled_at: null }, 'usuario', client);

  async function permanentDelete(id, client = appClient()) {
    const session = await currentSession(client);
    const current = await detail(id, client);
    if (!current.memory.deleted_at) throw new Error('Mova a memória para a lixeira antes da exclusão permanente.');
    const { error } = await client.from('memorias').delete().eq('user_id', session.user.id).eq('id', id);
    if (error) throw error;
  }

  async function merge(canonicalId, duplicateId, client = appClient()) {
    if (canonicalId === duplicateId) throw new Error('Escolha duas memórias diferentes.');
    const [canonical, duplicate] = await Promise.all([detail(canonicalId, client), detail(duplicateId, client)]);
    for (const source of duplicate.sources) {
      await addSource(canonicalId, { ...source, relation_type: source.relation_type === 'origem' ? 'reforco' : source.relation_type }, client);
    }
    const bestConfidence = Math.max(Number(canonical.memory.confidence_current || 0), Number(duplicate.memory.confidence_current || 0));
    await update(canonicalId, { confidence_current: bestConfidence, confianca: bestConfidence, metadata_json: { merged_from: duplicateId } }, 'mesclagem_usuario', client);
    await update(duplicateId, { status: 'substituida', ativa: false, merged_into: canonicalId, metadata_json: { canonical_memory: canonicalId } }, 'mesclagem_usuario', client);
    return detail(canonicalId, client);
  }

  async function contextRules(options = {}, client = appClient()) {
    const session = await currentSession(client);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 60));
    const { data, error } = await client.from('memorias').select('id,texto,tipo,categoria,origem,confidence_current,updated_at')
      .eq('user_id', session.user.id).in('status', ACTIVE_STATUSES).eq('ativa', true).is('deleted_at', null)
      .is('merged_into', null).order('confidence_current', { ascending: false }).order('updated_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data || []).filter((item) => item.origem !== 'inferencia_ia_nao_confirmada');
  }

  async function recordUses(memoryIds, interactionId, mode = 'interpretar', metadata = {}, client = appClient()) {
    const ids = [...new Set((memoryIds || []).filter(Boolean))];
    if (!ids.length || !interactionId) return [];
    const session = await currentSession(client);
    const rows = ids.map((memoriaId) => ({ user_id: session.user.id, memoria_id: memoriaId,
      interaction_id: String(interactionId), mode: String(mode), metadata_json: metadata }));
    const { data, error } = await client.from('memoria_usos').upsert(rows, { onConflict: 'user_id,memoria_id,interaction_id,mode', ignoreDuplicates: true }).select('*');
    if (error) throw error;
    return data || [];
  }

  function exportMarkdown(payload) {
    const lines = ['# O que o Copiloto sabe sobre mim', '', `Exportado em ${formatDate(payload.exported_at)}.`, ''];
    for (const memory of payload.memories) {
      const sources = payload.sources.filter((source) => source.memoria_id === memory.id);
      lines.push(`## ${memory.titulo_curto || memory.texto}`, '', memory.texto, '',
        `- Categoria: ${memory.categoria}${memory.subcategoria ? ` / ${memory.subcategoria}` : ''}`,
        `- Tipo: ${typeLabel(memory.tipo)}`, `- Origem: ${originLabel(memory.origem)}`,
        `- Estado: ${statusLabel(memory.status)}`, `- Confiança: ${confidencePercent(memory.confidence_current)}`,
        `- Aprendida em: ${formatDate(memory.first_learned_at)}`, `- Por que sei: ${provenanceText(memory, sources)}`, '');
      if (sources.length) {
        lines.push('### Fontes', '');
        for (const source of sources) lines.push(`- ${formatDate(source.created_at)} · ${source.relation_type} · ${source.source_label || source.source_excerpt || source.record_id || 'Fonte sem rótulo'}`);
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  async function exportAll(client = appClient()) {
    const session = await currentSession(client);
    const tables = ['memorias', 'memoria_fontes', 'memoria_historico', 'memoria_usos'];
    const results = await Promise.all(tables.map((table) => client.from(table).select('*').eq('user_id', session.user.id)));
    for (const result of results) if (result.error) throw result.error;
    const payload = { format: EXPORT_VERSION, exported_at: new Date().toISOString(),
      memories: results[0].data || [], sources: results[1].data || [], history: results[2].data || [], usages: results[3].data || [] };
    return { payload, json: JSON.stringify(payload, null, 2), markdown: exportMarkdown(payload) };
  }

  function validateImport(payload) {
    const errors = [];
    if (!payload || typeof payload !== 'object') errors.push('O arquivo precisa conter um objeto JSON.');
    if (payload?.format !== EXPORT_VERSION) errors.push(`Formato incompatível. Esperado: ${EXPORT_VERSION}.`);
    if (!Array.isArray(payload?.memories)) errors.push('A lista memories é obrigatória.');
    const valid = [];
    for (const [index, memory] of (payload?.memories || []).entries()) {
      try { valid.push({ index, source: memory, normalized: sanitizedMemory({ ...memory, origem: 'importada' }) }); }
      catch (error) { errors.push(`Memória ${index + 1}: ${error.message}`); }
    }
    return { valid: errors.length === 0, errors, memories: valid, sourceCount: Array.isArray(payload?.sources) ? payload.sources.length : 0 };
  }

  async function previewImport(payload, client = appClient()) {
    const validation = validateImport(payload);
    if (!validation.valid) return { ...validation, duplicates: [], conflicts: [] };
    const session = await currentSession(client);
    const { data, error } = await client.from('memorias').select('id,texto,fingerprint,canonical_key,status')
      .eq('user_id', session.user.id).is('deleted_at', null);
    if (error) throw error;
    const byFingerprint = new Map((data || []).map((item) => [item.fingerprint, item]));
    const byCanonical = new Map((data || []).map((item) => [item.canonical_key, item]));
    const duplicates = [], conflicts = [], fresh = [];
    for (const item of validation.memories) {
      const duplicate = byFingerprint.get(item.normalized.fingerprint);
      const conflict = !duplicate && byCanonical.get(item.normalized.canonical_key);
      if (duplicate) duplicates.push({ incoming: item, existing: duplicate });
      else if (conflict) conflicts.push({ incoming: item, existing: conflict });
      else fresh.push(item);
    }
    return { ...validation, duplicates, conflicts, fresh };
  }

  async function importReviewed(payload, decisions = {}, client = appClient()) {
    const preview = await previewImport(payload, client);
    if (!preview.valid) throw new Error(preview.errors.join(' '));
    const sources = Array.isArray(payload.sources) ? payload.sources : [];
    const result = { imported: 0, merged: 0, ignored: 0 };
    for (const item of preview.memories) {
      const duplicate = preview.duplicates.find((entry) => entry.incoming.index === item.index);
      const conflict = preview.conflicts.find((entry) => entry.incoming.index === item.index);
      const decision = decisions[item.index] || (duplicate ? 'merge' : conflict ? 'ignore' : 'import');
      if (decision === 'ignore') { result.ignored += 1; continue; }
      if (decision === 'merge' && (duplicate || conflict)) {
        const target = (duplicate || conflict).existing;
        for (const source of sources.filter((entry) => entry.memoria_id === item.source.id)) await addSource(target.id, { ...source, relation_type: 'importacao' }, client);
        result.merged += 1; continue;
      }
      const created = await create({ ...item.normalized, origem: 'importada', metadata_json: { imported_from: item.source.id || null } }, {}, client);
      for (const source of sources.filter((entry) => entry.memoria_id === item.source.id)) await addSource(created.memory.id, { ...source, relation_type: 'importacao' }, client);
      result.imported += 1;
    }
    return result;
  }

  async function migrateLegacy(client = appClient()) {
    const session = await currentSession(client);
    const { data, error } = await client.from('registros').select('id,registrado_em,texto_original,entrada')
      .in('entrada', ['memoria_ia', 'correcao_ia']).order('registrado_em').limit(1000);
    if (error) throw error;
    const outcome = { migrated: 0, reinforced: 0, skipped: 0 };
    for (const row of data || []) {
      let payload = null;
      try { payload = JSON.parse(row.texto_original); } catch { outcome.skipped += 1; continue; }
      const text = row.entrada === 'memoria_ia' ? payload?.texto : (payload?.remember ? payload?.lesson : '');
      if (!text) { outcome.skipped += 1; continue; }
      const created = await create({ texto: text, tipo: row.entrada === 'correcao_ia' ? 'regra_pessoal' : (payload.tipo || 'outro'),
        origem: 'migrada_sistema_antigo', status: 'ativa', ativa: true, confirmed_by_user: true,
        confirmed_at: row.registrado_em, first_learned_at: row.registrado_em, confianca: 0.5, confidence_initial: 0.5,
        source_record_id: row.id, source_type: 'registro_legado', source_label: row.entrada,
        source_excerpt: text, metadata_json: { legacy_entry: row.entrada, action_origin: 'migracao_local' } }, {
        source: { record_id: row.id, source_type: 'registro_legado', source_label: row.entrada,
          source_excerpt: text, relation_type: 'origem', metadata_json: { migrated_at: new Date().toISOString() } }
      }, client);
      if (created.duplicate) outcome.reinforced += 1; else outcome.migrated += 1;
    }
    return outcome;
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  let state = { page: 0, count: 0, filters: { sort: 'updated_desc' }, selected: new Set(), unavailable: false };
  function ensureUi() {
    if ($('#dnMemoryPage')) return;
    const settingsCard = $('#openCopilotPhrases')?.closest('.dn-settings-card');
    if (settingsCard) settingsCard.insertAdjacentHTML('beforeend', `
      <button type="button" class="dn-settings-row" id="openMemoryGovernance">
        <span class="dn-settings-row-copy"><strong>O que o Copiloto sabe sobre mim</strong><small>Audite, corrija, desative e exporte suas memórias.</small></span><span class="dn-settings-chevron">›</span>
      </button>`);
    $('#accountDialog')?.insertAdjacentHTML('beforeend', `
      <section id="dnMemoryPage" class="dn-settings-page dn-memory-page" aria-label="O que o Copiloto sabe sobre mim" hidden>
        <header class="dn-settings-header"><button type="button" class="dn-settings-back" id="dnMemoryBack" aria-label="Voltar para Ajustes"><span class="dn-settings-back-icon">${icon('chevron.right')}</span></button><h1>Memória do Copiloto</h1><button type="button" class="dn-memory-header-action" id="dnMemoryTeach">+ Ensinar</button></header>
        <div class="dn-memory-scroll">
          <section id="dnMemorySummary" class="dn-memory-summary" aria-live="polite"></section>
          <section class="dn-memory-toolbar">
            <label class="dn-memory-search">${icon('magnifyingglass')}<input id="dnMemorySearch" type="search" placeholder="Buscar texto, categoria ou fonte" /></label>
            <div class="dn-memory-filter-row">
              <select id="dnMemoryStatus" aria-label="Filtrar por estado"><option value="">Todos os estados</option>${Object.entries(STATUSES).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>
              <select id="dnMemoryType" aria-label="Filtrar por tipo"><option value="">Todos os tipos</option>${TYPES.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>
              <select id="dnMemorySort" aria-label="Ordenar"><option value="updated_desc">Última alteração</option><option value="newest">Mais recente</option><option value="oldest">Mais antiga</option><option value="confidence_desc">Maior confiança</option><option value="confidence_asc">Menor confiança</option><option value="reinforced">Mais reforçada</option><option value="category">Categoria</option></select>
            </div>
            <details class="dn-memory-advanced-filters"><summary>Mais filtros</summary><div>
              <label>Categoria<input id="dnMemoryCategoryFilter" type="text" placeholder="Ex.: Casa"></label>
              <label>Origem<select id="dnMemoryOrigin"><option value="">Todas</option>${Object.entries(ORIGINS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
              <label>Confirmação<select id="dnMemoryConfirmed"><option value="">Todas</option><option value="yes">Confirmadas</option><option value="no">Não confirmadas</option></select></label>
              <label>Fonte<select id="dnMemoryHasSource"><option value="">Com ou sem fonte</option><option value="yes">Possui fonte</option><option value="no">Sem fonte</option></select></label>
              <label>Confiança mínima<select id="dnMemoryMinConfidence"><option value="">Qualquer</option><option value="0.25">25%</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="0.9">90%</option></select></label>
              <label>De<input id="dnMemoryDateFrom" type="date"></label><label>Até<input id="dnMemoryDateTo" type="date"></label>
            </div></details>
          </section>
          <div class="dn-memory-actions"><button id="dnMemoryExportJson">Exportar JSON</button><button id="dnMemoryExportMd">Exportar Markdown</button><label>Importar JSON<input id="dnMemoryImport" type="file" accept="application/json,.json" /></label><button id="dnMemoryMigrate">Migrar legado</button></div>
          <div id="dnMemoryStatusLine" class="dn-memory-status" role="status"></div>
          <div id="dnMemoryList" class="dn-memory-list"></div>
          <button id="dnMemoryMore" class="dn-memory-more" type="button" hidden>Carregar mais</button>
          <details class="dn-base-context"><summary>Contexto-base do Copiloto <span>regras de produto, separado das memórias</span></summary>${BASE_CONTEXT_RULES.map((rule) => `<article><strong>${esc(rule.title)}</strong><p>${esc(rule.text)}</p><small>${esc(rule.source)}</small></article>`).join('')}</details>
        </div>
      </section>`);
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="dnMemoryEditor" class="demo-dialog dn-memory-dialog"><form id="dnMemoryForm" class="demo-sheet dn-memory-sheet"><div class="sheet-handle"></div><h2 id="dnMemoryFormTitle">Ensinar algo</h2><input id="dnMemoryId" type="hidden"><label class="field-label">O que devo lembrar?</label><textarea id="dnMemoryText" class="field-input field-textarea" maxlength="2000" required></textarea><div class="dn-memory-two"><label><span class="field-label">Tipo</span><select id="dnMemoryFormType" class="field-input">${TYPES.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label><label><span class="field-label">Categoria</span><input id="dnMemoryCategory" class="field-input" value="Outro" maxlength="80"></label></div><label class="field-label">Motivo da correção (opcional)</label><input id="dnMemoryReason" class="field-input" maxlength="240"><div class="sheet-actions"><button type="button" class="secondary-btn" data-close-memory-editor>Cancelar</button><button type="submit" class="primary-btn">Salvar</button></div></form></dialog>
      <dialog id="dnMemoryDetail" class="demo-dialog dn-memory-dialog"><div class="demo-sheet dn-memory-sheet dn-memory-detail-sheet"><div class="sheet-handle"></div><div id="dnMemoryDetailBody"></div><button type="button" class="secondary-btn sheet-button" data-close-memory-detail>Fechar</button></div></dialog>
      <dialog id="dnMemoryImportPreview" class="demo-dialog dn-memory-dialog"><div class="demo-sheet dn-memory-sheet"><div class="sheet-handle"></div><h2>Revisar importação</h2><div id="dnMemoryImportBody"></div><div class="sheet-actions"><button type="button" class="secondary-btn" data-close-memory-import>Cancelar</button><button type="button" class="primary-btn" id="dnMemoryImportConfirm">Importar revisão</button></div></div></dialog>`);
  }

  function setUiStatus(message, kind = '') {
    const line = $('#dnMemoryStatusLine'); if (!line) return;
    line.textContent = message; line.dataset.kind = kind;
  }

  function cardHtml(memory) {
    return `<article class="dn-memory-card" data-memory-id="${esc(memory.id)}">
      <div class="dn-memory-card-top"><span>${esc(memory.categoria)}${memory.subcategoria ? ` · ${esc(memory.subcategoria)}` : ''}</span><span class="dn-memory-badge" data-status="${esc(memory.status)}">${esc(statusLabel(memory.status))}</span></div>
      <h3>${esc(memory.texto)}</h3><p>${esc(typeLabel(memory.tipo))} · ${esc(originLabel(memory.origem))}</p>
      <div class="dn-memory-meta"><span>Confiança ${confidencePercent(memory.confidence_current)}</span><span>${memory.confirmed_by_user ? 'Confirmada' : 'Não confirmada'}</span><span>${memory.source_count} fonte(s)</span></div>
      <div class="dn-memory-card-actions"><button type="button" data-memory-why>Por que você sabe disso?</button><button type="button" data-memory-sources>Onde isso apareceu?</button><button type="button" data-memory-open>Detalhes</button></div></article>`;
  }

  async function renderSummary() {
    const box = $('#dnMemorySummary');
    try {
      const value = await summary();
      box.innerHTML = `<div class="dn-memory-summary-main"><strong>${value.active}</strong><span>memórias ativas</span></div><div class="dn-memory-summary-grid"><span><b>${value.pending}</b> aguardando</span><span><b>${value.conflicts}</b> conflitos</span><span><b>${value.disabled}</b> desativadas</span><span><b>${value.deleted}</b> excluídas</span></div><p class="dn-memory-categories">${value.categories.map(([name, count]) => `${esc(name)} (${count})`).join(' · ') || 'Sem categorias ainda'}</p><details class="dn-memory-quality"><summary>Qualidade da memória</summary><div><span><b>${value.noSource}</b> sem fonte</span><span><b>${value.lowConfidence}</b> baixa confiança</span><span><b>${value.stale}</b> antigas sem reforço</span><span><b>${value.neverUsed}</b> nunca usadas</span></div></details><small>Última aprendida: ${formatDate(value.lastLearned)} · última alteração: ${formatDate(value.lastChanged)}</small>`;
    } catch (error) { handleUnavailable(error, box); }
  }

  function handleUnavailable(error, target = $('#dnMemoryList')) {
    if (isUnavailableError(error)) {
      state.unavailable = true;
      target.innerHTML = '<div class="dn-memory-empty"><strong>Estrutura pronta, ainda não ativada</strong><p>A migration local de memória precisa ser aplicada ao Supabase remoto com sua autorização. Até lá, o Copiloto continua usando o sistema legado.</p></div>';
      setUiStatus('Nenhuma alteração remota foi feita.', 'warn');
      return true;
    }
    return false;
  }

  async function renderList({ append = false } = {}) {
    const listEl = $('#dnMemoryList');
    if (!append) listEl.innerHTML = '<div class="dn-memory-loading">Carregando memórias…</div>';
    try {
      const result = await list({ ...state.filters, page: state.page, includeDeleted: state.filters.status === 'excluida' });
      state.count = result.count;
      const html = result.data.map(cardHtml).join('');
      if (append) listEl.insertAdjacentHTML('beforeend', html);
      else listEl.innerHTML = html || '<div class="dn-memory-empty"><strong>Nenhuma memória neste filtro.</strong><p>Você pode ensinar algo novo ou revisar outro estado.</p></div>';
      $('#dnMemoryMore').hidden = (state.page + 1) * PAGE_SIZE >= result.count;
      setUiStatus(`${result.count} memória${result.count === 1 ? '' : 's'} encontrada${result.count === 1 ? '' : 's'}.`);
    } catch (error) {
      if (!handleUnavailable(error, listEl)) setUiStatus(error?.message || String(error), 'error');
    }
  }

  async function openPage() {
    $('#settingsMainPage').hidden = true; $('#copilotPhrasesPage').hidden = true; $('#dnMemoryPage').hidden = false;
    document.documentElement.classList.add('dn-settings-subpage');
    state.page = 0; state.unavailable = false;
    await Promise.all([renderSummary(), renderList()]);
  }

  function closePage() {
    $('#dnMemoryPage').hidden = true; $('#settingsMainPage').hidden = false;
    document.documentElement.classList.remove('dn-settings-subpage');
  }

  function openEditor(memory = null) {
    $('#dnMemoryFormTitle').textContent = memory ? 'Editar memória' : 'Ensinar algo';
    $('#dnMemoryId').value = memory?.id || ''; $('#dnMemoryText').value = memory?.texto || '';
    $('#dnMemoryFormType').value = memory?.tipo || 'fato_pessoal'; $('#dnMemoryCategory').value = memory?.categoria || 'Outro';
    $('#dnMemoryReason').value = ''; $('#dnMemoryEditor').showModal();
  }

  async function renderDetail(id, section = 'all') {
    const body = $('#dnMemoryDetailBody'); body.innerHTML = '<div class="dn-memory-loading">Carregando detalhes…</div>';
    $('#dnMemoryDetail').showModal();
    try {
      const value = await detail(id); const { memory, sources, history, uses } = value;
      const sourcesHtml = sources.length ? sources.map((source) => `<article class="dn-memory-evidence"><b>${esc(source.relation_type)}</b><span>${esc(source.source_label || source.source_type)}</span><p>${esc(source.source_excerpt || 'Sem trecho salvo.')}</p><small>${formatDate(source.created_at)}</small>${source.record_id ? `<button data-open-record="${esc(source.record_id)}">Abrir registro original</button>` : ''}</article>`).join('') : '<p class="dn-memory-muted">Nenhuma fonte detalhada registrada.</p>';
      const historyHtml = history.length ? history.map((item) => `<li><b>${esc(statusLabel(item.acao).replaceAll('_', ' '))}</b><span>${formatDate(item.created_at)}</span>${item.motivo ? `<small>${esc(item.motivo)}</small>` : ''}</li>`).join('') : '<li>Nenhuma alteração registrada.</li>';
      body.innerHTML = `<div class="dn-memory-detail-heading"><span>${esc(memory.categoria)} · ${esc(typeLabel(memory.tipo))}</span><h2>${esc(memory.texto)}</h2><div class="dn-memory-meta"><span>${esc(statusLabel(memory.status))}</span><span>Confiança atual ${confidencePercent(memory.confidence_current)}</span><span>Original ${confidencePercent(memory.confidence_initial)}</span></div></div>
        <section class="dn-memory-detail-section" data-detail-section="why"><h3>Por que você sabe disso?</h3><p>${esc(provenanceText(memory, sources))}</p></section>
        <section class="dn-memory-detail-section" data-detail-section="sources"><h3>Onde isso apareceu?</h3>${sourcesHtml}</section>
        <section class="dn-memory-detail-section"><h3>Histórico auditável</h3><ol class="dn-memory-history">${historyHtml}</ol></section>
        <section class="dn-memory-detail-section"><h3>Uso pelo Copiloto</h3><p>${uses.length ? `${uses.length} uso(s). Último em ${formatDate(uses[0].created_at)}.` : 'Ainda não há uso registrado para esta memória.'}</p></section>
        <div class="dn-memory-detail-actions"><button data-action="edit">Editar / corrigir</button>${memory.confirmed_by_user ? '<button data-action="unconfirm">Desconfirmar</button>' : '<button data-action="confirm">Confirmar</button>'}${memory.status === 'conflitante' ? '<button data-action="resolve">Resolver conflito</button>' : ''}<button data-action="merge">Mesclar duplicata</button>${memory.ativa ? '<button data-action="disable">Desativar</button><button class="danger" data-action="incorrect">Marcar como incorreta</button>' : (!memory.deleted_at ? '<button data-action="reactivate">Reativar</button>' : '')}${memory.deleted_at ? '<button data-action="restore">Restaurar</button><button class="danger" data-action="permanent">Excluir permanentemente</button>' : '<button class="danger" data-action="delete">Excluir</button>'}</div>`;
      body.dataset.memoryId = memory.id; body.__memory = memory;
      if (section !== 'all') body.querySelector(`[data-detail-section="${section}"]`)?.scrollIntoView({ block: 'start' });
    } catch (error) { body.innerHTML = `<p class="form-error">${esc(error?.message || String(error))}</p>`; }
  }

  async function refreshUi() { state.page = 0; await Promise.all([renderSummary(), renderList()]); }

  function bindUi() {
    $('#openMemoryGovernance')?.addEventListener('click', openPage);
    $('#dnMemoryBack')?.addEventListener('click', closePage);
    $('#dnMemoryTeach')?.addEventListener('click', () => openEditor());
    $('[data-close-memory-editor]')?.addEventListener('click', () => $('#dnMemoryEditor').close());
    $('[data-close-memory-detail]')?.addEventListener('click', () => $('#dnMemoryDetail').close());
    $('[data-close-memory-import]')?.addEventListener('click', () => $('#dnMemoryImportPreview').close());
    let searchTimer;
    $('#dnMemorySearch')?.addEventListener('input', (event) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.filters.search = event.target.value; state.page = 0; renderList(); }, 250); });
    $('#dnMemoryStatus')?.addEventListener('change', (event) => { state.filters.status = event.target.value; state.page = 0; renderList(); });
    $('#dnMemoryType')?.addEventListener('change', (event) => { state.filters.type = event.target.value; state.page = 0; renderList(); });
    $('#dnMemorySort')?.addEventListener('change', (event) => { state.filters.sort = event.target.value; state.page = 0; renderList(); });
    for (const [selector, key] of [['#dnMemoryOrigin', 'origin'], ['#dnMemoryConfirmed', 'confirmed'], ['#dnMemoryHasSource', 'hasSource'], ['#dnMemoryMinConfidence', 'minConfidence'], ['#dnMemoryDateFrom', 'dateFrom'], ['#dnMemoryDateTo', 'dateTo']]) {
      $(selector)?.addEventListener('change', (event) => { state.filters[key] = event.target.value; state.page = 0; renderList(); });
    }
    let categoryTimer;
    $('#dnMemoryCategoryFilter')?.addEventListener('input', (event) => { clearTimeout(categoryTimer); categoryTimer = setTimeout(() => { state.filters.category = event.target.value.trim(); state.page = 0; renderList(); }, 250); });
    $('#dnMemoryMore')?.addEventListener('click', () => { state.page += 1; renderList({ append: true }); });
    $('#dnMemoryList')?.addEventListener('click', (event) => {
      const card = event.target.closest('[data-memory-id]'); if (!card) return;
      const section = event.target.closest('[data-memory-why]') ? 'why' : event.target.closest('[data-memory-sources]') ? 'sources' : 'all';
      renderDetail(card.dataset.memoryId, section);
    });
    $('#dnMemoryForm')?.addEventListener('submit', async (event) => {
      event.preventDefault(); const id = $('#dnMemoryId').value;
      try {
        if (id) await update(id, { texto: $('#dnMemoryText').value.trim(), tipo: $('#dnMemoryFormType').value,
          categoria: $('#dnMemoryCategory').value.trim() || 'Outro', correction_reason: $('#dnMemoryReason').value.trim() || null }, 'edicao_usuario');
        else await createExplicit($('#dnMemoryText').value, { tipo: $('#dnMemoryFormType').value, categoria: $('#dnMemoryCategory').value.trim() || 'Outro' });
        $('#dnMemoryEditor').close(); await refreshUi();
      } catch (error) { setUiStatus(error?.message || String(error), 'error'); }
    });
    $('#dnMemoryDetailBody')?.addEventListener('click', async (event) => {
      const record = event.target.closest('[data-open-record]');
      if (record) { window.dispatchEvent(new CustomEvent('dn:open-record', { detail: { recordId: record.dataset.openRecord } })); $('#dnMemoryDetail').close(); $('#accountDialog')?.close(); return; }
      const action = event.target.closest('[data-action]')?.dataset.action; if (!action) return;
      const body = $('#dnMemoryDetailBody'), id = body.dataset.memoryId, memory = body.__memory;
      try {
        if (action === 'edit') { $('#dnMemoryDetail').close(); return openEditor(memory); }
        if (action === 'confirm') await confirm(id);
        if (action === 'unconfirm') await unconfirm(id);
        if (action === 'resolve') await update(id, { status: 'ativa', ativa: true, confirmed_by_user: true, confirmed_at: new Date().toISOString() }, 'resolucao_conflito_usuario');
        if (action === 'merge') {
          const duplicateId = window.prompt('Cole o ID da memória duplicada que será incorporada nesta memória:');
          if (!duplicateId) return;
          await merge(id, duplicateId.trim());
        }
        if (action === 'disable') await disable(id, window.prompt('Motivo da desativação (opcional):') || '');
        if (action === 'incorrect') await update(id, { status: 'desativada', ativa: false, disabled_at: new Date().toISOString(), disabled_reason: 'Marcada como incorreta', correction_reason: 'Marcada como incorreta pelo usuário' }, 'usuario');
        if (action === 'reactivate') await reactivate(id);
        if (action === 'delete' && window.confirm('Mover esta memória para a lixeira? Ela deixará de ser usada pelo Copiloto.')) await softDelete(id);
        if (action === 'restore') await restore(id);
        if (action === 'permanent') {
          const answer = window.prompt('Esta ação não pode ser desfeita. Digite EXCLUIR para continuar.');
          if (answer !== 'EXCLUIR') return;
          await permanentDelete(id); $('#dnMemoryDetail').close(); await refreshUi(); return;
        }
        await renderDetail(id); await refreshUi();
      } catch (error) { window.alert(error?.message || String(error)); }
    });
    $('#dnMemoryExportJson')?.addEventListener('click', async () => { try { const value = await exportAll(); download(`diario-negro-memorias-${new Date().toISOString().slice(0, 10)}.json`, value.json, 'application/json'); } catch (error) { setUiStatus(error.message, 'error'); } });
    $('#dnMemoryExportMd')?.addEventListener('click', async () => { try { const value = await exportAll(); download(`diario-negro-memorias-${new Date().toISOString().slice(0, 10)}.md`, value.markdown, 'text/markdown'); } catch (error) { setUiStatus(error.message, 'error'); } });
    let pendingImport = null;
    $('#dnMemoryImport')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0]; if (!file) return;
      try {
        const payload = JSON.parse(await file.text()); const preview = await previewImport(payload); pendingImport = { payload, preview };
        $('#dnMemoryImportBody').innerHTML = preview.valid
          ? `<p><b>${preview.memories.length}</b> memórias no arquivo.</p><ul><li>${preview.fresh.length} novas</li><li>${preview.duplicates.length} duplicatas (serão mescladas)</li><li>${preview.conflicts.length} possíveis conflitos (serão ignorados para revisão manual)</li></ul><p>Nada será persistido antes de você confirmar.</p>`
          : `<p class="form-error">${preview.errors.map(esc).join('<br>')}</p>`;
        $('#dnMemoryImportConfirm').disabled = !preview.valid; $('#dnMemoryImportPreview').showModal();
      } catch (error) { setUiStatus(`Arquivo inválido: ${error.message}`, 'error'); }
      event.target.value = '';
    });
    $('#dnMemoryImportConfirm')?.addEventListener('click', async () => {
      if (!pendingImport?.preview?.valid) return;
      try { const result = await importReviewed(pendingImport.payload); $('#dnMemoryImportPreview').close(); setUiStatus(`${result.imported} importadas, ${result.merged} mescladas, ${result.ignored} ignoradas.`); await refreshUi(); }
      catch (error) { $('#dnMemoryImportBody').insertAdjacentHTML('beforeend', `<p class="form-error">${esc(error.message)}</p>`); }
    });
    $('#dnMemoryMigrate')?.addEventListener('click', async () => {
      if (!window.confirm('Preparar a migração dos registros de memória antigos? O processo deduplica e preserva as fontes.')) return;
      try { setUiStatus('Migrando memórias legadas…'); const result = await migrateLegacy(); setUiStatus(`${result.migrated} migradas, ${result.reinforced} reforçadas, ${result.skipped} ignoradas.`); await refreshUi(); }
      catch (error) { setUiStatus(error.message, 'error'); }
    });
  }

  window.DN_MEMORY = {
    EXPORT_VERSION, TYPES, ORIGINS, STATUSES, BASE_CONTEXT_RULES,
    normalizeText, fingerprint, canonicalKey, detectPotentialConflict, sanitizedMemory, provenanceText, isUnavailableError,
    create, createExplicit, createCorrection, createCandidate, addSource, list, summary, detail, update,
    confirm, unconfirm, disable, reactivate, softDelete, restore, permanentDelete, merge,
    contextRules, recordUses, exportAll, exportMarkdown, validateImport, previewImport, importReviewed, migrateLegacy,
    open: openPage, openDetail: renderDetail, refresh: refreshUi
  };

  function boot() { ensureUi(); bindUi(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
