# Instruções do repositório — Copiloto

Antes de alterar UI/UX, ler `docs/DESIGN_CANONICO_PWA.md`.

**Obrigatório antes de modificar qualquer CSS, componente ou token:** ler também `docs/design/EXCECOES_TOKENS_CANONICOS.md` e `docs/design/CANDIDATOS_TOKENS_DENSIDADE.md`. Tokens gerais são padrões, não sobrescrevem exceções aprovadas. Para novos tokens, propor agrupamento semântico por densidade (amplo/normal/compacto/micro/navegação), comparar valores efetivos e solicitar autorização explícita antes de migrar componentes. Registrar toda exceção e todo candidato nas fontes da próxima Matriz, sem atualizá-la automaticamente.

- As cores e exceções visuais anteriores ao commit `ba94111` são canônicas; **não substitua por tokens genéricos da MMU sem autorização explícita do proprietário**.
- Mudanças visuais devem preservar funcionalidades, acessibilidade e layouts aprovados; exigir comparação antes/depois, testes iPhone e revisão.
- O tema selecionável **Claro / Escuro / Automático** é requisito ainda pendente. Não presumir que `prefers-color-scheme` isoladamente atende.
- Para mudanças de backend, preservar políticas de segurança, Supabase, memórias, Estação Casa e Cronômetro.
- Analisar alterações pendentes nos worktrees; nunca `reset --hard`, `force push` nem migrações destrutivas.
- Não declarar tarefas planejadas como implementadas.
