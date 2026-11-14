# Candidatos a tokens por densidade — inventário inicial (não implementados)

Data: 13/11/2026. Fonte: contagem de declarações CSS de `style.css`, `settings.css`, `copiloto.css`, `dn-memory.css`, `dn-memory-v083.css`, `theme-system.css` e `tokens.css` na branch `feat/restauracao-visual-temas-20261113` (commit base `ee87458`).

**Metodologia/limite:** buscas textuais de valores fixos em `width`, `min-width`, `height`, `min-height`, `border-radius`. Não são contagens de componentes distintos e **não** consideram totalmente cascata, media queries, especificidade nem valores computados. Uma mesma propriedade pode aparecer várias vezes no mesmo componente.

## Frequências observadas — fatos, não autorização para substituir

| Medida fixa | Ocorrências em declarações CSS | Interpretação inicial |
|---|---:|---|
| `999px` | 18 | Principalmente raios do tipo cápsula; confirmar função antes de uniformizar |
| `44px` | 18 | Muitos alvos e alturas mínimas; funções diferentes |
| `20px` | 16 | Possíveis ícones/tamanhos e raios, heterogêneos |
| `48px` | 15 | Botões amplos e campos; candidato a **categoria de controle amplo**, não regra universal |
| `16px` | 15 | Diversos raios/tamanhos, não necessariamente mesma semântica |
| `24px` | 13 | Mistura de dimensões e raios |
| `36px` | 12 | Vários controles compactos, com contexto distinto |
| `17px` | 11 | Medida repetida, sem função comum verificada |
| `34px` | 11 | Ferramentas/ícones em áreas compactas entre outras |
| `38px` | 10 | Mistura de alvos, larguras, alturas |
| `22px` | 9 | Mistura de raios e dimensões |
| `13px` | 9 | Possível radius compacto, checar em cada área |

## Vocabulário proposto, ainda sem tokens novos no código

- **Ação ampla:** `--control-height-spacious`, `--control-radius-spacious`; formulários com poucas ações, ex. 48px.
- **Ação de cartão/lista:** `--control-height-card`, `--control-radius-card`; depende da largura disponível e quebra de linha.
- **Ação compacta:** `--control-height-compact`, `--control-radius-compact`; barras e grupos densos, ex. botões de sessão/gerenciadores.
- **Ferramenta micro:** `--control-size-micro`, `--control-radius-micro`; ícones de edição/reordenação, ex. frase, com avaliação de acessibilidade da área clicável real.
- **Ação central da navegação:** componente `.dock-plus` com largura, altura e gradiente próprios. **Não promover o botão central a token global de todos os botões.**

Esses são **nomes candidatos**, não nomes oficiais nem escolhas de novos valores. Propor formalmente somente após mapear consumidores reais, agrupar por contexto, validar em três larguras (320/390/430), Claro/Escuro/Automático e iPhone Safari, e obter aprovação do proprietário.

## Regra de promoção à matriz

A Matriz deve registrar:
1. tokens e exceções **já confirmados**;
2. candidatos **em estudo** com contagem e limitação de evidências;
3. justificativas de por que certas medidas iguais **não** foram unificadas;
4. decisão, data, componente, telas, testes e impacto responsivo de cada promoção;
5. referência ao registro `EXCECOES_TOKENS_CANONICOS.md`.

**Status:** levantamento inicial concluído; nenhuma alteração de CSS efetuada com base nesta análise.
