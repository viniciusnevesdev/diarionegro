/* DN_FEATURES_V083_REANALYSIS_OVERLAY */
(() => {
  'use strict';

  const VERSION = '0.8.3-reanalysis-v1';
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
      const done = new Set((data || []).map(x => String(x.record_id)));
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
    if(!dedicated.error && !dedicated.data?.error) return dedicated.data;

    const historicalPrompt=`REANÁLISE HISTÓRICA. Analise somente o registro antigo abaixo. Não proponha ações atuais a partir dele. Preserve acontecimentos e emoções como interpretação. Sugira memória somente quando houver conhecimento reutilizável explicitamente sustentado pelo próprio registro.\n\nREGISTRO ANTIGO (${record.registrado_em}):\n${String(record.texto_original||'')}`;
    const fallback=await c.functions.invoke('copiloto',{body:{
      modo:'interpretar',texto:historicalPrompt,agora:record.registrado_em,timezone,tarefas:[],regras:[]
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
      _meta:{model:'copiloto-fallback',context_version:VERSION}
    };
  }

  async function saveInterpretation(record, analysis, runId){
    const c=client(), s=await session();
    const model=analysis?._meta?.model || null, contextVersion=analysis?._meta?.context_version || VERSION;
    const clean={...analysis}; delete clean._meta;
    const row={user_id:s.user.id,record_id:String(record.id),reanalysis_id:runId,resumo:String(clean.resumo||''),categoria:String(clean.categoria||''),subcategoria:String(clean.subcategoria||''),intencao:String(clean.intencao||''),dados_json:clean,origem:'reanalisar_historico',modelo:model,context_version:contextVersion};
    let q=await c.from('interpretacoes_historico').insert(row); if(q.error) throw q.error;
    q=await c.from('interpretacoes').upsert({user_id:s.user.id,record_id:String(record.id),resumo:row.resumo,categoria:row.categoria,subcategoria:row.subcategoria,intencao:row.intencao,dados_json:clean,origem:'reanalisar_historico',modelo:model,context_version:contextVersion,efeitos_aplicados_em:null,updated_at:new Date().toISOString()},{onConflict:'user_id,record_id'});
    if(q.error) throw q.error;
    return {analysis:clean,model};
  }

  async function saveMemories(record, analysis, runId){
    const out={created:0,reinforced:0,candidates:0,conflicts:0};
    for(const m of analysis?.memorias || []){
      const text=String(m?.texto||'').trim(); if(!text) continue;
      const source={record_id:String(record.id),source_type:'reanalisacao_historica',source_label:`Registro de ${fmt(record.registrado_em)}`,source_excerpt:String(m.evidencia||record.texto_original||'').slice(0,1000),relation_type:'origem',confidence_contribution:Number(m.confianca??.5),metadata_json:{reanalysis_id:runId,context_version:VERSION,classificacao:m.classificacao}};
      const details={tipo:m.tipo||'outro',categoria:String(m.categoria||'Outro'),confianca:Number(m.confianca??.5),confidence_initial:Number(m.confianca??.5),source_record_id:String(record.id),source_type:source.source_type,source_label:source.source_label,source_excerpt:source.source_excerpt,first_learned_at:record.registrado_em,metadata_json:{reanalysis_id:runId,context_version:VERSION,justificativa:String(m.justificativa||''),classificacao:m.classificacao},source};
      let result;
      if(m.classificacao==='declaracao_clara') result=await window.DN_MEMORY.create({...details,texto:text,origem:'registro_declaracao_clara',status:'ativa',ativa:true,confirmed_by_user:false},{source},client());
      else result=await window.DN_MEMORY.createCandidate(text,details,client());
      if(result?.duplicate) out.reinforced++; else {out.created++; if(m.classificacao!=='declaracao_clara') out.candidates++;}
      if(result?.conflict) out.conflicts++;
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
    const rows=await selectRecords(scope,options.fromDate,options.toDate), stats={processed:0,failed:0,created:0,reinforced:0,candidates:0,conflicts:0}, failures=[];
    const {data:runRow,error}=await c.from('reanalisacoes').insert({user_id:s.user.id,escopo:scope,status:'executando',context_version:VERSION,filtro_inicio:options.fromDate?new Date(`${options.fromDate}T00:00:00`).toISOString():null,filtro_fim:options.toDate?new Date(`${options.toDate}T23:59:59`).toISOString():null,total_registros:rows.length,metadata_json:{analyzable_inputs:INPUTS}}).select('*').single();
    if(error) throw error; hooks.onStart?.({total:rows.length}); let model=null;
    for(let i=0;i<rows.length;i++){
      if(hooks.shouldStop?.()) break;
      try{const raw=await invoke(rows[i]); const saved=await saveInterpretation(rows[i],raw,runRow.id); model ||= saved.model; const m=await saveMemories(rows[i],saved.analysis,runRow.id); stats.processed++; stats.created+=m.created; stats.reinforced+=m.reinforced; stats.candidates+=m.candidates; stats.conflicts+=m.conflicts;}
      catch(e){stats.failed++; failures.push({record_id:String(rows[i].id),error:String(e?.message||e).slice(0,300)});}
      await c.from('reanalisacoes').update({processados:stats.processed,falhas:stats.failed,memorias_criadas:stats.created,memorias_reforcadas:stats.reinforced,candidatos_criados:stats.candidates,conflitos_detectados:stats.conflicts,modelo:model,metadata_json:{analyzable_inputs:INPUTS,failed_records:failures.slice(-20)}}).eq('user_id',s.user.id).eq('id',runRow.id);
      hooks.onProgress?.({index:i+1,total:rows.length,stats:{...stats}});
    }
    const stopped=hooks.shouldStop?.()===true;
    const {data:final,error:finalError}=await c.from('reanalisacoes').update({status:stopped?'interrompida':'concluida',processados:stats.processed,falhas:stats.failed,memorias_criadas:stats.created,memorias_reforcadas:stats.reinforced,candidatos_criados:stats.candidates,conflitos_detectados:stats.conflicts,modelo:model,completed_at:new Date().toISOString(),metadata_json:{analyzable_inputs:INPUTS,failed_records:failures.slice(-20)}}).eq('user_id',s.user.id).eq('id',runRow.id).select('*').single();
    if(finalError) throw finalError; return {run:final,stats,total:rows.length,failures};
  }

  function enhancePage(){
    const page=$('#dnMemoryPage'), scroll=page?.querySelector('.dn-memory-scroll'); if(!page||!scroll||$('#dnMemoryOpenReanalysis')) return;
    const summary=$('#dnMemorySummary');
    const card=document.createElement('section'); card.className='dn-memory-learning-card glass-card'; card.innerHTML=`<div class="dn-memory-learning-icon">${icon('arrow.trianglehead.clockwise')}</div><div class="dn-memory-learning-copy"><span class="dn-memory-kicker">APRENDIZADO</span><h2>Reanalisar histórico</h2><p>Reinterprete registros antigos com a inteligência atual, sem recriar tarefas antigas.</p><small id="dnMemoryLastReanalysis">Carregando histórico…</small></div><button type="button" id="dnMemoryOpenReanalysis" class="dn-memory-primary-action">Reanalisar</button>`;
    summary?.insertAdjacentElement('afterend',card);
    const actions=$('.dn-memory-actions'); if(actions){const box=document.createElement('details'); box.className='dn-memory-maintenance dn-glass-soft'; box.innerHTML='<summary>Dados e manutenção</summary>'; actions.parentNode.insertBefore(box,actions); box.appendChild(actions);}
    window.DNGlass?.hydrate?.(page);
    $('#dnMemoryOpenReanalysis')?.addEventListener('click',openDialog);
  }

  async function refreshLatest(){const el=$('#dnMemoryLastReanalysis'); if(!el)return; try{const r=await latestRun(); el.textContent=r?`${r.status==='concluida'?'Concluída':r.status==='interrompida'?'Interrompida':'Última execução'} em ${fmt(r.completed_at||r.started_at)} · ${r.processados}/${r.total_registros} registros`:'Nenhuma reanálise registrada ainda.';}catch{el.textContent='Reanálise ainda não ativada no banco.';}}

  function ensureDialog(){if($('#dnMemoryReanalysisDialog'))return; document.body.insertAdjacentHTML('beforeend',`<dialog id="dnMemoryReanalysisDialog" class="demo-dialog dn-memory-dialog"><div class="demo-sheet dn-memory-sheet"><div class="sheet-handle"></div><div id="dnReanalysisSetup"><div class="dn-memory-dialog-heading"><span>${icon('arrow.trianglehead.clockwise')}</span><div><small>APRENDIZADO</small><h2>Reanalisar histórico</h2></div></div><p class="dn-memory-dialog-copy">A IA reinterpreta o passado com as regras atuais. Declarações claras podem virar memória; inferências ficam aguardando confirmação.</p><div class="dn-reanalysis-options"><label><input type="radio" name="dnReanalysisScope" value="desatualizados" checked><span><strong>Desde a última versão</strong><small>Só o que ainda não tem a interpretação atual.</small></span></label><label><input type="radio" name="dnReanalysisScope" value="nunca_analisados"><span><strong>Nunca reanalisados</strong><small>Ignora o que esta versão já processou.</small></span></label><label><input type="radio" name="dnReanalysisScope" value="periodo"><span><strong>Período específico</strong><small>Escolha as datas.</small></span></label><label><input type="radio" name="dnReanalysisScope" value="tudo"><span><strong>Reanalisar tudo</strong><small>Preserva as interpretações anteriores no histórico.</small></span></label></div><div id="dnReanalysisDates" class="dn-reanalysis-dates" hidden><label>De<input id="dnReanalysisFrom" class="field-input" type="date"></label><label>Até<input id="dnReanalysisTo" class="field-input" type="date"></label></div><div id="dnReanalysisPreview" class="dn-reanalysis-preview">Calculando…</div><div class="sheet-actions"><button type="button" class="secondary-btn" data-close-reanalysis>Cancelar</button><button type="button" class="primary-btn" id="dnReanalysisStart">Iniciar</button></div></div><div id="dnReanalysisProgress" hidden><div class="dn-memory-dialog-heading"><span>${icon('arrow.trianglehead.clockwise')}</span><div><small>PROCESSANDO</small><h2>Reanalisando</h2></div></div><div class="dn-reanalysis-progressbar"><span id="dnReanalysisProgressFill"></span></div><strong id="dnReanalysisProgressLabel">Preparando…</strong><div id="dnReanalysisLiveStats" class="dn-reanalysis-live-stats"></div><button type="button" class="secondary-btn sheet-button" id="dnReanalysisStop">Parar após este registro</button></div><div id="dnReanalysisReport" hidden></div></div></dialog>`);
    document.querySelectorAll('input[name="dnReanalysisScope"]').forEach(x=>x.addEventListener('change',preview)); $('#dnReanalysisFrom')?.addEventListener('change',preview); $('#dnReanalysisTo')?.addEventListener('change',preview); $('#dnReanalysisStart')?.addEventListener('click',startFromDialog); $('#dnReanalysisStop')?.addEventListener('click',()=>{state.stop=true; $('#dnReanalysisStop').disabled=true; $('#dnReanalysisStop').textContent='Parando…';}); $('[data-close-reanalysis]')?.addEventListener('click',()=>{if(!state.running)$('#dnMemoryReanalysisDialog').close();});
  }

  function openDialog(){ensureDialog(); state.stop=false; $('#dnReanalysisSetup').hidden=false; $('#dnReanalysisProgress').hidden=true; $('#dnReanalysisReport').hidden=true; $('#dnMemoryReanalysisDialog').showModal(); preview();}
  async function preview(){if(state.running)return; const scope=$('input[name="dnReanalysisScope"]:checked')?.value||'desatualizados'; $('#dnReanalysisDates').hidden=scope!=='periodo'; const el=$('#dnReanalysisPreview'); el.textContent='Calculando…'; try{const rows=await selectRecords(scope,$('#dnReanalysisFrom').value,$('#dnReanalysisTo').value); el.innerHTML=`<strong>${rows.length}</strong> registro${rows.length===1?'':'s'} será${rows.length===1?'':'ão'} enviado${rows.length===1?'':'s'} para a IA. Isso pode consumir sua API.`; $('#dnReanalysisStart').disabled=rows.length===0;}catch(e){el.textContent=e?.message||String(e); $('#dnReanalysisStart').disabled=true;}}
  function progress(i,total,s){const p=total?Math.round(i/total*100):0; $('#dnReanalysisProgressFill').style.width=`${p}%`; $('#dnReanalysisProgressLabel').textContent=`${i} de ${total} registros`; $('#dnReanalysisLiveStats').innerHTML=`<span><b>${s.created}</b> novas</span><span><b>${s.candidates}</b> a confirmar</span><span><b>${s.reinforced}</b> reforços</span><span><b>${s.conflicts}</b> conflitos</span><span><b>${s.failed}</b> falhas</span>`;}
  async function startFromDialog(){if(state.running)return; state.running=true; state.stop=false; $('#dnReanalysisSetup').hidden=true; $('#dnReanalysisProgress').hidden=false; try{const result=await run({scope:$('input[name="dnReanalysisScope"]:checked')?.value||'desatualizados',fromDate:$('#dnReanalysisFrom').value,toDate:$('#dnReanalysisTo').value},{shouldStop:()=>state.stop,onStart:({total})=>progress(0,total,{created:0,candidates:0,reinforced:0,conflicts:0,failed:0}),onProgress:({index,total,stats})=>progress(index,total,stats)}); $('#dnReanalysisProgress').hidden=true; const r=$('#dnReanalysisReport'); r.hidden=false; r.innerHTML=`<div class="dn-memory-dialog-heading"><span>${icon(result.run.status==='concluida'?'checkmark.circle.fill':'exclamationmark.circle.fill')}</span><div><small>RESULTADO</small><h2>${result.run.status==='concluida'?'Reanálise concluída':'Reanálise interrompida'}</h2></div></div><div class="dn-reanalysis-report-grid"><span><b>${result.stats.created}</b> novas</span><span><b>${result.stats.candidates}</b> a confirmar</span><span><b>${result.stats.reinforced}</b> reforços</span><span><b>${result.stats.conflicts}</b> conflitos</span><span><b>${result.stats.failed}</b> falhas</span></div><div class="sheet-actions"><button type="button" class="secondary-btn" id="dnReanalysisClose">Fechar</button><button type="button" class="primary-btn" id="dnReanalysisReview">Revisar memórias</button></div>`; $('#dnReanalysisClose').onclick=()=>$('#dnMemoryReanalysisDialog').close(); $('#dnReanalysisReview').onclick=()=>{ $('#dnMemoryReanalysisDialog').close(); const st=$('#dnMemoryStatus'); if(st){st.value='aguardando_confirmacao'; st.dispatchEvent(new Event('change'));} }; await window.DN_MEMORY.refresh?.(); await refreshLatest();}catch(e){$('#dnReanalysisProgress').hidden=true; const r=$('#dnReanalysisReport'); r.hidden=false; r.innerHTML=`<p class="form-error">${esc(e?.message||String(e))}</p><button class="secondary-btn sheet-button" id="dnReanalysisClose">Fechar</button>`; $('#dnReanalysisClose').onclick=()=>$('#dnMemoryReanalysisDialog').close();}finally{state.running=false;}}

  function boot(){enhancePage(); ensureDialog(); refreshLatest(); const open=window.DN_MEMORY?.open; if(open){window.DN_MEMORY.open=async(...args)=>{const v=await open(...args); enhancePage(); await refreshLatest(); return v;};} window.DN_MEMORY_REANALYSIS={VERSION,INPUTS,selectRecords,run,latestRun};}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true}); else setTimeout(boot,0);
})();
