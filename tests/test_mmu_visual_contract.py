"""Contratos visuais confirmados no MMU v0.0.13, sem acesso ao Supabase."""
import json
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]

class MMUDesignContract(unittest.TestCase):
    def test_original_canonical_palette(self):
        css=(ROOT/'tokens.css').read_text()
        vals={'--color-danger':'#EA292C','--color-success':'#259859',
              '--color-warning':'#fd9900','--color-info':'#193b8e'}
        for token,hex_code in vals.items():
            values=re.findall(rf'{re.escape(token)}:\s*(#[0-9A-Fa-f]{{6}})\s*;',css)
            self.assertEqual([v.lower() for v in values],[hex_code.lower()],token)
        style=(ROOT/'style.css').read_text()
        self.assertIn('min-height: 36px;',style)
        self.assertIn('radial-gradient(80% 110% at 50% 68%',style)
        self.assertNotIn('--action-add:',css)
        self.assertIn('docs/DESIGN_CANONICO_PWA.md',(ROOT/'AGENTS.md').read_text())

    def test_brand_and_backward_compatible_identity(self):
        html=(ROOT/'index.html').read_text()
        meta=json.loads((ROOT/'manifest.webmanifest').read_text())
        self.assertEqual(meta['name'],'Copiloto')
        self.assertEqual(meta['short_name'],'Copiloto')
        self.assertEqual(meta['start_url'],'./')
        self.assertIn('<title>Copiloto</title>',html)
        self.assertIn('aria-label="Copiloto"',html)
        self.assertIn('brand--copiloto',html)
        self.assertNotIn('<title>Diário Negro</title>',html)
        self.assertEqual(len(meta['icons']),2)

    def test_explicit_theme_and_accessibility(self):
        tokens=(ROOT/'tokens.css').read_text()
        theme=(ROOT/'theme-system.css').read_text()
        script=(ROOT/'theme-preference.js').read_text()
        html=(ROOT/'index.html').read_text()
        self.assertIn(':root[data-theme="dark"]',tokens)
        self.assertIn(':root[data-theme="dark"]',theme)
        self.assertIn('copiloto-theme-preference-v1',script)
        self.assertIn('prefers-color-scheme: dark',script)
        self.assertIn('Claro',html)
        self.assertIn('Escuro',html)
        self.assertIn('Automático',html)
        self.assertEqual(html.count('name="copilotoTheme"'),3)
        self.assertIn(':focus-visible',theme)
        self.assertIn('prefers-reduced-motion',theme)
        self.assertNotIn('filter: invert(',theme)

    def test_scripts_and_public_files_are_declared(self):
        public=set(json.loads((ROOT/'scripts/frontend-publico.json').read_text()))
        self.assertIn('theme-system.css',public)
        self.assertIn('theme-preference.js',public)
        html=(ROOT/'index.html').read_text()
        self.assertIn('href="theme-system.css?v=',html)
        self.assertIn('href="tokens.css?v=',html)
        self.assertNotIn('lucide',html.lower())
        self.assertNotIn('fontawesome',html.lower())

if __name__=='__main__':
    unittest.main()
