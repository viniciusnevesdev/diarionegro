from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
JS=(ROOT/'dn-memory-v083.js').read_text(encoding='utf-8')
CSS=(ROOT/'dn-memory-v083.css').read_text(encoding='utf-8')
EDGE=(ROOT/'supabase/functions/reanalisar-historico/index.ts').read_text(encoding='utf-8')
MIG=(ROOT/'supabase/migrations/20261024223500_create_reanalise_historica.sql').read_text(encoding='utf-8')
TOKENS=(ROOT/'tokens.css').read_text(encoding='utf-8')
ICONS=(ROOT/'MAPA_ICONES_V08.md').read_text(encoding='utf-8')
SYMBOLS=(ROOT/'dn-symbols.js').read_text(encoding='utf-8')

def test_permanent_modes():
    for x in ['desatualizados','nunca_analisados','periodo','tudo']: assert x in JS and x in MIG
    assert "VERSION = '0.8.3-reanalysis-v2'" in JS

def test_only_raw_inputs():
    m=re.search(r"const INPUTS = \[[^;]+;",JS).group(0)
    for x in ['texto','ditado','audio_ia']: assert x in m
    for x in ['tarefa_criada','emocao_registrada','memoria_ia']: assert x not in m

def test_never_recreates_tasks():
    assert 'não crie, conclua, edite nem reabra tarefas atuais' in EDGE.lower()
    assert 'tarefas' not in re.search(r'const schema=.*?function outputText',EDGE,re.S).group(0)

def test_inference_confirmation():
    assert 'inferencia' in EDGE and 'declaracao_clara' in EDGE
    assert 'saveAssociations' in JS
    assert 'window.DN_MEMORY.createCandidate' not in JS

def test_version_history_and_runs():
    assert 'interpretacoes_historico' in MIG and 'reanalisacoes' in MIG
    assert 'interpretacoes_historico' in JS and 'reanalisacoes' in JS

def test_rls():
    for t in ['reanalisacoes','interpretacoes_historico']:
        assert f'alter table public.{t} enable row level security;' in MIG
    assert 'auth.uid()' in MIG and 'service_role' not in MIG

def test_bible_icons():
    for x in ['arrow.trianglehead.clockwise','checkmark.circle.fill']:
        assert x in ICONS and x in JS
    assert 'exclamationmark.circle.fill' in SYMBOLS and 'exclamationmark.circle.fill' in JS

def test_css_uses_tokens():
    for x in ['--space-lg','--radius-lg','--control-radius','--type-body','--weight-bold','--color-info']:
        assert x in TOKENS and f'var({x})' in CSS
    assert ':root' not in CSS

def test_overlay_preserves_existing_memory_api():
    assert 'window.DN_MEMORY.create(' not in JS
    assert 'window.DN_MEMORY.createCandidate(' not in JS
    assert 'window.DN_MEMORY.refresh' in JS

def test_edge_is_dedicated():
    assert 'reanalisar-historico' in str(ROOT/'supabase/functions/reanalisar-historico/index.ts')
    assert 'VERSION="0.8.3-reanalysis-v2"' in EDGE


def load_tests(loader, suite, pattern):
    import unittest
    for name, value in sorted(globals().items()):
        if name.startswith('test_') and callable(value):
            suite.addTest(unittest.FunctionTestCase(value, description=name))
    return suite
