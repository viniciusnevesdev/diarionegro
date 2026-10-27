"""Release-only checks: never uses remote credentials or repeats the application suite."""
import contextlib
import io
import importlib.util
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release', ROOT / 'scripts/publicacao_governanca.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleasePreparationTest(unittest.TestCase):
    def test_remote_baseline_and_station_preserved(self):
        manifest = release.sources()
        self.assertEqual([x['version'] for x in manifest['baseline']], ['20261024181522','20261024204437','20261024204521','20261024224404'])
        self.assertEqual(manifest['baseline'][0]['name'], 'station_202610240001')
        self.assertIsNone(manifest['baseline'][0]['local_source'])
        self.assertEqual(len(manifest['pending']), 5)
        sql = release.application_sql(manifest)
        self.assertNotIn('create table if not exists public.memorias', sql)
        self.assertNotIn('migration repair', sql)
        self.assertIn('lock table supabase_migrations.schema_migrations', sql)
        for item in manifest['baseline']:
            self.assertNotIn("values('%s'" % item['version'], sql)

    def test_pages_publishes_only_the_approved_files(self):
        expected = set(release.public_files())
        cfg = release.pages_config()
        on_disk = json.loads('\n'.join((ROOT / '_config.yml').read_text().splitlines()[1:]))
        self.assertEqual(cfg, on_disk, 'Run preparar again after adding files')
        for p in ROOT.rglob('*'):
            rel = p.relative_to(ROOT).as_posix()
            if not p.is_file() or rel == '_config.yml':
                continue
            excluded = any(rel == e or rel.startswith(e + '/') for e in cfg['exclude'])
            self.assertEqual(not excluded, rel in expected, rel)
        for target in ('CONTEXTO_PESSOAL_V08.md','supabase','tests','scripts','dist'):
            self.assertIn(target, cfg['exclude'])

    def test_frontend_references_and_archive(self):
        files = set(release.public_files())
        html = (ROOT / 'index.html').read_text()
        for value in re.findall(r'(?:href|src)="([^\"]+)"', html):
            if value.startswith(('https:','#','data:')):
                continue
            name = value.split('?',1)[0]
            self.assertIn(name, files)
        with zipfile.ZipFile(release.build_frontend()) as archive:
            self.assertEqual(set(archive.namelist()), files)
            self.assertFalse(any(name.endswith(('.md','.sql','.ts','.py')) for name in archive.namelist()))

    def test_commit_build_change_does_not_invalidate_backend_receipt(self):
        output = release.prepare()
        receipt = json.loads((output/'manifest.json').read_text())
        before = release.backend_signature(output)
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory)
            receipt['frontend_sha256'] = 'different-build-generated-by-git-hook'
            receipt['hashes']['_config.yml'] = 'different-exclusion-list'
            (fixture/'manifest.json').write_text(json.dumps(receipt))
            self.assertEqual(release.backend_signature(fixture), before)
            receipt['hashes']['supabase/functions/copiloto/index.ts'] = 'backend-changed'
            (fixture/'manifest.json').write_text(json.dumps(receipt))
            self.assertNotEqual(release.backend_signature(fixture), before)

    def test_backup_precedes_every_remote_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = []
            conf = {'DN_DATABASE_URL':'fake', 'SUPABASE_ACCESS_TOKEN':'fake', 'PROJECT_REF':'fake'}
            def fake_run(args, env, config):
                calls.append(args)
                return ''
            with patch.object(release, 'configuration', return_value=conf), patch.object(release, 'tools_env', return_value={}), patch.object(release, 'run', side_effect=fake_run), patch.object(release, 'binary', side_effect=lambda name:name), patch.object(release, 'STATE', Path(directory)), contextlib.redirect_stdout(io.StringIO()):
                release.remote('implantar-backend', True)
            names = [args[0] for args in calls]
            self.assertLess(names.index('pg_dump'), names.index('supabase'))
            self.assertLess(names.index('pg_restore'), names.index('supabase'))
            deployment = [args for args in calls if args[:3] == ['supabase','functions','deploy']]
            self.assertEqual([args[3] for args in deployment], ['copiloto','reanalisar-historico'])
            self.assertTrue(all('--use-api' in args and '--no-verify-jwt' not in args for args in deployment))
            self.assertEqual(names[-2:], ['psql','psql'])

    def test_remote_operation_requires_explicit_authorization(self):
        with patch.object(release, 'configuration') as config:
            with self.assertRaisesRegex(ValueError, 'não autorizada'):
                release.remote('implantar-backend', False)
            config.assert_not_called()

    def test_one_private_configuration_without_shell_execution(self):
        with tempfile.TemporaryDirectory() as temporary:
            conf = Path(temporary) / 'publicacao.env'
            project_url = re.search(r'supabaseUrl:\s*"([^"]+)"', (ROOT/'config.js').read_text()).group(1)
            ref = project_url.split('//')[1].split('.')[0]
            conf.write_text('DN_DATABASE_URL="postgresql://postgres:fake-password@db.' + ref + '.supabase.co/postgres"\nSUPABASE_ACCESS_TOKEN="fake-token"\n')
            conf.chmod(0o600)
            with patch.object(release, 'CONFIG', conf):
                self.assertEqual(release.configuration()['PROJECT_REF'], ref)
                conf.chmod(0o644)
                with self.assertRaisesRegex(ValueError, '0600'):
                    release.configuration()


if __name__ == '__main__':
    unittest.main()
