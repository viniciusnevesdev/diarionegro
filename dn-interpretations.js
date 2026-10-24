/* DN_FEATURES_V081_INTERPRETATIONS */
(() => {
  'use strict';

  const CONTEXT_VERSION = '0.8.1';
  const AUTO_ACTION_CONFIDENCE = 0.85;

  function appClient() {
    return window.DN_APP_API?.getClient?.() || null;
  }

  async function currentSession(client = appClient()) {
    const known = window.DN_APP_API?.getSession?.();
    if (known?.user?.id) return known;
    if (!client) throw new Error('Supabase não disponível.');
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data?.session?.user?.id) throw new Error('Entre no Diário Negro primeiro.');
    return data.session;
  }

  function openTasks() {
    return (window.DN_APP_API?.getTasks?.() || [])
      .filter((task) => task?.id && task.status !== 'done' && !task.deleted)
      .map((task) => ({
        id: String(task.id),
        title: String(task.title || ''),
        status: String(task.status || 'open'),
        priority: Number(task.priority ?? 5),
        reason: String(task.priority_reason || ''),
        area: String(task.area || ''),
        due: String(task.due || ''),
        effort: String(task.effort || 'media')
      }));
  }

  function requestContext() {
    return {
      tarefas: openTasks(),
      agora: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    };
  }

  async function load(recordId, client = appClient()) {
    const cleanRecordId = String(recordId || '').trim();
    if (!cleanRecordId) return null;
    const session = await currentSession(client);
    const { data, error } = await client
      .from('interpretacoes')
      .select('id,record_id,resumo,categoria,subcategoria,intencao,dados_json,origem,modelo,context_version,efeitos_aplicados_em,created_at,updated_at')
      .eq('user_id', session.user.id)
      .eq('record_id', cleanRecordId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function persist(recordId, interpretation, options = {}, client = appClient()) {
    const cleanRecordId = String(recordId || '').trim();
    if (!cleanRecordId) throw new Error('Não é possível salvar uma interpretação sem registro de origem.');
    if (!interpretation || typeof interpretation !== 'object') throw new Error('Interpretação inválida.');
    const session = await currentSession(client);
    const now = new Date().toISOString();
    const row = {
      user_id: session.user.id,
      record_id: cleanRecordId,
      resumo: String(interpretation.resumo || ''),
      categoria: String(interpretation.categoria || ''),
      subcategoria: String(interpretation.subcategoria || ''),
      intencao: String(interpretation.intencao || interpretation.tipo || ''),
      dados_json: interpretation,
      origem: String(options.origem || 'copiloto'),
      modelo: options.modelo ? String(options.modelo) : null,
      context_version: CONTEXT_VERSION,
      efeitos_aplicados_em: options.effectsApplied ? now : null,
      updated_at: now
    };
    const { data, error } = await client
      .from('interpretacoes')
      .upsert(row, { onConflict: 'user_id,record_id' })
      .select('id,record_id,efeitos_aplicados_em,updated_at')
      .single();
    if (error) throw error;
    return data;
  }

  function planTaskActions(interpretation, tasks = openTasks()) {
    const available = new Map(tasks.map((task) => [String(task.id), task]));
    const touched = new Set();
    return (interpretation?.acoes_tarefas || []).map((proposal) => {
      const taskId = String(proposal?.task_id || '').trim();
      const action = String(proposal?.acao || '').trim();
      const confidence = Number(proposal?.confianca || 0);
      const validAction = ['iniciar', 'concluir', 'editar'].includes(action);
      const validEdit = action !== 'editar' || Boolean(String(proposal?.novo_titulo || '').trim());
      const valid = available.has(taskId) && !touched.has(taskId) && confidence >= AUTO_ACTION_CONFIDENCE && validAction && validEdit;
      if (valid) touched.add(taskId);
      return { proposal, taskId, action, confidence, valid };
    });
  }

  async function applyTaskActions(interpretation) {
    const outcomes = [];

    for (const plan of planTaskActions(interpretation)) {
      const { proposal, taskId, action, confidence } = plan;
      if (!plan.valid) {
        outcomes.push({ taskId, action, applied: false, reason: 'Ação não passou pela validação conservadora.' });
        continue;
      }

      try {
        if (action === 'iniciar' && window.DN_APP_API?.startTask) {
          await window.DN_APP_API.startTask(taskId);
        } else if (action === 'concluir' && window.DN_APP_API?.completeTask) {
          await window.DN_APP_API.completeTask(taskId);
        } else if (action === 'editar' && window.DN_APP_API?.editTask) {
          await window.DN_APP_API.editTask(taskId, {
            title: String(proposal.novo_titulo).trim(),
            source: 'ia',
            confidence,
            evidence: String(proposal.evidencia || '')
          });
        } else {
          outcomes.push({ taskId, action, applied: false, reason: 'Ação ou dados de edição inválidos.' });
          continue;
        }
        outcomes.push({ taskId, action, applied: true });
      } catch (error) {
        outcomes.push({ taskId, action, applied: false, reason: error?.message || String(error) });
      }
    }
    return outcomes;
  }

  window.DN_INTERPRETATIONS = {
    CONTEXT_VERSION,
    AUTO_ACTION_CONFIDENCE,
    openTasks,
    requestContext,
    load,
    persist,
    planTaskActions,
    applyTaskActions
  };
})();
