# Auditoria e restauração visual — Copiloto, 13/11/2026

**Status:** implementado e testado em **branch isolada** `feat/restauracao-visual-temas-20261113`. **Não publicado no GitHub Pages**; a interface pública segue no commit `fd2daf7`. Exige comparação/aceitação visual no iPhone antes de merge.

## Fonte e método
- Base canônica: commit `66dfa01`, imediatamente anterior à mudança visual `ba94111`.
- Versão problemática: `fd2daf7` (inclui `ba94111`).
- Versão candidata: branch isolada deste relatório.
- Inspeção Git: diff de `index.html`, folhas CSS, scripts JS e identificadores DOM. Screenshots offline Chromium 390×844 em Claro/Escuro; formulários e tela de memórias simulados **sem acessar Supabase**.
- Teste do modo de preferência com localStorage, `matchMedia`, recarregamento e troca do tema do sistema.
- Não houve conexão com os registros privados, migração, alteração de tabela ou deploy.

## 1. Mudanças identificadas no commit ba94111

| Item | Antes 66dfa01 | Depois ba94111 | Correção candidata |
|---|---|---|---|
| Destrutivo | `#EA292C` | `#E22400` | `#EA292C` |
| Sucesso | `#259859` | `#34C759` | `#259859` |
| Aviso | `#FD9900` | `#FFB501` | `#FD9900` |
| Informação | `#193B8E` | `#0189FB` | `#193B8E` |
| Botão central Adicionar | Gradiente escuro | `#30BCFF` | Gradiente original |
| Botão pequeno Adicionar | Fundo discreto, 36 px | Azul-claro, 44 px | Fundo discreto, 36 px |
| Tema | Claro original | Claro/Escuro somente automático, parcial | Claro/Escuro/Automático selecionável |
| Nome | Diário Negro | Copiloto | Copiloto (preservado) |
| Ícones | Biblioteca já existente | Mantida | Mantida |

**Causa:** substituição indevida de padrões próprios do PWA por tokens gerais da Matriz MMU V0.0.13; folha `theme-system.css` adicionada sem adaptação sistemática de todos os componentes. Regras específicas do usuário agora prevalecem em `docs/DESIGN_CANONICO_PWA.md` e `AGENTS.md`.

## 2. Implementação isolada
- `tokens.css`, `style.css`, `settings.css` e `dn-memory.css` restaurados seletivamente a partir de `66dfa01` (CSS apenas); mantido ajuste tipográfico da marca Copiloto.
- `theme-preference.js` novo, aplicado no `<head>` antes do CSS. `Ajustes > Aparência`: três rádios acessíveis **Claro**, **Escuro**, **Automático**. Persiste em `localStorage`; Automático acompanha o sistema; escolha explícita tem precedência e é reaplicada antes da pintura. Safari privado sem armazenamento não impede uso na sessão.
- `theme-system.css` refeito sem trocar cores semânticas originais. Estilos escuros usam cores já presentes no app, corrigem fundos/textos em Início, hábitos, Ajustes, formulários, diálogos e Memórias.
- Atualizada lista de arquivos públicos de build, sem alterações de APIs, banco ou JS funcional.
- Cache de CSS atualizado para carregar candidato sem aproveitar cópias da versão problemática.
- Exclusões específicas de layout (ex.: botão pequeno 36 px) preservadas.

## 3. Comparações visuais
- [Home: antigo / publicado / corrigido, claro e escuro](auditoria-visuais/comparacao-home-13nov2026.png)
- [Ajustes: antigo / publicado / corrigido, claro e escuro](auditoria-visuais/comparacao-settings-13nov2026.png)

Capturas adicionais no diretório temporário do MacBook `/tmp/copiloto-visual-audit/capturas`: login, cadastro, formulário de hábito, formulário de tarefa e componente de memórias (memória fictícia, sem backend).

## 4. Menus e funções
- Identificadores dos botões do rodapé **inalterados** nas três versões: `homeNavButton`, `timelineNavButton`, `data-demo=register`, `accountButton`. O botão visual de Estatísticas também permanece no HTML, sem novo identificador.
- Inventário de IDs DOM: antes 98, publicado 98, candidato 99 (único ID novo de texto informativo do seletor de tema); **zero IDs removidos**.
- Código funcional `app.js`, `copiloto.js`, `dn-learning.js`, `dn-memory.js`, `dn-memory-v083.js`, `settings.js` permanece **byte a byte idêntico** ao commit de origem do candidato.
- Nenhuma adição ou remoção de função principal detectada nesta alteração visual. Isso **não equivale a auditoria exaustiva de todas as funcionalidades com usuário autenticado**.

## 5. Resultados automatizados
- Auditoria comparativa Chromium: **55 verificações, zero falhas**; home, Ajustes, quatro diálogos e componente de memória, dois temas, referências anteriores.
- Auditoria responsiva separada: **320, 390, 430 px** em Claro/Escuro; sem overflow horizontal detectado.
- Contratos canônicos Python: **4/4**; Python de publicação **8/8**.
- Regressão integrada PostgreSQL isolado: **35 grupos aprovados**.
- Verificação de publicação em banco descartável: **6 aprovadas**.
- Worker/aprendizado: suíte local aprovada, zero falhas.
- Arquivos novos e alterações de código foram testados **sem alterar o Supabase remoto**.

## 6. Limites e critérios de publicação
- **Pendente:** revisão visual do proprietário, teste físico no Safari/PWA iPhone (principalmente com dados reais), contrastes completos em todas as telas e estados autenticados, aprovação expressa para publicar.
- **Não prometer conformidade WCAG integral** baseada nos testes atuais; especialmente modais criados com dados reais e conteúdos variáveis ainda exigem revisão.
- Manter Estação Casa e Cronômetro intocados; não alterar banco, autenticação ou dados pessoais.
- Para publicar futuramente: revisar diffs e capturas, testar no Safari, validar preferências de tema e rascunhos locais, só então merge/push na `main`; permitir reversão por commit não destrutivo, preservando banco e histórico.
