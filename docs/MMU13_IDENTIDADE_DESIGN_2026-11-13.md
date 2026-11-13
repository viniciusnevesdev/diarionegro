# Implementação de identidade e design — MMU V0.0.13
Data: 2026-11-13. Projeto: Ecossistema Copiloto, PWA Copiloto.

## Fonte normativa
Matriz V0.0.4 (MMU V0.0.13), seções 01_PROJETO/IDENTIDADE_ATUAL_ECOSSISTEMA_COPILOTO.md e 10_DESENVOLVIMENTO/DESIGN/.
ID permanente do ecossistema: PROJ-3bf57c43-8e66-4894-b35e-56146ee6b765.

## Implementações no repositório
- Nome visível do PWA, tela inicial, login, ajustes, frases e metadados webmanifest alterados de nome histórico para **Copiloto**; URLs do GitHub e Supabase mantidas, sem migração invasiva.
- Nome do módulo interno no menu de ajustes esclarecido como **Motor de interpretação**, sem renomear APIs nem modificar lógica.
- tokens.css é fonte canônica. Cores semânticas oficiais: danger #E22400, success #34C759, warning #FFB501, info #0189FB, action-add #30BCFF. Primary já usado no projeto #111526, sem inferir paleta global.
- Botões adicionar, destrutivos e sucesso passam a referenciar tokens canônicos. Tokens legados destrutivos referenciam token oficial.
- Temas claro/escuro pelo dispositivo, color-scheme light dark, com folhas de estilo próprias, sem inverter ícones ou introduzir outra origem de tokens.
- Foco visível, movimento reduzido e contraste do texto secundário revistos; preservadas dimensões, arquitetura de navegação e semântica das ações.
- Cache de assets alterado sem modificar URL, ID de banco, histórico ou dado de usuário.
- Testes: 4 contratos de design, Playwright em 320/390/430 CSS px claro/escuro, botão Adicionar 9,76:1, erro horizontal ausente; regressão de aprendizado e servidor local (35 grupos + 6 verificações de release + 7 testes Python).

## Limite verificado
O arquivo público dn-symbols.js contém 45 símbolos do pacote anteriormente aprovado (2026-10-23); os nomes estão no catálogo MMU Nov/01, mas os desenhos NÃO foram substituídos pelo pacote de 501 SVGs. O arquivo LICENCA.md da Matriz registra que os símbolos são relacionados a SF Symbols e **licença de redistribuição/uso multiplataforma não foi comprovada**. Não incluir novos SVGs no PWA público sem revisão de licença e autorização. Não atribuir conformidade integral à regra de ícones.

## Preservação
Estação Casa, Cronômetro, Supabase, histórico de registros e memórias, API e fluxos de aprendizagem não alterados por esta implementação visual.
Teste físico no iPhone e auditoria abrangente WCAG 2.2 AA de todas as telas ainda pendentes.
