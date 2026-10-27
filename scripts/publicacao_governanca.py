#!/usr/bin/env python3
"""Local preparation by default. Remote commands require an explicit gate and a private config."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import stat
import subprocess
import sys
import time
import uuid
from urllib.parse import urlsplit, unquote
from urllib.request import urlopen
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TOOLS = Path('/tmp/dn-validation-tools')
CONFIG = Path.home() / '.config/diarionegro/publicacao.env'
STATE = Path.home() / '.local/state/diarionegro/releases'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def sources():
    baseline = json.loads((ROOT / 'supabase/release-baseline.json').read_text())
    for item in baseline['baseline'] + baseline['pending']:
        if item['local_source']:
            data = (ROOT / 'supabase/migrations' / item['local_source']).read_bytes()
            if digest(data) != item['sha256']:
                raise ValueError('Migration differs from reviewed manifest: ' + item['local_source'])
    return baseline


def public_files():
    files = json.loads((ROOT / 'scripts/frontend-publico.json').read_text())
    if len(files) != len(set(files)):
        raise ValueError('Duplicate public asset')
    for name in files:
        p = ROOT / name
        if p.is_symlink() or not p.is_file() or not p.resolve().is_relative_to(ROOT):
            raise ValueError('Invalid public asset: ' + name)
    return files


def pages_config():
    # Explicit paths: no dependency on Jekyll glob precedence. Rebuild if new root files are added.
    allowed = set(public_files())
    excluded = set()
    def visit(folder):
        for p in folder.iterdir():
            rel = p.relative_to(ROOT).as_posix()
            if rel == '_config.yml' or rel in allowed:
                continue
            if p.is_dir() and not p.is_symlink() and any(name.startswith(rel + '/') for name in allowed):
                visit(p)
            else:
                excluded.add(rel)
    visit(ROOT)
    return {'exclude': sorted(excluded)}


def build_frontend():
    files = public_files()
    manifest = {name: digest((ROOT / name).read_bytes()) for name in files}
    release_id = digest(json.dumps(manifest, sort_keys=True).encode())[:12]
    output = ROOT / 'dist' / ('governanca-v083-' + release_id)
    output.mkdir(parents=True, exist_ok=True)
    archive = output / 'frontend.zip'
    if not archive.exists():
        with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as bundle:
            for name in files:
                bundle.write(ROOT / name, name)
    with zipfile.ZipFile(archive) as bundle:
        if sorted(bundle.namelist()) != sorted(files):
            raise ValueError('Unexpected archive contents')
        for name in files:
            if digest(bundle.read(name)) != manifest[name]:
                raise ValueError('Archive differs from source: ' + name)
    (output / 'sha256.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return archive


def history_guard(manifest):
    items = manifest['baseline'] + manifest['pending']
    versions = ','.join("'%s'" % item['version'] for item in items)
    assertions = []
    for item in manifest['baseline']:
        assertions.append("if not exists (select 1 from supabase_migrations.schema_migrations where version='%s' and name='%s') then raise exception 'Baseline mismatch: %s'; end if;" % (item['version'], item['name'], item['version']))
    for item in manifest['pending']:
        text = (ROOT / 'supabase/migrations' / item['local_source']).read_text()
        md5 = hashlib.md5(text.encode()).hexdigest()
        assertions.append("if exists (select 1 from supabase_migrations.schema_migrations where version='%s' and (name is distinct from '%s' or md5(array_to_string(statements,E'\\n')) is distinct from '%s')) then raise exception 'Pending migration content mismatch: %s'; end if;" % (item['version'],item['name'],md5,item['version']))
    assertions.append("if exists (select 1 from supabase_migrations.schema_migrations where version not in (%s)) then raise exception 'Unexpected migration history; refusing automatic reconciliation'; end if;" % versions)
    return 'do $guard$ begin\n' + '\n'.join(assertions) + '\nend $guard$;\n'


def application_sql(manifest):
    sql = "\\set ON_ERROR_STOP on\nbegin;\nset local lock_timeout='10s';\nselect pg_advisory_xact_lock(836027);\nlock table supabase_migrations.schema_migrations in share row exclusive mode;\n"
    sql += history_guard(manifest)
    for item in manifest['pending']:
        text = (ROOT / 'supabase/migrations' / item['local_source']).read_text()
        tag = '$body_' + item['version'] + '$'
        if tag in text:
            raise ValueError('SQL delimiter collision')
        sql += "select not exists (select 1 from supabase_migrations.schema_migrations where version='%s') as dn_apply \\gset\n\\if :dn_apply\n" % item['version']
        sql += text + '\n'
        sql += "insert into supabase_migrations.schema_migrations(version,name,statements) values('%s','%s',array[%s%s%s]);\n\\endif\n" % (item['version'],item['name'],tag,text,tag)
    sql += "notify pgrst, 'reload schema';\ncommit;\n"
    return sql


def validation_sql(manifest):
    sql = 'begin read only;\n' + history_guard(manifest)
    for item in manifest['pending']:
        sql += "do $present$ begin if not exists(select 1 from supabase_migrations.schema_migrations where version='%s') then raise exception 'Migration missing: %s'; end if; end $present$;\n" % (item['version'], item['version'])
    sql += """do $verify$ declare t text; f text; begin
  foreach t in array array['associacoes','associacao_historico','associacao_usos'] loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t and c.relrowsecurity) then raise exception 'Missing table/RLS: %',t; end if;
  end loop;
  if has_table_privilege('authenticated','public.associacao_historico','INSERT') or has_table_privilege('authenticated','public.memoria_historico','INSERT') then raise exception 'Unprotected audit'; end if;
  foreach f in array array['public.dn_associacao_decidir(uuid,text,text)','public.dn_associacao_registrar(jsonb)','public.dn_contexto_copiloto(text,text)'] loop
    if not has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE') then raise exception 'Invalid RPC grants: %',f; end if;
  end loop;
  if position('v_has_correction' in pg_get_functiondef('public.dn_contexto_copiloto(text,text)'::regprocedure)) > 0 then raise exception 'Outdated context function'; end if;
end $verify$;
select version,name from supabase_migrations.schema_migrations order by version;
rollback;
"""
    return sql


def prepare():
    manifest = sources()
    (ROOT / '_config.yml').write_text('# Generated by scripts/publicacao_governanca.py preparar; JSON is valid YAML.\n' + json.dumps(pages_config(), indent=2) + '\n')
    archive = build_frontend()
    hashes = {str(p.relative_to(ROOT)): digest(p.read_bytes()) for p in [ROOT / '_config.yml', ROOT / 'supabase/config.toml', ROOT / 'supabase/functions/copiloto/index.ts', ROOT / 'supabase/functions/reanalisar-historico/index.ts']}
    receipt = {'baseline': manifest['baseline'], 'pending': manifest['pending'], 'hashes': hashes, 'frontend_sha256': digest(archive.read_bytes()), 'frontend_archive': str(archive.relative_to(ROOT))}
    release_id = digest(json.dumps(receipt, sort_keys=True).encode())[:12]
    output = ROOT / 'dist' / ('publicacao-governanca-' + release_id)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'aplicar.sql').write_text(application_sql(manifest))
    (output / 'validar.sql').write_text(validation_sql(manifest))
    (output / 'manifest.json').write_text(json.dumps(receipt, indent=2) + '\n')
    git_files = set(public_files()) | {'_config.yml', '.gitignore', 'supabase/config.toml', 'supabase/release-baseline.json', 'supabase/validation/preflight.sql', 'scripts/publicacao_governanca.py', 'scripts/preparar-publicacao-governanca.py', 'scripts/frontend-publico.json'}
    git_files.update('supabase/migrations/' + item['local_source'] for item in manifest['pending'])
    git_files.update('supabase/functions/' + name + '/index.ts' for name in ('copiloto', 'reanalisar-historico'))
    git_files.update(str(p.relative_to(ROOT)) for p in (ROOT / 'tests').iterdir() if p.is_file() and p.suffix in ('.py', '.sql', '.cjs', '.ts', '.json'))
    (output / 'git-files.txt').write_text('\n'.join(sorted(git_files)) + '\n')
    return output


def backend_signature(output):
    receipt = json.loads((output / 'manifest.json').read_text())
    relevant = {key: receipt[key] for key in ('baseline', 'pending')}
    relevant['hashes'] = {name: value for name, value in receipt['hashes'].items() if name != '_config.yml'}
    return digest(json.dumps(relevant, sort_keys=True).encode())


def configuration():
    if not CONFIG.exists():
        raise ValueError('Configure somente ~/.config/diarionegro/publicacao.env (0600), conforme PLANO_FINAL_PUBLICACAO.md.')
    if CONFIG.is_symlink() or stat.S_IMODE(CONFIG.stat().st_mode) != 0o600 or CONFIG.stat().st_uid != os.getuid():
        raise ValueError('A configuração deve pertencer ao usuário e ter permissão 0600.')
    result = {}
    for line in CONFIG.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        k, sep, v = line.partition('=')
        if not sep or k.strip() not in ('DN_DATABASE_URL','SUPABASE_ACCESS_TOKEN'):
            raise ValueError('Chave inválida no arquivo de configuração.')
        parts = shlex.split(v, comments=False)
        if len(parts) != 1:
            raise ValueError('Valor inválido no arquivo de configuração.')
        result[k.strip()] = parts[0]
    if not all(result.get(k) for k in ('DN_DATABASE_URL','SUPABASE_ACCESS_TOKEN')):
        raise ValueError('Faltam DN_DATABASE_URL ou SUPABASE_ACCESS_TOKEN na configuração única.')
    if CONFIG.resolve().is_relative_to(ROOT):
        raise ValueError('Credenciais devem ficar fora do repositório.')
    project_url = re.search(r'supabaseUrl:\s*"([^"]+)"', (ROOT / 'config.js').read_text()).group(1)
    result['PROJECT_REF'] = urlsplit(project_url).hostname.split('.')[0]
    uri = urlsplit(result['DN_DATABASE_URL'])
    if uri.scheme not in ('postgres','postgresql') or not uri.hostname:
        raise ValueError('Conexão PostgreSQL inválida.')
    if not (uri.hostname == 'db.' + result['PROJECT_REF'] + '.supabase.co' or (uri.hostname.endswith('.pooler.supabase.com') and unquote(uri.username or '').endswith('.' + result['PROJECT_REF']))):
        raise ValueError('O banco não corresponde ao projeto já configurado no frontend.')
    return result


def tools_env(conf):
    env = dict(os.environ)
    for key in ('PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGHOSTADDR'):
        env.pop(key, None)
    uri = urlsplit(conf['DN_DATABASE_URL'])
    env.update(PGHOST=uri.hostname, PGPORT=str(uri.port or 5432), PGDATABASE=unquote(uri.path.lstrip('/') or 'postgres'), PGUSER=unquote(uri.username or 'postgres'), PGPASSWORD=unquote(uri.password or ''), PGSSLMODE='require', PGCONNECT_TIMEOUT='10', SUPABASE_ACCESS_TOKEN=conf['SUPABASE_ACCESS_TOKEN'])
    env['PATH'] = str(TOOLS / 'node-v22.16.0-linux-x64/bin') + os.pathsep + env.get('PATH','')
    env['LD_LIBRARY_PATH'] = str(TOOLS / 'pg/usr/lib/x86_64-linux-gnu') + os.pathsep + env.get('LD_LIBRARY_PATH','')
    return env


def binary(name):
    found = shutil.which(name)
    if found:
        return found
    pg = TOOLS / 'pg/usr/lib/postgresql/16/bin' / name
    cli = TOOLS / 'js/node_modules/.bin' / name
    if pg.exists():
        return str(pg)
    if cli.exists():
        return str(cli)
    raise ValueError('Ferramenta local ausente: ' + name)


def run(args, env, conf):
    proc = subprocess.run(args, cwd=ROOT, env=env, capture_output=True, text=True)
    if proc.returncode:
        # Never print CLI invocations, URLs, tokens or raw database errors.
        raise RuntimeError('Operação falhou: ' + Path(args[0]).name + '. Nenhuma credencial foi exibida; interrompido antes da próxima etapa.')
    return proc.stdout


def check_history(conf, env, manifest):
    sql = 'begin read only;\n' + history_guard(manifest) + 'rollback;'
    run([binary('psql'),'-X','-v','ON_ERROR_STOP=1','-c',sql],env,conf)


def remote(action, authorized):
    if not authorized:
        raise ValueError('Operação remota não autorizada: use --autorizar-remoto somente após aprovação explícita.')
    conf = configuration()
    env = tools_env(conf)
    output = prepare()
    manifest = sources()
    project = conf['PROJECT_REF']
    cli = binary('supabase')
    flags = ['DN_MEMORY_CONTEXT_ENABLED=false','DN_HISTORICAL_REANALYSIS_ENABLED=false']
    if action == 'contingencia':
        run([cli,'secrets','set',*flags,'--project-ref',project],env,conf)
        print('Contexto e reanálise desativados; dados preservados.')
        return
    if action == 'ativar':
        pointer = STATE / 'latest.json'
        if not pointer.exists() or json.loads(pointer.read_text()).get('backend_signature') != backend_signature(output):
            raise ValueError('Não há recibo de implantação deste pacote.')
        with urlopen('https://viniciusnevesdev.github.io/diarionegro/',timeout=30) as response:
            if digest(response.read()) != digest((ROOT / 'index.html').read_bytes()):
                raise ValueError('O Pages ainda não serve o frontend preparado.')
        run([binary('psql'),'-X','-v','ON_ERROR_STOP=1','-f',str(output / 'validar.sql')],env,conf)
        run([cli,'secrets','set','DN_MEMORY_CONTEXT_ENABLED=true','DN_HISTORICAL_REANALYSIS_ENABLED=true','--project-ref',project],env,conf)
        print('Contexto e reanálise habilitados. Nenhuma reanálise foi executada.')
        return
    check_history(conf,env,manifest)
    folder = STATE / (time.strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:8] + '-' + output.name)
    folder.mkdir(parents=True, mode=0o700)
    backup = folder / 'antes.dump'
    fd = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    run([binary('pg_dump'),'--format=custom','--file',str(backup)],env,conf)
    run([binary('pg_restore'),'--list',str(backup)],env,conf)
    print('Backup protegido criado em ' + str(backup))
    run([cli,'secrets','set',*flags,'--project-ref',project],env,conf)
    for name in ('copiloto','reanalisar-historico'):
        run([cli,'functions','deploy',name,'--project-ref',project,'--use-api'],env,conf)
    run([binary('psql'),'-X','-v','ON_ERROR_STOP=1','-f',str(output / 'aplicar.sql')],env,conf)
    run([binary('psql'),'-X','-v','ON_ERROR_STOP=1','-f',str(output / 'validar.sql')],env,conf)
    pointer = STATE / 'latest.json'
    pointer.write_text(json.dumps({'release':output.name,'backend_signature':backend_signature(output),'backup':str(backup),'project':project})+'\n')
    pointer.chmod(0o600)
    print('Backend implantado e validado; funcionalidades continuam desativadas até publicar o frontend e executar ativar.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action',choices=['preparar','implantar-backend','ativar','contingencia'],nargs='?',default='preparar')
    parser.add_argument('--autorizar-remoto',action='store_true')
    args = parser.parse_args()
    if args.action == 'preparar':
        output = prepare()
        print('Pacote local: ' + str(output))
        print('Pendentes: ' + ', '.join(x['version'] for x in sources()['pending']))
    else:
        remote(args.action,args.autorizar_remoto)

if __name__ == '__main__':
    try:
        main()
    except (ValueError,RuntimeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
