"""Portable browser-JS checks using an explicitly available local Node runtime."""
import json
import os
from pathlib import Path
import shutil
import subprocess


def node_binary():
    candidate = os.environ.get('DN_NODE_BINARY') or shutil.which('node')
    temporary = Path('/tmp/dn-validation-tools/node-v22.16.0-linux-x64/bin/node')
    if not candidate and temporary.is_file():
        candidate = str(temporary)
    if not candidate:
        raise RuntimeError('Node is required for the portable browser checks; set DN_NODE_BINARY.')
    return candidate


def parse_browser(path):
    result = subprocess.run([node_binary(), '-e', 'new Function(require("fs").readFileSync(process.argv[1],"utf8"));', str(path)], capture_output=True, text=True)
    if result.returncode:
        raise AssertionError(result.stderr)


def evaluate_browser(path, expression, setup=''):
    script = '''globalThis.window={};
    globalThis.document={readyState:'loading',addEventListener(){},querySelector(){return null;}};
    ''' + setup + '\n' + Path(path).read_text() + '\nconsole.log(JSON.stringify(' + expression + '));'
    result = subprocess.run([node_binary(), '-e', script], capture_output=True, text=True)
    if result.returncode:
        raise AssertionError(result.stderr)
    return json.loads(result.stdout)
