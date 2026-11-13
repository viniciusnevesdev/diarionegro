// Real PostgreSQL; cron, Vault and HTTP are test doubles: no extension or egress.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({admin,A,ROOT,test})=>{
 const sql=fs.readFileSync(path.join(ROOT,'supabase/validation/instalar_aprendizado_scheduler.sql'),'utf8');
 await admin.query(`create schema cron;create schema vault;create schema net;
 create table vault.decrypted_secrets(name text primary key,decrypted_secret text);
 create table cron.job(jobname text primary key,schedule text,command text);
 create function cron.schedule(text,text,text) returns bigint language plpgsql as $$begin
 insert into cron.job values($1,$2,$3) on conflict(jobname) do update set schedule=$2,command=$3;return 1;end$$;
 create table net.calls(url text,headers jsonb,body jsonb,timeout integer);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin
 insert into net.calls values($1,$2,$3,$4);return 1;end$$;`);
 await test('scheduler: missing pg_cron, pg_net or Vault surface refuses installation',async()=>{
  await admin.query('drop function net.http_post(text,jsonb,jsonb,integer)');
  await assert.rejects(()=>admin.query(sql),/Habilite pg_cron, pg_net e Vault/);
  await admin.query('rollback');
  await admin.query(`create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin
   insert into net.calls values($1,$2,$3,$4);return 1;end$$;`);
 });
 await test('scheduler: missing or empty Vault secrets refuse installation atomically',async()=>{
  for(const value of [null,'   ']){
   if(value!==null)await admin.query("insert into vault.decrypted_secrets values('dn_learning_url','https://edge.invalid/functions/v1/aprender-registro'),('dn_learning_scheduler_key',$1),('dn_learning_anon_jwt','test-anon')",[value]);
   await assert.rejects(()=>admin.query(sql),/Configure os tres secrets/);
   await admin.query('rollback');
   assert.equal((await admin.query('select * from cron.job')).rowCount,0);
  }
 });
 await test('scheduler: reinstall is idempotent and an empty queue sends nothing',async()=>{
  await admin.query("update vault.decrypted_secrets set decrypted_secret='test-scheduler' where name='dn_learning_scheduler_key'");
  await admin.query(sql);await admin.query(sql);
  const jobs=(await admin.query('select * from cron.job')).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].schedule,'*/5 * * * *');
  await admin.query(jobs[0].command);assert.equal((await admin.query('select * from net.calls')).rowCount,0);
 });
 await test('scheduler: due jobs send one authenticated call; backoff and leases suppress calls',async()=>{
  await admin.query("insert into public.registros(id,user_id,texto_original,entrada) values('scheduler-audio',$1,'Prefiro café','audio_ia')",[A]);
  const command=(await admin.query('select command from cron.job')).rows[0].command;
  for(const update of ["disponivel_em=now()+interval '1 hour'","disponivel_em=now(),lease_ate=now()+interval '10 minutes'","lease_ate=now()-interval '1 second',estado='concluido'"]){
   await admin.query('update public.aprendizado_fila set '+update);await admin.query(command);
   assert.equal((await admin.query('select * from net.calls')).rowCount,0);
  }
  await admin.query("update public.aprendizado_fila set estado='pendente'");await admin.query(command);
  const calls=(await admin.query('select * from net.calls')).rows;assert.equal(calls.length,1);
  assert(calls.every(c=>c.headers.Authorization==='Bearer test-anon'&&c.headers['x-dn-scheduler']==='test-scheduler'&&c.timeout===120000&&c.url.endsWith('/aprender-registro')));
  await admin.query("delete from public.aprendizado_fila where record_id='scheduler-audio';delete from public.registros where id='scheduler-audio'");
 });
 await admin.query('drop schema cron cascade;drop schema vault cascade;drop schema net cascade');
};
