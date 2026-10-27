/* Isolated validation: never connects to config.js or a remote database. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
module.paths.unshift(path.join(process.env.DN_TEST_TOOLS || '/tmp/dn-validation-tools','js/node_modules'));
const { Client } = require('pg');
const ROOT = path.resolve(__dirname, '..');
const TOOLS = process.env.DN_TEST_TOOLS || '/tmp/dn-validation-tools';
const PG = {host: path.join(TOOLS, 'socket'), port:55439, user:'dn_test', database:'postgres'};
let admin, database;
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function asUser(id, fn) {
  const c = new Client({...PG,database}); await c.connect();
  try {await c.query('begin'); await c.query('set local role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]); const result = await fn(c); await c.query('commit'); return result;}
  catch(e){await c.query('rollback');throw e;} finally{await c.end();}
}
const A='00000000-0000-0000-0000-000000000001', B='00000000-0000-0000-0000-000000000002';
async function rpc(c,name,args){return (await c.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value;}
async function expectError(fn, code){await assert.rejects(fn, e=>!code || e.code===code);}
async function main(){
  assert(fs.existsSync(path.join(TOOLS,'data','PG_VERSION')), 'Disposable cluster marker required');
  const history = fs.readdirSync(path.join(ROOT,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
  // Existing scenarios each own and roll back their roles/schema.
  for(const file of ['etapa1_associacoes_postgres.sql','etapa2_associacoes_postgres.sql','etapa3_contexto_postgres.sql']){
    const r=spawnSync(path.join(TOOLS,'pg/usr/lib/postgresql/16/bin/psql'),['-X','-h',PG.host,'-p',String(PG.port),'-U',PG.user,'-d','postgres','-v','ON_ERROR_STOP=1','-f',path.join(__dirname,file)],{env:{...process.env,LD_LIBRARY_PATH:path.join(TOOLS,'pg/usr/lib/x86_64-linux-gnu')},encoding:'utf8'});
    if(r.status!==0)throw new Error(file+'\n'+r.stdout+'\n'+r.stderr);
    console.log('PASS '+file);passed++;
  }
  const bootstrap=new Client(PG);await bootstrap.connect();
  database='dn_validation_'+Date.now();await bootstrap.query('create database '+database);
  for(const name of ['anon','authenticated'])if(!(await bootstrap.query('select 1 from pg_roles where rolname=$1',[name])).rowCount)await bootstrap.query('create role '+name+' nologin');
  await bootstrap.end();
  admin=new Client({...PG,database});await admin.connect();
  await admin.query(`create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''), nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for(const file of history){await admin.query('begin');try{await admin.query(fs.readFileSync(path.join(ROOT,'supabase/migrations',file),'utf8'));await admin.query('commit');}catch(e){await admin.query('rollback');throw new Error(file+': '+e.message);}}
  console.log('PASS ordered migrations: '+history.join(', '));passed++;
  await admin.query(`insert into auth.users values ($1),($2)`,[A,B]);
  // Test-only source table: absent from repository migrations, never assumed to match production.
  await admin.query(`create table public.registros(id text primary key,user_id uuid not null references auth.users(id) on delete cascade,registrado_em timestamptz default now(),texto_original text not null,entrada text default 'texto',origem text default 'teste');
    alter table public.registros enable row level security; grant select,insert on public.registros to authenticated;
    create policy fixture_read on public.registros for select to authenticated using(user_id=auth.uid());
    create policy fixture_insert on public.registros for insert to authenticated with check(user_id=auth.uid());`);
  const run=await asUser(A,c=>c.query("insert into public.reanalisacoes(user_id,context_version) values($1,'test') returning id",[A]));
  const runA=run.rows[0].id;
  await asUser(B,c=>c.query("insert into public.memorias(user_id,texto,origem,fingerprint,canonical_key) values($1,'B-private-memory','outra','B-private','B-private')",[B]));
  const candidate={source_record_id:'fixture-source',reanalysis_id:runA,sujeito:'cantar',relacao:'parece associado',objeto:'felicidade',evidencia:'canto e feliz',justificativa:'coocorrência',confianca_modelo:.7,fingerprint:'fixture-fp',context_version:'test',modelo:'fake'};
  let assoc;
  await test('read-only publication preflight executes locally',async()=>{await admin.query(fs.readFileSync(path.join(ROOT,'supabase/validation/preflight.sql'),'utf8'));});
  await test('candidate default and automatic audit',async()=>{
    assert.equal(await asUser(A,c=>rpc(c,'dn_associacao_registrar',[candidate])),'criada');
    assoc=(await admin.query('select * from public.associacoes where user_id=$1',[A])).rows[0];
    assert.equal(assoc.estado_humano,'em_observacao');assert.equal(assoc.uso_permitido,false);
    assert.equal((await admin.query("select count(*)::int n from public.associacao_historico where associacao_id=$1 and acao='criada'",[assoc.id])).rows[0].n,1);
  });
  await test('RLS and owner RPC isolation',async()=>{
    assert.equal((await asUser(B,c=>c.query('select * from public.associacoes'))).rowCount,0);
    await expectError(()=>asUser(B,c=>rpc(c,'dn_associacao_decidir',[assoc.id,'confirmar',null])),'P0002');
    await expectError(()=>asUser(B,c=>rpc(c,'dn_associacao_registrar',[candidate])),'42501');
    await expectError(()=>asUser('',c=>rpc(c,'dn_contexto_copiloto',['anonymous','interpretar'])),'42501');
  });
  await test('direct audit/state/origin mutation denied',async()=>{
    for(const sql of ["update public.associacoes set estado_humano='confirmada'", "update public.associacoes set source_record_id='forged'", "insert into public.associacao_historico(user_id,associacao_id,acao) values($1,$2,'confirmada')"])
      await expectError(()=>asUser(A,c=>c.query(sql,sql.includes('$1')?[A,assoc.id]:[])),'42501');
  });
  await test('decisions separate permission and reject blocks use',async()=>{
    await expectError(()=>asUser(A,c=>rpc(c,'dn_associacao_decidir',[assoc.id,'permitir_uso',null])),'23514');
    await asUser(A,c=>rpc(c,'dn_associacao_decidir',[assoc.id,'confirmar',null]));
    assert.equal((await admin.query('select uso_permitido from public.associacoes where id=$1',[assoc.id])).rows[0].uso_permitido,false);
    await asUser(A,c=>rpc(c,'dn_associacao_decidir',[assoc.id,'permitir_uso',null]));
    const ctx=await asUser(A,c=>rpc(c,'dn_contexto_copiloto',['allowed','interpretar']));assert.equal(ctx.associacoes.length,1);
    await asUser(A,c=>rpc(c,'dn_associacao_decidir',[assoc.id,'rejeitar','fake decision']));
    assert.equal((await asUser(A,c=>rpc(c,'dn_contexto_copiloto',['rejected','interpretar']))).associacoes.length,0);
  });
  await test('reencounter and concurrent dedup preserve rejection',async()=>{
    const outcomes=await Promise.all(Array.from({length:4},()=>asUser(A,c=>rpc(c,'dn_associacao_registrar',[candidate]))));assert(outcomes.every(x=>x==='reencontrada'));
    const rows=(await admin.query('select * from public.associacoes where id=$1',[assoc.id])).rows;assert.equal(rows.length,1);assert.equal(rows[0].estado_humano,'rejeitada');assert.equal(rows[0].uso_permitido,false);
    const fresh={...candidate,fingerprint:'concurrent-new'};
    const concurrent=await Promise.all(Array.from({length:4},()=>asUser(A,c=>rpc(c,'dn_associacao_registrar',[fresh]))));assert.equal(concurrent.filter(x=>x==='criada').length,1);
  });
  await test('active confirmed memories only, corrections retain independents',async()=>{
    for(const [text,origin,confirmed] of [['correction','correcao_explicitamente_lembrada',true],['independent','inferencia_ia_confirmada',true],['unconfirmed','registro_declaracao_clara',false]])await asUser(A,c=>c.query(`insert into public.memorias(user_id,texto,origem,confirmed_by_user,confirmed_at,fingerprint,canonical_key) values($1,$2,$3,$4,case when $4 then now() end,$2,$2)`,[A,text,origin,confirmed]));
    const ctx=await asUser(A,c=>rpc(c,'dn_contexto_copiloto',['corrected','decidir_agora']));assert.equal(ctx.memorias[0].texto,'correction');assert(ctx.memorias.some(m=>m.texto==='independent'));assert(!ctx.memorias.some(m=>m.texto==='unconfirmed'));
  });
  await test('traditional memory audit protected and normal deletion audited',async()=>{
    const m=await asUser(A,c=>c.query("insert into public.memorias(user_id,texto,origem,fingerprint,canonical_key) values($1,'temporary-memory','outra','temporary','temporary') returning id",[A]));
    const id=m.rows[0].id;
    await expectError(()=>asUser(A,c=>c.query("insert into public.memoria_historico(user_id,memoria_id,acao) values($1,$2,'confirmada')",[A,id])),'42501');
    await asUser(A,c=>c.query('delete from public.memorias where id=$1',[id]));
    assert.equal((await admin.query("select count(*)::int n from public.memoria_historico where acao='excluida_permanentemente' and valor_anterior->>'id'=$1",[id])).rows[0].n,1);
  });
  await test('deferred reanalysis FK and immutable source',async()=>{
    await expectError(()=>admin.query('delete from public.reanalisacoes where id=$1',[runA]),'23503');
    await expectError(()=>admin.query("update public.associacoes set source_record_id='changed' where id=$1",[assoc.id]),'P0001');
  });
  await require('./validate_flows.cjs')({ROOT,TOOLS,PG,database,admin,asUser,rpc,A,B,test});
  await test('account deletion includes memories, runs, associations and history',async()=>{
    const memoryIds=(await admin.query('select id from public.memorias where user_id=$1 order by id',[A])).rows;
    if(memoryIds.length>1){
      await asUser(A,c=>c.query('update public.memorias set supersedes=$1 where id=$2',[memoryIds[0].id,memoryIds[1].id]));
      await asUser(A,c=>c.query("insert into public.memoria_fontes(user_id,memoria_id,record_id,fingerprint) values($1,$2,'browser-source','delete-source')",[A,memoryIds[0].id]));
    }

    await admin.query('delete from auth.users where id=$1',[A]);
    for(const t of ['memorias','memoria_historico','memoria_fontes','memoria_usos','interpretacoes','interpretacoes_historico','registros','reanalisacoes','associacoes','associacao_historico','associacao_usos'])assert.equal((await admin.query(`select count(*)::int n from public.${t} where user_id=$1`,[A])).rows[0].n,0);
    assert.equal((await admin.query('select count(*)::int n from auth.users where id=$1',[B])).rows[0].n,1);
    assert.equal((await admin.query('select count(*)::int n from public.memorias where user_id=$1',[B])).rows[0].n,1);
  });
  console.log(`DATABASE=${database}\nPASS ${passed} validation groups`);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(admin)await admin.end();});
