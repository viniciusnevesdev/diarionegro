#!/usr/bin/env python3
"""Regressões locais sem rede, credenciais ou banco remoto. SQL usa suíte separada."""
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests'))

def main():
    result = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.discover(str(ROOT / 'tests'), pattern='test_*.py'))
    if not result.wasSuccessful():
        return 1
    count = 0
    for file in sorted((ROOT / 'tests').glob('test_*.py')):
        spec = importlib.util.spec_from_file_location(file.stem, file)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for name, function in vars(module).items():
            if name.startswith('test_') and callable(function):
                function()
                count += 1
    print(f'PASS {count} verificações funcionais Python', flush=True)
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node 24 é necessário para executar o worker TypeScript isolado.')
    for file in ['learning_worker.cjs', 'learning_browser.cjs']:
        subprocess.run([node, str(ROOT / 'tests' / file)], cwd=ROOT, check=True)
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
