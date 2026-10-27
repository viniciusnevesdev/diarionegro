/* DN_FEATURES_V083_REANALYSIS_OVERLAY */
(() => {
  'use strict';

  const VERSION = '0.8.3-reanalysis-v2';
  const INPUTS = ['texto', 'ditado', 'audio_ia'];
  const $ = (q, root = document) => root.querySelector(q);
  const icon = (name, cls = '') => window.DN_SYMBOLS?.icon?.(name, cls) || '';
  const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const fmt = (v) => v ? new Intl.DateTimeFormat('pt-BR', { dateStyle:'medium', timeStyle:'short' }).format(new Date(v)) : '—';
  const state = { running:false, stop:false };

  function client(){ return window.DN_APP_API?.getClient?.() || null; }
  async function session(){
    const known = window.DN_APP_API?.getSession?.();
    if (known?.user?.id) return known;
    const c = client();
    if (!c) throw new Error('Supabase não disponível.');
    const { data, error } = await c.auth.getSession();
    if (error) throw error;
    if (!data?.session?.user?.id) throw new Error('Entre no Diário Negro primeiro.');
    return data.session;
  }

  async function deletedIds(c, userId){
    const { data, error } = await c.from('registros').select('registrado_em,texto_original,entrada')
      .eq('user_id', userId).in('entrada',['registro_excluido','registro_restaurado'])
      .order('registrado_em',{ascending:true}).limit(2000);
    if (error) throw error;
    const set = new Set();
    for (const row of data || []) {
      let p = null; try { p = JSON.parse(row.texto_original); } catch {}
      const id = String(p?.record_id || '').trim(); if (!id) continue;
      if (row.entrada === 'registro_excluido') set.add(id); else set.delete(id);
    }
    return set;
  }

  async function allRawRecords(){
    const c = client(), s = await session(), rows = [];
    for (let from=0;;from+=500) {
      const { data, error } = await c.from('registros').select('id,registrado_em,texto_original,entrada,origem')
        .eq('user_id',s.user.id).in('entrada',INPUTS).order('registrado_em',{ascending:true}).range(from,from+499);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 500) break;
    }
    const deleted = await deletedIds(c,s.user.id);
    return rows.filter(r => !deleted.has(String(r.id)) && String(r.texto_original || '').trim());
  }

  async function selectRecords(scope, fromDate='', toDate=''){
    const c = client(), s = await session();
    let rows = await allRawRecords();
    if (scope === 'periodo') {
      const a = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : -Infinity;
      const b = toDate ? new Date(`${toDate}T23:59:59`).getTime() : Infinity;
      rows = rows.filter(r => { const t = new Date(r.registrado_em).getTime(); return t >= a && t <= b; });
    }
    if (scope === 'nunca_analisados') {
      const { data, error } = await c.from('interpretacoes_historico').select('record_id')
        .eq('user_id',s.user.id).eq('context_version',VERSION).limit(10000);
      if (error) throw error;
      const snapshots=await c.from('interpretacoes').select('record_id,context_version').eq('user_id',s.user.id).eq('context_version',VERSION).limit(10000);
      if(snapshots.error) throw snapshots.error;
      const complete = new Set((snapshots.data || []).map(x => String(x.record_id)));
      const done = new Set((data || []).map(x => String(x.record_id)).filter(id => complete.has(id)));
      rows = rows.filter(r => !done.has(String(r.id)));
    }
    if (scope === 'desatualizados') {
      const { data, error } = await c.from('interpretacoes').select('record_id,context_version').eq('user_id',s.user.id).limit(10000);
      if (error) throw error;
      const versions = new Map((data || []).map(x => [String(x.record_id),String(x.context_version || '')]));
      rows = rows.filter(r => versions.get(String(r.id)) !== VERSION);
    }
    return rows;
  }

  async function invoke(record){
    const c = client();
    const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
    const dedicated=await c.functions.invoke('reanalisar-historico',{body:{
      texto:String(record.texto_original||''),registrado_em:record.registrado_em,entrada:record.entrada,timezone
    }});
    if(!dedicated.error && !dedicated.data?.error && Array.isArray(dedicated.data?.associacoes)) return dedicated.data;

    const historicalPrompt=`REANÁLISE HISTÓRICA. Analise somente o registro antigo abaixo. Não proponha ações atuais a partir dele. Preserve acontecimentos e emoções como interpretação. Sugira memória somente quando houver conhecimento reutilizável explicitamente sustentado pelo próprio registro.\n\nREGISTRO ANTIGO (${record.registrado_em}):\n${String(record.texto_original||'')}`;
    const fallback=await c.functions.invoke('copiloto',{body:{
      modo:'reanalisar_historico',texto:historicalPrompt,agora:record.registrado_em,timezone,tarefas:[]
    }});
    if(fallback.error) throw fallback.error;
    if(fallback.data?.error) throw new Error(fallback.data.error);
    const d=fallback.data||{};
    const typeMap={regra:'regra_pessoal',preferencia:'preferencia',local_objeto:'objeto_lugar',contexto_pessoal:'contexto_vida'};
    return {
      resumo:String(d.resumo||''),intencao:d.intencao==='emocao'?'emocao':(d.intencao==='misto'?'misto':'registro'),
      categoria:String(d.categoria||''),subcategoria:String(d.subcategoria||''),pessoas:Array.isArray(d.pessoas)?d.pessoas:[],tags:Array.isArray(d.tags)?d.tags:[],
      eventos:Array.isArray(d.eventos)?d.eventos:[],emocoes:Array.isArray(d.emocoes)?d.emocoes:[],
      memorias:(Array.isArray(d.memorias_sugeridas)?d.memorias_sugeridas:[]).map(m=>({
        texto:String(m.texto||''),tipo:typeMap[m.tipo]||'outro',categoria:String(d.categoria||'Outro'),classificacao:'inferencia',
        evidencia:String(record.texto_original||'').slice(0,500),justificativa:'Candidata gerada pelo fallback do Copiloto; requer confirmação.',confianca:Number(m.confianca??.5)
      })),
      associacoes:[], _meta:{model:'copiloto-fallback',context_version:VERSION+'-fallback',associacoes_indisponiveis:true}
    };
  }

  async function saveInterpretation(record, analysis, runId){
    const c=client(), s=await session();
    const model=analysis?._meta?.model || null, contextVersion=analysis?._meta?.context_version || VERSION;
    const clean={...analysis}; delete clean._meta; const associacoes=clean.associacoes; delete clean.associacoes;
    const row={user_id:s.user.id,record_id:String(record.id),reanalysis_id:runId,resumo:String(clean.resumo||''),categoria:String(clean.categoria||''),subcategoria:String(clean.subcategoria||''),intencao:String(clean.intencao||''),dados_json:clean,origem:'reanalisar_historico',modelo:model,context_version:contextVersion};
    let q=await c.from('interpretacoes_historico').insert(row); if(q.error) throw q.error;
    return {analysis:{...clean,associacoes},model,contextVersion,associacoesIndisponiveis:!!analysis?._meta?.associacoes_indisponiveis};
  }

  async function saveSnapshot(record, analysis, model, contextVersion){
    const c=client(), s=await session();
    const snapshot={...analysis}; delete snapshot.associacoes;
    const {error}=await c.from('interpretacoes').upsert({user_id:s.user.id,record_id:String(record.id),resumo:String(analysis.resumo||''),categoria:String(analysis.categoria||''),subcategoria:String(analysis.subcategoria||''),intencao:String(analysis.intencao||''),dados_json:snapshot,origem:'reanalisar_historico',modelo:model,context_version:contextVersion,efeitos_aplicados_em:null,updated_at:new Date().toISOString()},{onConflict:'user_id,record_id'});
    if(error) throw error;
  }

  function normalizeAssociationPart(value){ return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim(); }
  async function associationFingerprint(a){
    const canonical=JSON.stringify([a.sujeito,a.relacao,a.objeto].map(normalizeAssociationPart));
    const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
    return 'sha256-nfkc-v1:'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function saveAssociations(record, analysis, runId, model, contextVersion){
    if(!Array.isArray(analysis.associacoes)) throw new Error('Contrato de associações ausente.');
    const out={created:0,found:0};
    for(const a of analysis.associacoes){
      const sujeito=String(a?.sujeito||'').trim(), relacao=String(a?.relacao||'').trim(), objeto=String(a?.objeto||'').trim();
      const evidencia=String(a?.evidencia||'').trim(), justificativa=String(a?.justificativa||'').trim();
      const confianca=Number(a?.confianca);
      if(!sujeito||!relacao||!objeto||!evidencia||!justificativa||a?.confianca==null||!Number.isFinite(confianca)||confianca<0||confianca>1||!String(record.texto_original||'').includes(evidencia))
        throw new Error('Associação inválida ou evidência não encontrada no registro.');
      const fingerprint=await associationFingerprint({sujeito,relacao,objeto});
      const {data,error}=await client().rpc('dn_associacao_registrar',{p_associacao:{source_record_id:String(record.id),reanalysis_id:runId,sujeito,relacao,objeto,evidencia,justificativa,confianca_modelo:confianca,fingerprint,context_version:contextVersion,modelo:model}});
      if(error) throw error;
      if(data==='criada') out.created++; else if(data==='reencontrada') out.found++; else throw new Error('Resposta inesperada ao salvar associação.');
    }
    return out;
  }

  async function latestRun(){
    const c=client(), s=await session();
    const {data,error}=await c.from('reanalisacoes').select('*').eq('user_id',s.user.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error) throw error; return data || null;
  }

  async function run(options={}, hooks={}){
    const c=client(), s=await session();
    const scope=['desatualizados','nunca_analisados','periodo','tudo'].includes(options.scope)?options.scope:'desatualizados';
    const rows=await selectRecords(scope,options.fromDate,options.toDate), stats={processed:0,failed:0,created:0,reinforced:0,candidates:0,conflicts:0,associacoesCriadas:0,associacoesReencontradas:0,associacoesIndisponiveis:0}, failures=[];
    const {data:runRow,error}=await c.from('reanalisacoes').insert({user_id:s.user.id,escopo:scope,status:'executando',context_version:VERSION,filtro_inicio:options.fromDate?new Date(`${options.fromDate}T00:00:00`).toISOString():null,filtro_fim:options.toDate?new Date(`${options.toDate}T23:59:59`).toISOString():null,total_registros:rows.length,metadata_json:{analyzable_inputs:INPUTS}}).select('*').single();
    if(error) throw error; hooks.onStart?.({total:rows.length}); let model=null;
    for(let i=0;i<rows.length;i++){
      if(hooks.shouldStop?.()) break;
      try{const raw=await invoke(rows[i]); const saved=await saveInterpretation(rows[i],raw,runRow.id); model ||= saved.model; const a=await saveAssociations(rows[i],saved.analysis,runRow.id,saved.model,saved.contextVersion); await saveSnapshot(rows[i],saved.analysis,saved.model,saved.contextVersion); stats.processed++; stats.associacoesCriadas+=a.created; stats.associacoesReencontradas+=a.found; if(saved.associacoesIndisponiveis) stats.associacoesIndisponiveis++;}
      catch(e){stats.failed++; failures.push({record_id:String(rows[i].id),error:String(e?.message||e).slice(0,300)});}
      await c.from('reanalisacoes').update({processados:stats.processed,falhas:stats.failed,memorias_criadas:stats.created,memorias_reforcadas:stats.reinforced,candidatos_criados:stats.candidates,conflitos_detectados:stats.conflicts,modelo:model,metadata_json:{analyzable_inputs:INPUTS,failed_records:failures.slice(-20),associacoes_criadas:stats.associacoesCriadas,associacoes_reencontradas:stats.associacoesReencontradas,associacoes_indisponiveis:stats.associacoesIndisponiveis}}).eq('user_id',s.user.id).eq('id',runRow.id);
      hooks.onProgress?.({index:i+1,total:rows.length,stats:{...stats}});
    }
    const stopped=hooks.shouldStop?.()===true;
    const {data:final,error:finalError}=await c.from('reanalisacoes').update({status:stopped?'interrompida':'concluida',processados:stats.processed,falhas:stats.failed,memorias_criadas:stats.created,memorias_reforcadas:stats.reinforced,candidatos_criados:stats.candidates,conflitos_detectados:stats.conflicts,modelo:model,completed_at:new Date().toISOString(),metadata_json:{analyzable_inputs:INPUTS,failed_records:failures.slice(-20),associacoes_criadas:stats.associacoesCriadas,associacoes_reencontradas:stats.associacoesReencontradas,associacoes_indisponiveis:stats.associacoesIndisponiveis}}).eq('user_id',s.user.id).eq('id',runRow.id).select('*').single();
    if(finalError) throw finalError; return {run:final,stats,total:rows.length,failures};
  }

  function enhancePage(){
    const page=$('#dnMemoryPage');
    const scroll=page?.querySelector('.dn-memory-scroll');
    if(!page||!scroll||$('#dnMemoryOpenReanalysis')) return false;
    const card=document.createElement('section');
    card.className='dn-memory-learning-card glass-card';
    card.innerHTML=`<div class="dn-memory-learning-icon">${icon('arrow.trianglehead.clockwise')}</div><div class="dn-memory-learning-copy"><span class="dn-memory-kicker">APRENDIZADO</span><h2>Reanalisar histórico</h2><p>Reinterprete registros antigos com a inteligência atual, sem recriar tarefas antigas.</p><small id="dnMemoryLastReanalysis">Carregando histórico…</small></div><button type="button" id="dnMemoryOpenReanalysis" class="dn-memory-primary-action">Reanalisar</button>`;
    const summary=$('#dnMemorySummary',page);
    const toolbar=page.querySelector('.dn-memory-toolbar');
    if(summary) summary.insertAdjacentElement('afterend',card);
    else if(toolbar) scroll.insertBefore(card,toolbar);
    else scroll.prepend(card);
    const actions=page.querySelector('.dn-memory-actions');
    if(actions && !page.querySelector('.dn-memory-maintenance')){
      const box=document.createElement('details');
      box.className='dn-memory-maintenance dn-glass-soft';
      box.innerHTML=`<summary><span>Dados e manutenção</span>${icon('chevron.right')}</summary>`;
      actions.parentNode.insertBefore(box,actions);
      box.appendChild(actions);
    }
    window.DNGlass?.hydrate?.(page);
    $('#dnMemoryOpenReanalysis')?.addEventListener('click',openDialog);
    refreshLatest();
    return true;
  }

  async function refreshLatest(){const el=$('#dnMemoryLastReanalysis'); if(!el)return; try{const r=await latestRun(); el.textContent=r?`${r.status==='concluida'?'Concluída':r.status==='interrompida'?'Interrompida':'Última execução'} em ${fmt(r.completed_at||r.started_at)} · ${r.processados}/${r.total_registros} registros`:'Nenhuma reanálise registrada ainda.';}catch{el.textContent='Reanálise ainda não ativada no banco.';}}

  function ensureDialog(){if($('#dnMemoryReanalysisDialog'))return; document.body.insertAdjacentHTML('beforeend',`<dialog id="dnMemoryReanalysisDialog" class="demo-dialog dn-memory-dialog"><div class="demo-sheet dn-memory-sheet"><div class="sheet-handle"></div><div id="dnReanalysisSetup"><div class="dn-memory-dialog-heading"><span>${icon('arrow.trianglehead.clockwise')}</span><div><small>APRENDIZADO</small><h2>Reanalisar histórico</h2></div></div><p class="dn-memory-dialog-copy">A IA reinterpreta o passado e registra hipóteses como associações em observação. Memórias não são criadas automaticamente; confirmação e permissão de uso são separadas.</p><div class="dn-reanalysis-options"><label><input type="radio" name="dnReanalysisScope" value="desatualizados" checked><span><strong>Desde a última versão</strong><small>Só o que ainda não tem a interpretação atual.</small></span></label><label><input type="radio" name="dnReanalysisScope" value="nunca_analisados"><span><strong>Nunca reanalisados</strong><small>Ignora o que esta versão já processou.</small></span></label><label><input type="radio" name="dnReanalysisScope" value="periodo"><span><strong>Período específico</strong><small>Escolha as datas.</small></span></label><label><input type="radio" name="dnReanalysisScope" value="tudo"><span><strong>Reanalisar tudo</strong><small>Preserva as interpretações anteriores no histórico.</small></span></label></div><div id="dnReanalysisDates" class="dn-reanalysis-dates" hidden><label>De<input id="dnReanalysisFrom" class="field-input" type="date"></label><label>Até<input id="dnReanalysisTo" class="field-input" type="date"></label></div><div id="dnReanalysisPreview" class="dn-reanalysis-preview">Calculando…</div><div class="sheet-actions"><button type="button" class="secondary-btn" data-close-reanalysis>Cancelar</button><button type="button" class="primary-btn" id="dnReanalysisStart">Iniciar</button></div></div><div id="dnReanalysisProgress" hidden><div class="dn-memory-dialog-heading"><span>${icon('arrow.trianglehead.clockwise')}</span><div><small>PROCESSANDO</small><h2>Reanalisando</h2></div></div><div class="dn-reanalysis-progressbar"><span id="dnReanalysisProgressFill"></span></div><strong id="dnReanalysisProgressLabel">Preparando…</strong><div id="dnReanalysisLiveStats" class="dn-reanalysis-live-stats"></div><button type="button" class="secondary-btn sheet-button" id="dnReanalysisStop">Parar após este registro</button></div><div id="dnReanalysisReport" hidden></div></div></dialog>`);
    document.querySelectorAll('input[name="dnReanalysisScope"]').forEach(x=>x.addEventListener('change',preview)); $('#dnReanalysisFrom')?.addEventListener('change',preview); $('#dnReanalysisTo')?.addEventListener('change',preview); $('#dnReanalysisStart')?.addEventListener('click',startFromDialog); $('#dnReanalysisStop')?.addEventListener('click',()=>{state.stop=true; $('#dnReanalysisStop').disabled=true; $('#dnReanalysisStop').textContent='Parando…';}); $('[data-close-reanalysis]')?.addEventListener('click',()=>{if(!state.running)$('#dnMemoryReanalysisDialog').close();});
  }

  function openDialog(){ensureDialog(); state.stop=false; $('#dnReanalysisSetup').hidden=false; $('#dnReanalysisProgress').hidden=true; $('#dnReanalysisReport').hidden=true; $('#dnMemoryReanalysisDialog').showModal(); preview();}
  async function preview(){if(state.running)return; const scope=$('input[name="dnReanalysisScope"]:checked')?.value||'desatualizados'; $('#dnReanalysisDates').hidden=scope!=='periodo'; const el=$('#dnReanalysisPreview'); el.textContent='Calculando…'; try{const rows=await selectRecords(scope,$('#dnReanalysisFrom').value,$('#dnReanalysisTo').value); el.innerHTML=`<strong>${rows.length}</strong> registro${rows.length===1?'':'s'} será${rows.length===1?'':'ão'} enviado${rows.length===1?'':'s'} para a IA. Isso pode consumir sua API.`; $('#dnReanalysisStart').disabled=rows.length===0;}catch(e){el.textContent=e?.message||String(e); $('#dnReanalysisStart').disabled=true;}}
  function reanalysisStatsHtml(s){
    return `<span><b>${s.associacoesCriadas || 0}</b> associações novas</span><span><b>${s.associacoesReencontradas || 0}</b> associações reencontradas</span><span><b>${s.associacoesIndisponiveis || 0}</b> registros sem extração de associações</span><span><b>${s.failed || 0}</b> falhas</span><span><b>0</b> memórias criadas</span>`;
  }
  function progress(i,total,s){const p=total?Math.round(i/total*100):0; $('#dnReanalysisProgressFill').style.width=`${p}%`; $('#dnReanalysisProgressLabel').textContent=`${i} de ${total} registros`; $('#dnReanalysisLiveStats').innerHTML=reanalysisStatsHtml(s);}
  async function startFromDialog(){
    if(state.running)return; state.running=true; state.stop=false;
    $('#dnReanalysisSetup').hidden=true; $('#dnReanalysisProgress').hidden=false;
    try{
      const result=await run({scope:$('input[name="dnReanalysisScope"]:checked')?.value||'desatualizados',fromDate:$('#dnReanalysisFrom').value,toDate:$('#dnReanalysisTo').value},{shouldStop:()=>state.stop,onStart:({total})=>progress(0,total,{}),onProgress:({index,total,stats})=>progress(index,total,stats)});
      $('#dnReanalysisProgress').hidden=true; const r=$('#dnReanalysisReport'); r.hidden=false;
      r.innerHTML=`<div class="dn-memory-dialog-heading"><span>${icon(result.run.status==='concluida'?'checkmark.circle.fill':'exclamationmark.circle.fill')}</span><div><small>RESULTADO</small><h2>${result.run.status==='concluida'?'Reanálise concluída':'Reanálise interrompida'}</h2></div></div><div class="dn-reanalysis-report-grid">${reanalysisStatsHtml(result.stats)}</div><p class="dn-memory-dialog-copy">Associações novas ficam em observação e com uso bloqueado. A análise pode ter falhas parciais.</p><div class="sheet-actions"><button type="button" class="secondary-btn" id="dnReanalysisClose">Fechar</button><button type="button" class="primary-btn" id="dnReanalysisReview">Revisar associações</button></div>`;
      $('#dnReanalysisClose').onclick=()=>$('#dnMemoryReanalysisDialog').close();
      $('#dnReanalysisReview').onclick=()=>{ $('#dnMemoryReanalysisDialog').close(); $('#dnAssociationsSection')?.scrollIntoView({block:'start',behavior:'smooth'}); };
      await window.DN_MEMORY.refresh?.(); await refreshLatest();
    }catch(e){$('#dnReanalysisProgress').hidden=true; const r=$('#dnReanalysisReport'); r.hidden=false; r.innerHTML=`<p class="form-error">${esc(e?.message||String(e))}</p><button class="secondary-btn sheet-button" id="dnReanalysisClose">Fechar</button>`; $('#dnReanalysisClose').onclick=()=>$('#dnMemoryReanalysisDialog').close();}
    finally{state.running=false;}
  }

  function boot(){
    ensureDialog();
    enhancePage();
    const open=window.DN_MEMORY?.open;
    if(open && !window.DN_MEMORY_REANALYSIS_OPEN_WRAPPED){
      window.DN_MEMORY.open=async(...args)=>{
        const result=await open(...args);
        requestAnimationFrame(()=>{enhancePage();refreshLatest();});
        setTimeout(()=>{enhancePage();refreshLatest();},80);
        return result;
      };
      window.DN_MEMORY_REANALYSIS_OPEN_WRAPPED=true;
    }
    if(!window.__DN_REANALYSIS_OBSERVER){
      const observer=new MutationObserver(()=>{if(enhancePage())refreshLatest();});
      observer.observe(document.body,{childList:true,subtree:true});
      window.__DN_REANALYSIS_OBSERVER=observer;
    }
    window.DN_MEMORY_REANALYSIS={VERSION,INPUTS,selectRecords,run,latestRun,enhancePage};
    setTimeout(()=>{enhancePage();refreshLatest();},250);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true}); else setTimeout(boot,0);
})();
