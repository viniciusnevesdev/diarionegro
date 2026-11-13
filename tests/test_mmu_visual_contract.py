"""Contratos visuais confirmados no MMU v0.0.13, sem acesso ao Supabase."""
import json
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]

class MMUDesignContract(unittest.TestCase):
    def test_semantic_palette(self):
        css=(ROOT/'tokens.css').read_text()
        vals={'--color-danger':'#E22400','--color-success':'#34C759','--color-warning':'#FFB501',
              '--color-info':'#0189FB','--action-add':'#30BCFF'}
        for token,code in vals.items():
            self.assertEqual(re.findall(rf'{re.escape(token)}:\s*(#[0-9A-Fa-f]{{6}})\s*;',css),[code],token)
        self.assertIn('--muted: #626b80;',css)  # WCAG AA sobre fundo claro
        self.assertIn('--dn-color-destructive: var(--color-danger);',css)
        self.assertIn('--on-action-add: #000000;',css)
        self.assertIn('--on-danger: #FFFFFF;',css)
        self.assertIn('--color-primary: #111526;',css)

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

    def test_color_modes_and_accessibility(self):
        tokens=(ROOT/'tokens.css').read_text()
        theme=(ROOT/'theme-system.css').read_text()
        style=(ROOT/'style.css').read_text()
        self.assertIn('@media (prefers-color-scheme: dark)',tokens)
        self.assertIn('@media (prefers-color-scheme: dark)',theme)
        self.assertIn('color-scheme: light dark;',style)
        self.assertIn(':focus-visible',theme)
        self.assertIn('prefers-reduced-motion',theme)
        self.assertNotIn('filter: invert(',theme)

    def test_scripts_and_public_files_are_declared(self):
        public=set(json.loads((ROOT/'scripts/frontend-publico.json').read_text()))
        self.assertIn('theme-system.css',public)
        html=(ROOT/'index.html').read_text()
        self.assertIn('href="theme-system.css?v=',html)
        self.assertIn('href="tokens.css?v=',html)
        self.assertNotIn('lucide',html.lower())
        self.assertNotIn('fontawesome',html.lower())

if __name__=='__main__':
    unittest.main()
