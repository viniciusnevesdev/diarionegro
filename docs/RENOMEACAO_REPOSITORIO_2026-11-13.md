# Renomeação oficial do repositório — 13/11/2026

- Nome anterior: `viniciusnevesdev/diarionegro`
- Nome novo: `viniciusnevesdev/ecossistema-copiloto`
- Mesmo repository ID GitHub: `1383044568`. Histórico, branch main, GitHub Pages e código preservados.
- Nova URL de PWA: https://viniciusnevesdev.github.io/ecossistema-copiloto/
- URL anterior https://viniciusnevesdev.github.io/diarionegro/ retorna 404 após renomeação. Atalhos PWA no iPhone instalados com o endereço anterior precisam ser verificados e eventualmente reinstalados.
- Nenhuma modificação no Supabase, Estação Casa ou Cronômetro.
- Todos os worktrees Git ligados à mesma origem tiveram `origin` atualizado; alterações locais não foram descartadas.
- O script de validação de frontend foi atualizado para a nova URL e um teste de regressão protege contra retorno ao endereço antigo.
- Os nomes de pastas locais `diarionegro`, chaves internas e tabelas existentes não foram alterados para evitar quebra de dependências.
- **Atenção:** antes de remover o ícone antigo do iPhone, verifique rascunhos salvos localmente e o funcionamento de acesso/autenticação no novo endereço. O browser trata cada caminho do GitHub Pages como escopo distinto para PWA e cache de arquivos.
