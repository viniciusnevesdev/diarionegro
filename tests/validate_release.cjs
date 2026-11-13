// Applies only the new release over the user-confirmed remote baseline, locally.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),TOOLS='/tmp/dn-validation-tools';
const {Client}=require(path.join(TOOLS,'js/node_modules/pg'));
const pg={host:path.join(TOOLS,'socket'),port:55439,user:'dn_test',database:'postgres'};
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'supabase/release-baseline.json')));
const prep=spawnSync('python3',['-c',"import sys;sys.path.insert(0,'scripts');import publicacao_governanca as r;print(r.prepare())"],{cwd:ROOT,encoding:'utf8'});assert.equal(prep.status,0,prep.stderr);
const output=prep.stdout.trim(),bundle=fs.readFileSync(path.join(output,'aplicar.sql'),'utf8');
let control;let passed=0;
async function database(){
 const name='dn_release_'+Date.now()+'_'+Math.floor(Math.random()*10000);
 await control.query('create database '+name);const db=new Client({...pg,database:name});await db.connect();
 await db.query(`create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table public.registros(id text primary key,user_id uuid not null references auth.users(id),texto_original text not null,entrada text not null,origem text not null default 'teste',registrado_em timestamptz default now());
 create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
 create table public.fixture_station_house(id integer primary key,label text);insert into public.fixture_station_house values(1,'Estação fictícia preservada');`);
 for(const item of manifest.baseline){
  const source=item.local_source?fs.readFileSync(path.join(ROOT,'supabase/migrations',item.local_source),'utf8'):null;
  const isContainment=item.version==='20261113065053';
  // O espelho da contencao exige assinatura PG17. Sua aplicacao ja foi homologada remotamente.
  // Na fixture PG16 preservamos apenas a declaracao EXATA de historico, sem reexecuta-la.
  if(source&&!isContainment)await db.query(source);
  const recorded=isContainment?source.slice(source.indexOf('DO $contain$')).trim():(item.remote_statements_md5?source:'original-remote-statements');
  await db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',[item.version,item.name,[recorded]]);
 }
 return {name,db};
}
function apply(name,text){return spawnSync(path.join(TOOLS,'pg/usr/lib/postgresql/16/bin/psql'),['-X','-h',pg.host,'-p',String(pg.port),'-U',pg.user,'-d',name,'-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',env:{...process.env,LD_LIBRARY_PATH:path.join(TOOLS,'pg/usr/lib/x86_64-linux-gnu')}});}
(async()=>{assert(fs.existsSync(path.join(TOOLS,'data/PG_VERSION')));control=new Client(pg);await control.connect();
 await control.query("do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;");
 let {name,db}=await database();
 const before=(await db.query('select * from supabase_migrations.schema_migrations order by version')).rows;
 if(!manifest.pending.length) {
   let r=apply(name,bundle);assert.equal(r.status,0,r.stderr);
   assert.deepEqual((await db.query('select * from supabase_migrations.schema_migrations order by version')).rows,before);
   console.log('PASS remote baseline no-op, all 16 migrations preserved');passed++;
   assert.equal((await db.query('select label from public.fixture_station_house')).rows[0].label,'Estação fictícia preservada');
   console.log('PASS Estação Casa preserved');passed++;
   r=apply(name,fs.readFileSync(path.join(output,'validar.sql'),'utf8'));assert.equal(r.status,0,r.stderr);
   console.log('PASS read-only release validation');passed++;
   r=apply(name,bundle);assert.equal(r.status,0,r.stderr);
   console.log('PASS idempotent no-op release');passed++;
   await db.query("update supabase_migrations.schema_migrations set statements=array['tampered'] where version='20261113073842'");
   r=apply(name,bundle);assert.notEqual(r.status,0);assert(r.stderr.includes('Baseline mismatch'));
   console.log('PASS remote content mismatch refused');passed++;
   await db.query('insert into supabase_migrations.schema_migrations values ($1,$2,$3)',['20990101000000','unexpected',['test']]);
   r=apply(name,bundle);assert.notEqual(r.status,0);
   console.log('PASS unexpected migration refused');passed++;
   await db.end();console.log(`PASS ${passed} release database checks`);
   return;
 }
 let result=apply(name,bundle);assert.equal(result.status,0,result.stderr);console.log('PASS pending migration applied, no replay of remote baseline');passed++;
 assert.deepEqual((await db.query("select * from supabase_migrations.schema_migrations where version <> '20261113073842' order by version")).rows,before);
 assert.equal((await db.query('select label from public.fixture_station_house')).rows[0].label,'Estação fictícia preservada');console.log('PASS remote baseline, statements and Estação data preserved');passed++;
 result=apply(name,fs.readFileSync(path.join(output,'validar.sql'),'utf8'));assert.equal(result.status,0,result.stderr);console.log('PASS post-deployment read-only validation');passed++;
 const backupFolder=fs.mkdtempSync(path.join(TOOLS,'release-backup-')),backup=path.join(backupFolder,'fixture.dump');
 const dump=spawnSync(path.join(TOOLS,'pg/usr/lib/postgresql/16/bin/pg_dump'),['-h',pg.host,'-p',String(pg.port),'-U',pg.user,'-d',name,'--format=custom','--file',backup],{env:{...process.env,LD_LIBRARY_PATH:path.join(TOOLS,'pg/usr/lib/x86_64-linux-gnu')},encoding:'utf8'});assert.equal(dump.status,0,dump.stderr);
 const restoredName=name+'_restored';await control.query('create database '+restoredName);
 const restored=spawnSync(path.join(TOOLS,'pg/usr/lib/postgresql/16/bin/pg_restore'),['-h',pg.host,'-p',String(pg.port),'-U',pg.user,'--dbname',restoredName,'--exit-on-error',backup],{env:{...process.env,LD_LIBRARY_PATH:path.join(TOOLS,'pg/usr/lib/x86_64-linux-gnu')},encoding:'utf8'});assert.equal(restored.status,0,restored.stderr);
 result=apply(restoredName,fs.readFileSync(path.join(output,'validar.sql'),'utf8'));assert.equal(result.status,0,result.stderr);console.log('PASS custom-format backup restored into another disposable database');passed++;

 result=apply(name,bundle);assert.equal(result.status,0,result.stderr);assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,16);console.log('PASS reapplication skips exactly registered migrations');passed++;
 await db.query("update supabase_migrations.schema_migrations set statements=array['tampered'] where version='20261113073842'");result=apply(name,bundle);assert.notEqual(result.status,0);assert(result.stderr.includes('content mismatch'));console.log('PASS changed pending history refused');passed++;
 await db.end();({name,db}=await database());
 result=apply(name,bundle.replace('commit;','select 1/0;\ncommit;'));assert.notEqual(result.status,0);
 assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,15);assert((await db.query("select to_regclass('public.aprendizado_fila') value")).rows[0].value);assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname='aprendizado_fila_redigir_concluido'")).rows[0].n,1);assert.equal((await db.query("select count(*)::int n from pg_proc where proname='dn_aprendizado_reservar_cota'")).rows[0].n,0);console.log('PASS failure rolls back learning DDL and migration history together');passed++;
 await db.query("update supabase_migrations.schema_migrations set statements=array['tampered'] where version='20261027120000'");result=apply(name,bundle);assert.notEqual(result.status,0);assert(result.stderr.includes('Baseline mismatch'));
 await db.query('update supabase_migrations.schema_migrations set statements=$1 where version=$2',[[fs.readFileSync(path.join(ROOT,'supabase/migrations/20261027120000_create_associacoes_governanca.sql'),'utf8')],'20261027120000']);
 await db.query("update supabase_migrations.schema_migrations set name='wrong' where version='20261024181522'");result=apply(name,bundle);assert.notEqual(result.status,0);assert(result.stderr.includes('Baseline mismatch'));console.log('PASS unexpected baseline name or content refused before changes');passed++;
 await db.end();console.log(`PASS ${passed} release database checks`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(control)await control.end();});
