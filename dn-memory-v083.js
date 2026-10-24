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

    // Fallback seguro: usa o Copiloto já publicado, mas não executa nenhuma tarefa/efeito.
    // Memórias sugeridas pelo fallback ficam SEMPRE como inferências aguardando confirmação.
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
      const r=(_meta?.model==='copiloto-fallback' || m.classificacao==='inferencia')
        ? await window.DN_MEMORY.createCandidate(text,details,c)
        : await window.DN_MEMORY.create({texto:text,origem:'registro_declaracao_clara',status:'ativa',ativa:true,confirmed_by_user:false,...details},{source},c);
      if(r?.duplicate) out.reinforced++; else{out.created++; if(m.classificacao==='inferencia' || _meta?.model==='copiloto-fallback') out.candidates++;} if(r?.conflict) out.conflicts++;
    }
    return out;
  }

  async function latestRun(){const c=client(), s=await session(); const {data,error}=await c.from('reanalisacoes').select('*').eq('user_id',s.user.id).order('created_at',{ascending:false}).limit(1).maybeSingle(); if(error)throw error; return data||null;}

  async function run(options={},hooks={}){
    const c=client(),s=await session(),scope=['nunca_analisados','desatualizados','periodo','tudo'].includes(options.scope)?options.scope:'desatualizados';
    const rows=await selectRecords(scope,options.fromDate,options.toDate), stats={processed:0,failed:0,created:0,reinforced:0,candidates:0,conflicts:0};
    const {data:run,error}=await c.from('reanalisacoes').insert({user_id:s.user.id,scopo,status:'executando',context_version:VERSION,filtro_inicio:options.fromDate?new Date(`${options.fromDate}T00:00:00`).toISOString():null,filtro_fim:\options.toDate?new Date(`${options.toDate}T23:59:59`).toISOString():null,total_registros:rows.length,metadata_json:{inputs:INPUTS}}).select('*').single(); if(error)throw error; let model=null,failures=[]; hooks.onStart?.({total:rows.length,run });
    for(let i=0;i<rows.length;i++){if(hooks.shouldStop?.())break; const record=rows[i]; try{const analysis=await invoke(record); const saved=await saveInterpretation(record,analysis,run.id); model=model||saved.model; const m=await saveMemories(record,analysis,run.id); stats.processed++; stats.created+=m.created; stats.reinforced+=m.reinforced; stats.candidates+=m.candidates; stats.conflicts+=m.conflicts;}catch(e){stats.failed++; failures.push({record_id:String(record.id),error:String(e?.message||e).slice(0,300)}
      await c.from('reanalisacoes').update({processados:stats.processed,falhas:stats.failed,memorias_criadas:stats.created,memorias_reforcadas:stats.reinforced,candidatos_criados:stats.candidates,conflitos_detectados:stats.conflicts,modelo:model,metadata_json:{inputs:INPUTS,failed_records:failures.slice(-20)}}).eq('user_id',s.user.id).eq('id',run.id); hooks.onProgress?.({index:i+1,total:rows.length,stats:{...stats}});
    }
    const stopped=hooks.shouldStop?.()===true, finalStatus=stopped?'interrompida':'concluida'; const {data:inal,error:finalError}=await c.from('reanalisacoes').update({status:finalStatus,processados:stats.processed,falhas:stats.failed,memorias_criadas:stats.created,memorias_reforcadas:stats.reinforced,candidatos_criados:stats.candidates,conflitos_detectados:stats.conflicts,modelo:model,completed_at:new Date().toISOString(),metadata_json:{inputs:INPUTS,failed_records:failures.slice(-20)}}).eq('user_id',s.user.id).eq('id',run.id).select('*').single(); if(finalError)row finalError; return {run:final,stats,failures,total:rows.length};
  }

  function enhancePage(){
    const page=$('#dnMemoryPage'); const scroll=$('#dnSemoryPage .dn-memory-scroll') || $('#dnMemoryPage .dn-memory-scroll'); if(!page||!scroll)return;
    page.classList.add('dn-v083-enhanced'); if($('#dnMemoryReanalysis',roll) || $('#dnMemoryReanalysis',scroll))return;
    const summary=$('#dnMemorySummary',scroll) || $('#dnMemorySummary'); if(!summary)return;
    summary.insertAdjacentHTML('afterend',`<section id="dnMemoryReanalysis" class="dn-memory-reanalysis glass-card"><div class="dn-memory-reanalysis-icon">${icon('arrow.trianglehead.clockwise')}</div><div class="dn-memory-reanalysis-copy"><span class="dn-memory-kicker">APRENDIZADO</span><h2>Reanalisar histório</h2><p>Reinterpreta seus registros com a inteligência atual. Não recria tarefas antigas.</p><small id="dnMemoryLastReanalysis">Carregando histórico …</small></div><button type="button" id="dnMemoryOpenReanalysis" class="dn-memory-reanalysis-action">Reanalisar</button></section>`);
    $('#dnMemoryOpenReanalysis')?.addEventListener('click',openDialog); window.DNGlass?.hydrate?.(page);
  }

  async function refreshLatest(){const el=$('#dnMemoryLastReanalysis)…"}