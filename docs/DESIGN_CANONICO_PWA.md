# Design canônico do PWA Copiloto — decisão do proprietário, 13/11/2026

**Status:** regra vinculante. **Implementação visual:** restauração em branch de revisão `feat/restauracao-visual-temas-20261113` (commit `ee87458`), 55 verificações de interface aprovadas; **ainda não publicada na `main` e sem homologação física no Safari iPhone**. O commit `ba94111` introduziu regressões e não constitui aprovação de design.

## Precedência
1. Decisões **explícitas e recentes do proprietário** sobre componentes existentes.
2. Identidade visual e exceções aprovadas do próprio PWA, preservadas no Git antes de `ba94111`.
3. Regras e tokens gerais MMU V0.0.13 como **padrões para elementos novos ou sem definição própria**, sem substituir exceções aprovadas.
4. Sugestões genéricas de acessibilidade e novos estilos, sempre testadas e sem regressões.

Uma matriz genérica **não revoga automaticamente** escolhas canônicas já aprovadas no aplicativo. Alterações em cores, dimensões ou composições canônicas exigem pedido/anuência explícita do proprietário, documentando antes/depois, razão, telas afetadas, testes e caminho de reversão. Não interpretar pedidos de aprimoramento geral como autorização para redesenho global.

## Cores históricas oficiais (restauração pendente)
Valores verificados em `git show ba94111^:tokens.css`:
- `--color-danger: #EA292C` — ação destrutiva.
- `--color-success: #259859` — sucesso.
- `--color-warning: #FD9900` — aviso.
- `--color-info: #193B8E` — informativo.
- `--color-primary`: aparência primária existente `#111526` no componente `.primary-btn`; o valor exato de cada componente deve ser conferido no histórico.
- Botão central de adicionar `.dock-plus`: **gradiente escuro aprovado**, não cor sólida `#30BCFF`; conferir regras `style.css` anteriores a `ba94111` e variações posteriores.
- Botão pequeno `.mini-add-btn`: fundo discreto `rgba(229,233,243,.76)` e texto `#34394a`, **não** azul-celeste indiscriminado.
- Tokens derivados `*-soft`, `on-*` e estados de hover/desabilitado precisam ser restaurados/revalidados por componente, sem presumir que toda superfície de mesma função possuía a mesma cor.

Os novos valores `#E22400`, `#34C759`, `#FFB501`, `#0189FB` e `#30BCFF` foram introduzidos pelo commit `ba94111` **sem aprovação específica**; não classificá-los como cores canônicas do Copiloto apenas por constarem do MMU.

## Exceções de layout, registradas por componente
- Tokens de altura, padding, fonte, raio, espaço e contraste são **padrões**, não substitutos automáticos das dimensões específicas já aceitas.
- Exemplo comprovado: `.mini-add-btn` tinha `min-height:36px`, passou para `44px` em `ba94111`. **Restauração de 36px implementada na branch `ee87458`; publicação e validação Safari pendentes.**
- Documentar cada exceção: componente/seletor, tela e estado, valores canônicos (claro/escuro), justificativa, evidência/commit anterior, decisão do proprietário, dependências, teste no iPhone, data e autorização.
- Arquivo de registro das exceções e decisões: **este documento**; futuras regras podem ter arquivos específicos em `docs/design/`, referenciados daqui.
- Não mudar o layout, mesmo para atender a uma regra MMU, antes de comparar a tela real e obter aprovação.

## Temas — implementados na branch de revisão; publicação e validação Safari pendentes
- Em **Ajustes > Aparência**, opção persistente **Claro / Escuro / Automático**, escolha expressa do usuário.
- Automático acompanha `prefers-color-scheme`; Claro e Escuro forçam explicitamente tema independentemente do iOS.
- Adaptar **todas as telas e estados** (menus, caixas, avisos, popovers, modais, inputs, overlays, teclado Safari), não apenas componentes isolados; manter cores canônicas e contrastes legíveis.
- Persistência local apropriada, reaplicação antes de a página pintar para evitar flash; compatibilidade iOS Safari/PWA e acessibilidade; não reintroduzir fontes SVG não autorizadas.
- O modo somente automático de `ba94111` não satisfaz este requisito.

## Comparação e restauração visual — implementadas na branch; publicação condicionada
- Usar `66dfa01` (antes da mudança visual), `ba94111` (mudança), e HEAD atual como três referências **somente de leitura**.
- Produzir inventário de todas as diferenças: CSS, tokens, dimensões, contraste, telas, menus, funções, textos, ícones, serviços e efeitos colaterais. Separar mudanças intencionais de regressões; não presumir que o commit visual adicionou menus.
- Gerar comparações antes/depois em viewport iPhone (inicialmente Chromium, concluir no Safari físico); incluir modos claro/escuro, barra inferior, login, memórias, ajustes, formulários e modais.
- Restaurar **somente design canônico**, mantendo nome Copiloto, histórico de Git, novas funções, aprendizado contínuo, Supabase, dados pessoais e quaisquer melhorias explicitamente aprovadas posteriormente.
- Não fazer `git revert ba94111` integral nem `reset --hard`; isolar CSS e marca do código funcional.
- Antes de publicar: testes automatizados, comparação visual revisável, aprovação do proprietário e testes físicos no iPhone.
- Estado em 13/11: **correção pronta em branch e aprovada nas capturas pelo usuário**, sem lançamento no PWA público. Safari e aceite de publicação ainda pendentes.

## Alcance
Aplica-se ao **PWA Copiloto** no repositório `viniciusnevesdev/ecossistema-copiloto`. Estação Casa é outro aplicativo; não aplicar automaticamente as cores ou regras deste PWA ao desktop. Cronômetro permanece independente.

## Exceções e promoção de novos tokens — decisão adicional do proprietário

- Registro oficial: `docs/design/EXCECOES_TOKENS_CANONICOS.md` (componente, dimensão, densidade, fonte e validação).
- Candidatos: `docs/design/CANDIDATOS_TOKENS_DENSIDADE.md` (ocorrências, **não** tokens já aprovados).
- Dimensão diferente em área com dois/três botões versus área com seis ou mais pode ser **exceção funcional canônica**, não erro.
- Repetição frequente de exceção permite **propor** token por categoria, mas somente promover após avaliar semântica, responsividade, contraste, impacto e autorização do proprietário.
- Na próxima Matriz do Ecossistema Copiloto, incorporar esta governança, a lista de exceções, candidatos a tokens e decisões com estados distintos (confirmado/proposto/pendente). **Não atualizar a Matriz agora.**
