# Instruções do repositório — Copiloto

Antes de alterar UI/UX, ler `docs/DESIGN_CANONICO_PWA.md`.

- As cores e exceções visuais anteriores ao commit `ba94111` são canônicas; **não substitua por tokens genéricos da MMU sem autorização explícita do proprietário**.
- Mudanças visuais devem preservar funcionalidades, acessibilidade e layouts aprovados; exigir comparação antes/depois, testes iPhone e revisão.
- O tema selecionável **Claro / Escuro / Automático** é requisito ainda pendente. Não presumir que `prefers-color-scheme` isoladamente atende.
- Para mudanças de backend, preservar políticas de segurança, Supabase, memórias, Estação Casa e Cronômetro.
- Analisar alterações pendentes nos worktrees; nunca `reset --hard`, `force push` nem migrações destrutivas.
- Não declarar tarefas planejadas como implementadas.
