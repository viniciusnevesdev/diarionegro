/* Aprendizado contínuo: fila e leases vivem no banco, nunca no localStorage. */
(() => {
  'use strict';
  let running = null;
  let state = { status: 'aguardando', error: null };
  function publish(status, error = null) {
    state = { status, error };
    const label = document.querySelector('#dnLearningStatus');
    if (label) label.textContent = error || ({ em_dia: 'Aprendizado em dia.', aprendendo: 'Aprendendo com suas anotações…', pendente: 'Aprendizado pendente; retomada automática.' }[status] || '');
    window.dispatchEvent(new CustomEvent('dn:learning-status', { detail: state }));
  }
  function kick() {
    if (running) return running;
    const client = window.DN_APP_API?.getClient?.();
    const session = window.DN_APP_API?.getSession?.();
    if (!client || !session?.user?.id || navigator.onLine === false) return Promise.resolve();
    running = (async () => {
      try {
        // Evita invocar a Edge Function quando não há trabalho pronto.
        const { data, error } = await client.from('aprendizado_fila').select('id')
          .neq('estado', 'concluido').lte('disponivel_em', new Date().toISOString()).limit(1);
        if (error) throw error;
        if (!data?.length) return publish('em_dia');
        publish('aprendendo');
        for (let i = 0; i < 20; i++) {
          if (window.DN_APP_API?.getSession?.()?.user?.id !== session.user.id) break;
          const { data: result, error: failure } = await client.functions.invoke('aprender-registro', { body: {} });
          if (failure || result?.error) throw failure || new Error(result.error);
          if (!result?.processed) return publish('em_dia');
        }
        publish('pendente'); // próxima rodada continua lotes grandes
      } catch {
        publish('pendente', 'Aprendizado pendente. Seus registros estão salvos; a tentativa será retomada automaticamente.');
      } finally { running = null; }
    })();
    return running;
  }
  window.DN_LEARNING = { kick, getState: () => ({ ...state }) };
  window.addEventListener('dn:record-saved', kick);
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  // Também cobre login, retorno ao app e importações externas com o app aberto.
  setInterval(() => { if (!document.hidden) kick(); }, 30000);
  kick();
})();
