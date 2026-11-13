/* Called only inside validate_integrated.cjs's disposable local PostgreSQL database. */
const assert=require('node:assert/strict');
module.exports=async function({admin,A,B,rpc,asUser,test}) {
 const mem=(texto,valor,extras={})=>({texto,tipo:'preferencia',categoria:'Rotina',classificacao:'declaracao_clara',evidencia:texto,justificativa:'Declaração',confianca:.98,aspecto:'pessoa:preferencia:bebida',valor,canonical_key:'preferencia:bebida',fingerprint:'fixture:'+valor,...extras});
 const extraction=(m,associacoes=[])=>({resumo:'teste',categoria:'Rotina',intencao:'registro',memorias:m,associacoes,_meta:{model:'fake'}});
 const put=async(id,text,entrada='texto',owner=A,origem='teste')=>admin.query('insert into public.registros(id,user_id,texto_original,entrada,origem) values($1,$2,$3,$4,$5)',[id,owner,text,entrada,origem]);
 const claim=()=>rpc(admin,'dn_aprendizado_claim',[A]);
 const save=async(j,data)=>{await rpc(admin,'dn_aprendizado_checkpoint',[j.id,j.lease_token,data]);return rpc(admin,'dn_aprendizado_aplicar',[j.id,j.lease_token]);};
 let job,firstId;
 await test('continuous: every raw path enqueues; structured events do not',async()=>{
  for(const [id,type,origin] of [['learn-text','texto'],['learn-dictation','ditado'],['learn-audio','audio_ia'],['learn-imported-audio','voz'],['learn-event','tarefa_criada'],['learn-station','texto','estacao_casa']]) await put(id,'Prefiro café',type,A,origin);
  assert.equal((await admin.query('select count(*)::int n from public.aprendizado_fila')).rows[0].n,4);
 });
 await test('continuous: exclusive lease and immediate audited fact; no fake human confirmation',async()=>{
  job=await claim();assert(job);const other=await claim();assert.notEqual(other.id,job.id);
  await rpc(admin,'dn_aprendizado_falhou',[other.id,other.lease_token,'retry later']);
  await save(job,extraction([mem('Prefiro café','café')]));
  const concluded=(await admin.query('select estado,texto,resultado from public.aprendizado_fila where id=$1',[job.id])).rows[0];
  assert.equal(concluded.estado,'concluido');
  assert.equal(concluded.texto,'');
  assert.equal(concluded.resultado,null);
  const m=(await admin.query("select * from public.memorias where fingerprint='fixture:café'")).rows[0];
  firstId=m.id;assert.equal(m.ativa,true);assert.equal(m.confirmed_by_user,false);
  const ctx=await asUser(A,c=>rpc(c,'dn_contexto_copiloto',['learning-immediate','interpretar']));assert(ctx.memorias.some(x=>x.id===firstId));
  assert((await admin.query('select 1 from public.memoria_historico where memoria_id=$1',[firstId])).rowCount>0);
  await rpc(admin,'dn_aprendizado_aplicar',[job.id,job.lease_token]);
  assert.equal((await admin.query('select count(*)::int n from public.memoria_fontes where memoria_id=$1',[firstId])).rows[0].n,1);
 });
 await test('continuous: independent repeated sources deduplicate and accumulate evidence',async()=>{
  await admin.query("update public.aprendizado_fila set disponivel_em=now() where estado='pendente'");
  let next;while((next=await claim())) await save(next,extraction([mem('Prefiro café','café')]));
  assert.equal((await admin.query("select count(*)::int n from public.memorias where fingerprint='fixture:café'")).rows[0].n,1);
  assert.equal((await admin.query('select count(*)::int n from public.memoria_fontes where memoria_id=$1',[firstId])).rows[0].n,4);
 });
 await test('continuous: conflicting change removes automatic facts from authorized context',async()=>{
  await put('learn-change','Prefiro chá');await save(await claim(),extraction([mem('Prefiro chá','chá')]));
  const rows=(await admin.query("select status,ativa from public.memorias where fingerprint in ('fixture:café','fixture:chá')")).rows;
  assert.equal(rows.length,2);assert(rows.every(x=>x.status==='conflitante'&&!x.ativa));
  const ctx=await asUser(A,c=>rpc(c,'dn_contexto_copiloto',['learning-conflict','interpretar']));assert(!ctx.memorias.some(x=>x.id===firstId));
 });
 await test('continuous: explicit human correction remains intact on contradiction',async()=>{
  await asUser(A,c=>c.query("insert into public.memorias(user_id,texto,tipo,categoria,origem,confirmed_by_user,confirmed_at,fingerprint,canonical_key) values($1,'Minha chave fica na mesa','objeto_lugar','Casa','correcao_explicitamente_lembrada',true,now(),'human-key','objeto_lugar:subject:chave')",[A]));
  await put('learn-human-conflict','Minha chave fica na gaveta');await save(await claim(),extraction([mem('Minha chave fica na gaveta','gaveta',{tipo:'objeto_lugar',aspecto:'objeto:chave:local',canonical_key:'objeto_lugar:subject:chave',fingerprint:'new-key'})]));
  assert.equal((await admin.query("select ativa from public.memorias where fingerprint='human-key'")).rows[0].ativa,true);
  assert.equal((await admin.query("select status from public.memorias where fingerprint='new-key'")).rows[0].status,'conflitante');
 });
 await test('continuous: uncertain memories and associations never gain authorized use',async()=>{
  await put('learn-inference','Talvez música me ajude');await save(await claim(),extraction([mem('Música ajuda','ajuda',{classificacao:'inferencia',evidencia:'música me ajude',fingerprint:'uncertain',aspecto:'pessoa:musica'})],[{sujeito:'música',relacao:'associado',objeto:'foco',evidencia:'música me ajude',justificativa:'Hipótese',confianca:.6,fingerprint:'assoc-learning'}]));
  assert.equal((await admin.query("select ativa from public.memorias where fingerprint='uncertain'")).rows[0].ativa,false);
  const ctx=await asUser(A,c=>rpc(c,'dn_contexto_copiloto',['learning-inference','interpretar']));assert(!ctx.memorias.some(x=>x.texto==='Música ajuda'));assert.equal(ctx.associacoes.length,0);
 });
 await test('continuous: rejection across new sources does not recreate associations',async()=>{
  const id=(await admin.query("select id from public.associacoes where fingerprint='assoc-learning'")).rows[0].id;
  await asUser(A,c=>rpc(c,'dn_associacao_decidir',[id,'rejeitar','teste']));
  await put('learn-rejected','música me ajude');await save(await claim(),extraction([],[{sujeito:'música',relacao:'associado',objeto:'foco',evidencia:'música me ajude',justificativa:'Hipótese',confianca:.8,fingerprint:'assoc-learning'}]));
  assert.equal((await admin.query("select count(*)::int n from public.associacoes where fingerprint='assoc-learning'")).rows[0].n,1);
  assert.equal((await admin.query('select estado_humano from public.associacoes where id=$1',[id])).rows[0].estado_humano,'rejeitada');
 });
 await test('continuous: disabled/deleted memory remains blocked on repeated evidence',async()=>{
  await asUser(A,c=>c.query("update public.memorias set status='desativada',ativa=false,disabled_at=now() where id=$1",[firstId]));
  await put('learn-disabled','Prefiro café');await save(await claim(),extraction([mem('Prefiro café','café')]));
  assert.equal((await admin.query('select status from public.memorias where id=$1',[firstId])).rows[0].status,'desativada');
 });
 await test('continuous: failed transaction rolls back all memories; checkpoint resumes',async()=>{
  await put('learn-invalid','Prefiro água');job=await claim();
  await rpc(admin,'dn_aprendizado_checkpoint',[job.id,job.lease_token,extraction([mem('Prefiro água','água',{fingerprint:'rollback',aspecto:'pessoa:agua'}),mem('inventado','invalid')])]);
  await assert.rejects(()=>rpc(admin,'dn_aprendizado_aplicar',[job.id,null]),e=>e.message.includes('Lease inválida'));
  await assert.rejects(()=>rpc(admin,'dn_aprendizado_aplicar',[job.id,job.lease_token]));
  assert.equal((await admin.query("select count(*)::int n from public.memorias where fingerprint='rollback'")).rows[0].n,0);
  assert((await admin.query('select resultado from public.aprendizado_fila where id=$1',[job.id])).rows[0].resultado);
  await admin.query("update public.aprendizado_fila set resultado=$2,lease_ate=now()-interval '1 second' where id=$1",[job.id,extraction([mem('Prefiro água','água',{fingerprint:'rollback',aspecto:'pessoa:agua'})])]);
  const resumed=await claim();assert.notEqual(resumed.lease_token,job.lease_token);await assert.rejects(()=>rpc(admin,'dn_aprendizado_aplicar',[job.id,job.lease_token]));
  await rpc(admin,'dn_aprendizado_aplicar',[resumed.id,resumed.lease_token]);
 });
 await test('continuous: RLS and RPC grants prevent cross-owner access and forged model output',async()=>{
  assert.equal((await asUser(B,c=>c.query('select * from public.aprendizado_fila'))).rowCount,0);
  for(const name of ['dn_aprendizado_claim','dn_aprendizado_checkpoint','dn_aprendizado_aplicar']){
   const args=name.endsWith('claim')?[A]:name.endsWith('checkpoint')?[job.id,job.lease_token,{}]:[job.id,job.lease_token];
   await assert.rejects(()=>asUser(A,c=>rpc(c,name,args)),e=>e.code==='42501');
  }
  await assert.rejects(()=>asUser(A,c=>c.query("update public.aprendizado_fila set resultado='{}'")),e=>e.code==='42501');
 });
 await test('continuous: daily OpenAI request budget is global and enforced atomically',async()=>{
  const attempts=await Promise.all(Array.from({length:10},()=>rpc(admin,'dn_aprendizado_reservar_cota',[8])));
  assert.equal(attempts.filter(Boolean).length,8);
  assert.equal(attempts.filter(x=>!x).length,2);
  assert.equal((await admin.query('select chamadas from public.aprendizado_cota_diaria where dia=(now() at time zone \'UTC\')::date')).rows[0].chamadas,8);
  await assert.rejects(()=>asUser(A,c=>rpc(c,'dn_aprendizado_reservar_cota',[8])),e=>e.code==='42501');
 });
 // Remove only fixtures from this suite; subsequent legacy scenarios have a clean baseline.
 await admin.query('delete from public.associacoes where user_id=$1',[A]);
 await admin.query('delete from public.memorias where user_id=$1',[A]);
 await admin.query('delete from public.aprendizado_fila where user_id=$1',[A]);
 await admin.query('delete from public.registros where user_id=$1',[A]);
};
