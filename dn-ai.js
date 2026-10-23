/* DN_FEATURES_V07_AI_TIMELINE */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://htaflxymnkdretchfskn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_OF1PQ_zzWupc7ZKLuyuvGw_Uip5qGX5';
  const CACHE_PREFIX = 'dn-ai-v07:';
  let client = null;

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function cacheKey(id) {
    return CACHE_PREFIX + (id || 'sem-id');
  }

  function readCache(id) {
    try {
      const raw = localStorage.getItem(cacheKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeCache(id, value) {
    try {
      localStorage.setItem(cacheKey(id), JSON.stringify(value));
    } catch {}
  }

  function resultHtml(data) {
    if (!data) return '<div class="dn-ai-empty">Ainda não interpretado.</div>';
    if (!Array.isArray(data.tarefas) && data.tipo) {
      const category = [data.categoria, data.subcategoria].filter(Boolean).join(' › ');
      return `<div class="dn-ai-box"><div class="dn-ai-label">Resumo</div><div class="dn-ai-summary">${esc(data.resumo || '—')}</div></div><div class="dn-ai-grid"><div class="dn-ai-box"><div class="dn-ai-label">Categoria</div><div>${esc(category || '—')}</div></div><div class="dn-ai-box"><div class="dn-ai-label">Tipo</div><div>${esc(data.tipo || '—')}</div></div></div>`;
    }
    const tasks = Array.isArray(data.tarefas) ? data.tarefas : [];
    const emotions = Array.isArray(data.emocoes) ? data.emocoes : [];
    return `
      <div class="dn-ai-box"><div class="dn-ai-label">Resumo</div><div class="dn-ai-summary">${esc(data.resumo || '—')}</div></div>
      <div class="dn-ai-grid"><div class="dn-ai-box"><div class="dn-ai-label">Categoria</div><div>${esc(data.categoria || '—')}</div></div><div class="dn-ai-box"><div class="dn-ai-label">Intenção</div><div>${esc(data.intencao || '—')}</div></div></div>
      ${tasks.length ? `<div class="dn-ai-box"><div class="dn-ai-label">Tarefas detectadas</div>${tasks.map((t)=>`<div class="dn-ai-summary">${esc(t.titulo)} <b>${esc(t.prioridade)}/10</b></div>`).join('')}</div>` : ''}
      ${emotions.length ? `<div class="dn-ai-box"><div class="dn-ai-label">Estados emocionais</div><div class="dn-ai-chips">${emotions.map((e)=>`<span class="dn-ai-chip">${esc(e.nome)}</span>`).join('')}</div></div>` : ''}
      ${data.sessao?.ativa ? `<div class="dn-ai-box"><div class="dn-ai-label">Sessão guiada</div><div class="dn-ai-summary">${esc(data.sessao.titulo)} · ${data.sessao.passos?.length || 0} etapas</div></div>` : ''}`;
  }

  function getCardText(card) {
    return (card.querySelector('p')?.textContent || '').trim();
  }

  async function syncTaskIfNeeded(data, id, text, status) {
    const createTask = window.DN_APP_API?.createTaskFromAI;
    if (typeof createTask !== 'function') return;
    const items = Array.isArray(data?.tarefas) ? data.tarefas : (data?.tipo === 'tarefa' ? [{ titulo: data.resumo || text, prioridade: 5, motivo_prioridade: '', area: data.categoria || '', prazo: '', energia: 'media', duracao_min: 0, confianca: .6 }] : []);
    if (!items.length) return;
    let created = 0;
    for (let i = 0; i < items.length; i++) {
      const t = items[i];
      const outcome = await createTask({ sourceRecordId: id || null, taskKey: `${i}-${t.titulo}`, title: String(t.titulo || '').trim(), priority: t.prioridade ?? 5, priorityReason: t.motivo_prioridade || '', area: t.area || '', due: t.prazo || '', effort: t.energia || 'media', durationMin: t.duracao_min ?? null, confidence: t.confianca ?? null });
      if (outcome?.created) created++;
    }
    if (created) status.textContent = `Interpretação concluída. ${created} tarefa${created > 1 ? 's' : ''} adicionada${created > 1 ? 's' : ''}.`;
  }

  function ensureCardUi(card) {
    if (!card || card.querySelector('.dn-ai-wrap')) return;

    const id = card.dataset.recordId || card.getAttribute('data-record-id') || '';
    const cached = readCache(id);

    const wrap = document.createElement('div');
    wrap.className = 'dn-ai-wrap';
    wrap.innerHTML = `
      <button class="dn-ai-button" type="button">
        ${cached ? 'Ver interpretação' : 'Interpretar com IA'}
      </button>
      <div class="dn-ai-panel" hidden>
        <div class="dn-ai-status"></div>
        <div class="dn-ai-result">${resultHtml(cached)}</div>
      </div>
    `;

    card.appendChild(wrap);
  }

  function scan(root = document) {
    root.querySelectorAll?.('.timeline-card[data-record-id]').forEach(ensureCardUi);
  }

  async function interpret(card, wrap) {
    const id = card.dataset.recordId || card.getAttribute('data-record-id') || '';
    const text = getCardText(card);
    const button = wrap.querySelector('.dn-ai-button');
    const panel = wrap.querySelector('.dn-ai-panel');
    const status = wrap.querySelector('.dn-ai-status');
    const result = wrap.querySelector('.dn-ai-result');

    panel.hidden = false;

    const cached = readCache(id);
    if (cached && button.dataset.force !== '1') {
      result.innerHTML = resultHtml(cached);
      button.textContent = 'Interpretar novamente';
      button.dataset.force = '1';
      status.textContent = 'Interpretação carregada.';

      try {
        await syncTaskIfNeeded(cached, id, text, status);
      } catch (taskError) {
        status.textContent =
          `Interpretação carregada, mas não consegui adicionar a tarefa: ${taskError?.message || String(taskError)}`;
      }

      return;
    }

    if (!text) {
      status.textContent = 'Não encontrei o texto deste registro.';
      return;
    }

    if (!client) {
      status.textContent = 'Supabase não disponível.';
      return;
    }

    button.disabled = true;
    button.textContent = 'Interpretando…';
    status.textContent = 'Consultando IA…';

    try {
      const auth = await client.auth.getSession();
      if (!auth.data?.session) {
        throw new Error('Sua sessão do Supabase não está ativa.');
      }

      const response = await client.functions.invoke('copiloto', {
        body: { modo: 'interpretar', id: id || null, texto: text, regras: window.DN_COPILOT?.getRules?.() || [] }
      });

      if (response.error) throw response.error;
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('A função respondeu sem uma interpretação válida.');
      }

      writeCache(id, response.data);
      result.innerHTML = resultHtml(response.data);
      status.textContent = 'Interpretação concluída.';

      try {
        await syncTaskIfNeeded(response.data, id, text, status);
      } catch (taskError) {
        status.textContent =
          `Interpretação concluída, mas não consegui adicionar a tarefa: ${taskError?.message || String(taskError)}`;
      }

      button.textContent = 'Interpretar novamente';
      button.dataset.force = '1';
    } catch (error) {
      status.textContent = error?.message || String(error);
      button.textContent = 'Tentar novamente';
    } finally {
      button.disabled = false;
    }
  }


  // DN_FEATURES_V07_CARD_DETAIL
  // DN_FEATURES_V071_SOFT_DELETE
  let detailDialog = null;
  let detailRecord = null;

  function ensureDetailDialog() {
    if (detailDialog) return detailDialog;

    detailDialog = document.createElement('dialog');
    detailDialog.className = 'dn-record-dialog';
    detailDialog.innerHTML = `
      <div class="dn-record-sheet">
        <button class="dn-record-close" type="button" aria-label="Fechar">${window.DN_SYMBOLS?.icon?.('xmark.circle.fill') || 'Fechar'}</button>
        <div class="dn-record-kicker"></div>
        <p class="dn-record-text"></p>
        <div class="dn-record-actions">
          <button class="dn-record-delete" type="button">Mover para lixeira</button>
        </div>
        <div class="dn-record-status"></div>
      </div>
    `;
    document.body.appendChild(detailDialog);

    detailDialog.querySelector('.dn-record-close').addEventListener('click', () => {
      detailDialog.close();
    });

    detailDialog.addEventListener('click', (event) => {
      if (event.target === detailDialog) detailDialog.close();
    });

    detailDialog.querySelector('.dn-record-delete').addEventListener('click', deleteCurrentRecord);

    return detailDialog;
  }

  function openRecordDetail(card) {
    const dialog = ensureDetailDialog();
    const id = card.dataset.recordId || card.getAttribute('data-record-id') || '';
    const text = getCardText(card);
    const meta = Array.from(card.querySelectorAll('.note-meta span'))
      .map((node) => (node.textContent || '').trim())
      .filter(Boolean)
      .join(' · ');

    detailRecord = { id, text, card };

    dialog.querySelector('.dn-record-kicker').textContent = meta || 'Registro';
    dialog.querySelector('.dn-record-text').textContent = text || 'Sem texto';
    dialog.querySelector('.dn-record-status').textContent = '';
    dialog.querySelector('.dn-record-delete').disabled = false;

    if (!dialog.open) dialog.showModal();
  }

  function generateEventId(date = new Date()) {
    const pad = (value, size = 2) => String(value).padStart(size, '0');
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

  async function deleteCurrentRecord() {
    if (!detailRecord?.id || !client) return;

    const ok = window.confirm(
      'Mover este registro para a lixeira? O registro original não será apagado do banco de dados.'
    );
    if (!ok) return;

    const button = detailDialog.querySelector('.dn-record-delete');
    const status = detailDialog.querySelector('.dn-record-status');

    button.disabled = true;
    status.textContent = 'Movendo para a lixeira…';

    try {
      const auth = await client.auth.getSession();
      if (!auth.data?.session) {
        throw new Error('Sua sessão do Supabase não está ativa.');
      }

      const now = new Date();
      const row = {
        id: generateEventId(now),
        schema_version: 2,
        registrado_em: now.toISOString(),
        texto_original: JSON.stringify({ record_id: detailRecord.id }),
        origem: 'pwa',
        entrada: 'registro_excluido',
        versao_cliente: 'pwa-0.7.1-soft-delete'
      };

      const { error } = await client
        .from('registros')
        .insert(row);

      if (error) throw error;

      detailRecord.card?.remove();
      detailDialog.close();
      window.location.reload();
    } catch (error) {
      status.textContent = error?.message || String(error);
      button.disabled = false;
    }
  }


  function boot() {
    if (window.supabase?.createClient) {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    scan();

    const timeline = document.getElementById('timelineList');
    if (timeline) {
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              if (node.matches?.('.timeline-card[data-record-id]')) ensureCardUi(node);
              scan(node);
            }
          });
        }
      }).observe(timeline, { childList: true, subtree: true });
    }

    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('.dn-ai-button');

      if (button) {
        event.preventDefault();
        event.stopPropagation();

        const wrap = button.closest('.dn-ai-wrap');
        const card = button.closest('.timeline-card[data-record-id]');
        if (!wrap || !card) return;

        interpret(card, wrap);
        return;
      }

      const card = event.target.closest?.('.timeline-card[data-record-id]');
      if (!card) return;

      event.preventDefault();
      event.stopPropagation();
      openRecordDetail(card);
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
