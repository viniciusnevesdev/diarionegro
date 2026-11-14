# Registro de exceções canônicas — PWA Copiloto

**Decisão do proprietário:** 13/11/2026. **Status:** norma de desenvolvimento, catálogo inicial auditado, **não é autorização para redesenhar componentes**. Fonte: `66dfa01` (referência anterior à regressão), `ee87458` (restauração visual na branch de homologação), `docs/DESIGN_CANONICO_PWA.md`.

## Regra de precedência (vinculante)

1. Decisão explícita e mais recente do proprietário para o **componente/tela/estado**.
2. Exceção específica documentada aqui ou comprovada no visual aprovado/Git.
3. Token próprio do Copiloto aplicável à categoria **e ao contexto de densidade**.
4. Token genérico MMU apenas para elementos que ainda não têm definição, sem substituir silenciosamente decisões anteriores.

**Proibido:** alterar automaticamente cores originais, altura, largura, raio, padding ou gradientes canônicos para “unificar o design”; usar um token genérico indiscriminadamente; refatorar diversas telas sem comparação antes/depois; promover coincidências de valor a um único token sem avaliar a função.

**Obrigatório em cada exceção:** seletor, tela/área, cenário/estado, valor efetivo claro e escuro, motivo funcional, referência Git/print, autorização, cobertura de teste, status. Se a cascata CSS possuir várias declarações para o mesmo seletor, documentar a **regra efetiva por viewport**, não apenas a primeira declaração do arquivo.

## Exceções confirmadas por código (valores de referência, não propostas de mudanças)

| Componente/área | Medidas e aspecto específicos observados | Por que preservar | Referência/status |
|---|---|---|---|
| `.dock-plus` — ação central do rodapé | Gradiente escuro original; em declaração final base `width: 96px; height: 52px; min-height: 52px; border-radius: 21px`; há override de largura `88px` em outro bloco responsivo | Ação principal em barra inferior densa, não botão azul-claro genérico | `style.css`, `66dfa01`; restauração em `ee87458`, candidata aprovada nas capturas pelo usuário, teste físico iPhone pendente |
| `.mini-add-btn` — gerenciadores de tarefas/hábitos | Override contextual `min-height: 36px; padding: 0 12px`, fundo `rgba(229,233,243,.76)`, texto `#34394a` (há regra geral anterior de 48px) | Cabeçalho compacto com ações adjacentes | `style.css`, `66dfa01`; alteração indevida para 44px em `ba94111` restaurada na branch |
| `.primary-btn`, `.secondary-btn` — formulários amplos | `min-height: 48px; border-radius: 999px`; primário fundo escuro `#111526`, não azul MMU | Ação de maior destaque em formulário com poucas ações | `style.css`; referencial canônico do app |
| `.dn-phrase-tool` — ferramentas da lista de frases | Regra inicial `38×34px`, override intermediário `36×34px`, override compacto com `width/min-width/height: 32px !important; padding:0; border-radius:10px !important` | Alta densidade, múltiplos comandos pequenos na mesma linha | `settings.css`; **validar dimensão computada no Safari** antes de alterar |
| `.dn-phrase-item` — cada frase editável | `padding:10px`, depois `7px` e override `6px !important`; raio 20→18px | Lista densa, evita desperdício de espaço em itens repetidos | `settings.css`, exceção de densidade |
| `.dn-input-tab` — tipo de registro | `min-height: 54px; border-radius:14px` | Quatro abas em uma linha, com ícone e legenda; não usar dimensões de botões de formulário | `copiloto.css` |
| `.dn-session-actions button` — ações da sessão | `min-height:36px; border-radius:13px` | Três ações lado a lado em cartão compacto | `copiloto.css` |
| `.dn-memory-card-actions button` — ações em cartões de memória | Base `min-height:37px; border-radius:11px`, mais tarde `min-height:42px; border-radius: var(--radius-sm)` | A grade responsiva de ações determina a medida final; não assumir que a primeira regra é a efetiva | `dn-memory.css`, `dn-memory-v083.css`; auditoria de cascata ainda pendente |
| `.dn-memory-detail-actions button` — detalhe de memória | Base `min-height:43px; border-radius:13px` e outro override `min-height:44px` | Duas ações de detalhe em grade, espaço disponível diferente do cartão | `dn-memory.css`, `dn-memory-v083.css` |
| `.copiloto-theme-option span` — Claro/Escuro/Automático | `min-height:42px; border-radius:13px; padding:7px 4px`; três colunas | Seletor compacto específico, com legibilidade e alvo de toque a conferir no iPhone | `theme-system.css`, introduzido em `ee87458` |

**Observação:** são exceções **de contexto** confirmadas pelo código, não afirmação de que cada combinação foi integralmente aprovada no iPhone. Os valores atuais da `main` podem divergir da branch de correção. Estilos `!important`, media queries, especificidade e `calc()` precisam ser auditados antes de consolidar tokens.

## Cores e identidade intocáveis sem autorização

- Destrutivo `#EA292C`; sucesso `#259859`; aviso `#FD9900`; informativo `#193B8E`.
- Primário escuro do componente `.primary-btn`: `#111526`.
- `.dock-plus`: gradiente escuro original, **não** `#30BCFF`.
- A Matriz MMU fornece referência **subsidiária**, não sobreposição automática destas escolhas.
- Os temas Claro/Escuro/Automático devem respeitar as cores e os gradientes canônicos, adaptando superfícies/textos existentes sem inventar paleta nova sem decisão.

## Governança de novos tokens

Uma exceção recorrente pode virar token **somente quando o objetivo funcional e o comportamento responsivo forem realmente equivalentes**, não por coincidência numérica. Procedimento:

1. Inventariar ocorrências, seletor, área, estado, densidade e valor **computado** em 320/390/430px, claro/escuro.
2. Agrupar por função: `amplo` (poucas ações), `normal` (listas/cartões), `compacto` (múltiplos comandos), `barra inferior` (navegação), `micro` (ícones e ações densas).
3. Identificar repetição significativa **a partir de três componentes semanticamente equivalentes** ou repetição forte em uma mesma área; isto é critério para **proposta**, não para imposição.
4. Criar uma proposta de nome descritivo, ex. `--control-h-compact`, `--button-radius-card-actions`, com valores sugeridos, componentes participantes e **exceções que não participam**.
5. Comparar visual antigo/novo e verificar tap targets, texto, responsividade, overflow, contraste e acessibilidade; pedir autorização para cada mudança comportamental.
6. Após aprovado, adicionar token **no arquivo canônico `tokens.css`**, migrar somente componentes aprovados e registrar a decisão aqui e na matriz.
7. Não fazer migração automática de 10–15 ocorrências com base em um contador de CSS; a mesma medida pode servir a funções diferentes.

**Importante:** em tela com dois botões, controle amplo pode ser correto; em tela com seis, pode ser necessária variante compacta. Não se trata de “descumprir” tokens: a exceção aprovada é parte do sistema de design.

## Proteções de revisão e publicação

- Antes de editar UI, abrir este arquivo e `docs/DESIGN_CANONICO_PWA.md`.
- Para cada PR visual: lista de seletor/valor anterior/novo, áreas tocadas, exceções preservadas, três larguras mínimas, claro/escuro, imagens comparativas e resultado no Safari PWA iPhone.
- Para mudanças em tokens globais: inventário de consumidores; não propagar automaticamente alteração a todos.
- Scripts funcionais e dados pessoais não podem ser modificados como efeito colateral de correção visual.
- **Estado em 13/11:** candidato `ee87458` disponível em branch; usuário gostou das capturas da correção. Isso **não equivale a homologação final no Safari nem publicação na `main`**.

## Pendência obrigatória para a próxima Matriz

Ao atualizar a **Matriz do Ecossistema Copiloto** conforme MMU V0.0.13, incorporar este registro em **Design → Tokens, exceções canônicas e critérios de promoção**. A matriz deve conter ou referenciar tabela de exceções, cores canônicas, método de aprovação, variantes por densidade, possíveis tokens e estado de validação. **A nova edição do Markdown incremental é a fonte de transferência até a próxima matriz; não alterar a matriz agora.**


## Barra inferior — exceção aprovada (13/11/2026)

- Referência: captura real do iPhone 12 Pro Max compartilhada pelo proprietário.
- `.bottom-dock`: grade de cinco posições, altura 70px, raio 30px, centro 64px; não aplicar `display:flex !important`.
- `.dock-plus`: círculo 58×58px, raio 50%, sem elevação; somente ícone `+`, nome acessível preservado; gradiente escuro e brilho originais mantidos.
- Segunda aba: rótulo visível `Histórico`; lógica e dados de registros preservados.
- Itens laterais: texto 10.5px; distribuição simétrica.
- São exceções canônicas locais, não tokens globais.
- Pendente: validação física no Safari/PWA do iPhone 12 Pro Max.
