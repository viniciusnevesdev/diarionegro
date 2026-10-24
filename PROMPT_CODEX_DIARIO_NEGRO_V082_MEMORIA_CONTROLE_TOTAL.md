# PROMPT PARA CODEX — DIÁRIO NEGRO / BBB v0.8.2-dev
## Transparência, governança e controle total da memória do Copiloto

Você está trabalhando no projeto local **Diário Negro / BBB**.

Repositório local:

`/Users/vinicius/Documents/Projetos/diarionegro`

Branch de trabalho esperada:

`bbb-v0.8.2-dev`

Este trabalho deve ser feito **localmente**.

---

# 0. REGRAS DE OPERAÇÃO

Antes de alterar qualquer arquivo:

1. Leia `CONTEXTO_CODEX.md` inteiro.
2. Rode `git status --short --branch`.
3. Confirme que está em `bbb-v0.8.2-dev`.
4. Inspecione o estado real do código antes de assumir qualquer arquitetura.
5. Preserve tudo que já funciona.
6. Faça alterações de forma incremental e testável.
7. Crie backups locais quando houver alteração estrutural importante.
8. Não faça `push`.
9. Não faça merge em `main`.
10. Não faça deploy.
11. Não altere o Supabase remoto.
12. Não execute migrations remotas.
13. Não apague dados remotos.
14. Não faça ações irreversíveis ou externas sem aprovação explícita.
15. Se houver uma decisão técnica reversível e óbvia, tome-a sozinho.
16. Só interrompa o usuário quando houver decisão pessoal de produto, risco real de perda de dados, ação externa/irreversível ou ambiguidade que realmente impeça uma implementação segura.

Ao terminar, deixe tudo preparado para ativação posterior, mas não ative nada remotamente.

---

# 1. OBJETIVO PRINCIPAL

Implementar uma área completa de **transparência e governança da memória do Copiloto**.

O usuário deve ter controle máximo sobre tudo que a IA sabe sobre ele.

A interface deve responder, de forma auditável:

- O que o Copiloto sabe sobre mim?
- De onde ele sabe isso?
- Quando aprendeu?
- Foi algo que eu ensinei explicitamente?
- Foi extraído de um registro?
- Foi uma inferência da IA?
- Eu confirmei essa inferência?
- Qual registro originou essa memória?
- Quais registros reforçaram essa memória?
- Qual foi a primeira fonte?
- Qual foi a fonte mais recente?
- Qual é a confiança atual?
- Qual era a confiança original?
- Essa memória está ativa?
- Ela foi substituída?
- Ela conflita com outra?
- Ela foi editada?
- Posso corrigir?
- Posso desativar?
- Posso excluir?
- Posso restaurar?
- Posso mesclar duplicatas?
- Posso ver o histórico?
- Posso exportar tudo?
- Posso importar de volta?
- Posso descobrir quais memórias foram usadas em uma resposta específica?

Princípio:

> **Nenhum conhecimento pessoal importante deve ficar escondido em lógica interna sem possibilidade de inspeção pelo usuário.**

---

# 2. PRINCÍPIO DE PRODUTO

O Diário Negro é a caixa-preta pessoal do usuário.

Fluxo:

**realidade bruta → interpretação → memória/contexto → prioridade → próxima ação → acompanhamento → aprendizado**

Separar claramente:

1. **Registros** — acontecimentos, notas, entradas, eventos e histórico temporal.
2. **Memórias pessoais** — fatos reutilizáveis, preferências, regras pessoais, relações, lugares de objetos, contexto de vida e significados particulares.
3. **Contexto-base do Copiloto** — regras estáveis do produto e princípios de interpretação.
4. **Inferências/candidatos** — hipóteses ainda não confirmadas e que não podem valer como verdade equivalente a uma memória confirmada.

---

# 3. MODELO DE DADOS — `public.memorias`

Criar migration local versionada para `public.memorias`.

Campos mínimos:

- `id`
- `user_id`
- `texto`
- `tipo`
- `categoria`
- `origem`
- `confianca`
- `status`
- `ativa`
- `source_record_id`
- `created_at`
- `updated_at`

Para máximo controle, adicionar se fizer sentido:

- `subcategoria`
- `titulo_curto`
- `confirmed_by_user`
- `confirmed_at`
- `first_learned_at`
- `last_reinforced_at`
- `source_type`
- `source_label`
- `source_excerpt`
- `source_metadata`
- `confidence_initial`
- `confidence_current`
- `fingerprint`
- `canonical_key`
- `superseded_by`
- `supersedes`
- `merged_into`
- `deleted_at`
- `disabled_at`
- `disabled_reason`
- `correction_reason`
- `version`
- `metadata_json`

Se algum desses campos for melhor modelado em tabelas relacionadas, faça isso. Priorize proveniência, histórico, clareza e manutenção.

---

# 4. TIPOS DE MEMÓRIA

Suportar tipos como:

- fato pessoal
- preferência
- regra pessoal
- objeto/lugar
- rotina
- trabalho
- social
- dinheiro
- casa
- saúde contextual
- significado pessoal
- relação
- contexto de vida
- outro

Internamente os nomes podem ser diferentes, mas a UI deve usar termos legíveis.

---

# 5. ORIGEM / PROVENIÊNCIA

Cada memória precisa saber **como nasceu**.

Origens lógicas:

- `ensinado_explicitamente`
- `correcao_explicitamente_lembrada`
- `registro_declaracao_clara`
- `inferencia_ia_confirmada`
- `inferencia_ia_nao_confirmada`
- `migrada_sistema_antigo`
- `importada`
- `outra`

Cada memória deve responder:

> **Por que o Copiloto sabe disso?**

Exemplos:

- `Ensinado por você em 24/10/2026 pela aba Ensinar.`
- `Aprendido a partir do registro “Minha chave fica sempre na gaveta da entrada.”`
- `Sugerido pela IA após o registro X e confirmado por você.`
- `Inferência ainda não confirmada.`

---

# 6. MÚLTIPLAS FONTES / EVIDÊNCIAS

Não limitar uma memória a apenas `source_record_id`.

Criar, se tecnicamente adequado, tabela `memoria_fontes` com campos como:

- `id`
- `user_id`
- `memoria_id`
- `record_id`
- `source_type`
- `source_label`
- `source_excerpt`
- `relation_type`
- `confidence_contribution`
- `created_at`
- `metadata_json`

Uma memória pode ter fonte inicial, reforços, correções, confirmações e fontes contraditórias.

A UI deve permitir abrir todas as evidências.

---

# 7. HISTÓRICO AUDITÁVEL

Criar tabela `memoria_historico` ou equivalente.

Campos sugeridos:

- `id`
- `user_id`
- `memoria_id`
- `acao`
- `valor_anterior`
- `valor_novo`
- `motivo`
- `origem_da_acao`
- `created_at`
- `metadata_json`

Registrar ações como:

- criada
- confirmada
- editada
- corrigida
- desativada
- reativada
- excluída
- restaurada
- mesclada
- substituída
- confiança alterada
- categoria alterada
- fonte adicionada
- conflito detectado
- conflito resolvido

A UI deve mostrar linha do tempo de alterações.

---

# 8. EXCLUSÃO SEGURA

Por padrão usar **soft delete**.

- memória excluída recebe `deleted_at`;
- não deve ser usada pelo Copiloto;
- aparece na seção “Excluídas”/“Lixeira”;
- pode ser restaurada.

Exclusão física apenas mediante ação explícita **Excluir permanentemente**, com confirmação clara.

---

# 9. STATUS DA MEMÓRIA

Estados sugeridos:

- `ativa`
- `candidata`
- `aguardando_confirmacao`
- `desativada`
- `substituida`
- `conflitante`
- `excluida`

Inferência não confirmada não pode ter o mesmo peso de uma memória confirmada.

---

# 10. HIERARQUIA DE CONFIANÇA

Quando houver conflito, priorizar aproximadamente:

1. ensino explícito mais recente do usuário;
2. correção explícita marcada para lembrar;
3. memória confirmada pelo usuário;
4. declaração pessoal clara em registro;
5. inferência da IA confirmada;
6. inferência não confirmada.

Inferência não confirmada nunca deve sobrescrever silenciosamente um ensinamento explícito.

---

# 11. DEDUPLICAÇÃO

Implementar prevenção de duplicatas com normalização, fingerprint/canonical key e comparação adequada.

Ao detectar duplicata:

- oferecer mesclagem;
- preservar todas as fontes;
- preservar datas;
- preservar histórico;
- escolher memória canônica;
- registrar a operação.

---

# 12. CONFLITOS

Quando nova informação contradizer memória existente:

- marcar conflito;
- avaliar se é atualização temporal;
- se for atualização inequívoca, substituir preservando histórico;
- se houver ambiguidade, pedir confirmação;
- nunca apagar a memória antiga sem rastreabilidade.

Exemplo:

Memória atual: `Minha chave fica na gaveta da entrada.`

Nova entrada: `Agora estou deixando minha chave na mesa da sala.`

---

# 13. POLÍTICA DE APRENDIZADO

## A. Ensino explícito

`Lembre que minha chave fica na gaveta da entrada.`

Pode salvar diretamente com alta confiança.

## B. Correção explícita

`Não, eu não trabalho domingo. Lembre disso.`

Salvar como correção/memória de prioridade alta.

## C. Declaração pessoal clara

`Minha chave fica sempre na gaveta da entrada.`

Pode virar memória automática se for reutilizável. Mostrar discretamente:

`Aprendi: sua chave fica na gaveta da entrada.`

com botão **Desfazer**.

## D. Inferência da IA

`Você parece preferir fazer compras à noite.`

Não salvar como verdade. Criar candidato aguardando confirmação.

## E. Observação momentânea

`O papel-toalha estava sobre o micro-ondas.`

Não virar memória permanente automaticamente.

---

# 14. TELA PRINCIPAL

Criar uma tela:

# **O que o Copiloto sabe sobre mim**

Ela deve ser acessível por botão claro dentro do PWA.

Não esconder atrás de fluxo técnico obscuro.

---

# 15. RESUMO NO TOPO

Mostrar:

- total de memórias ativas;
- aguardando confirmação;
- desativadas;
- conflitantes;
- excluídas;
- categorias principais;
- última memória aprendida;
- última alteração.

Exemplo:

`128 memórias ativas · 3 aguardando confirmação · 1 conflito`

---

# 16. BUSCA, FILTROS E ORDENAÇÃO

Busca por:

- texto;
- categoria;
- tipo;
- origem;
- fonte;
- trecho de registro;
- data.

Filtros:

- categoria;
- tipo;
- origem;
- status;
- ativa/desativada;
- confirmada/não confirmada;
- confiança;
- período;
- possui fonte/sem fonte;
- conflito;
- duplicata;
- editada manualmente;
- aprendida automaticamente.

Ordenação:

- mais recente;
- mais antiga;
- maior confiança;
- menor confiança;
- mais reforçada;
- categoria;
- última alteração.

---

# 17. CARTÃO DE MEMÓRIA

Cada cartão mostra:

- texto;
- categoria/subcategoria;
- tipo;
- origem;
- confiança;
- status;
- data de criação;
- última atualização;
- confirmação;
- número de fontes/evidências.

Exemplo:

`Minha chave fica na gaveta da entrada`

`Objetos e lugares · localização`

`Ensinado por você · confiança 100%`

`Aprendido em 24/10/2026 · 2 fontes`

---

# 18. DETALHE DA MEMÓRIA

Mostrar:

## Conteúdo
- texto atual;
- título curto;
- categoria/subcategoria;
- tipo;
- status;
- confiança atual e original.

## Origem
- como foi aprendida;
- data;
- fluxo de origem;
- registro original;
- trecho original.

## Evidências
- lista de registros/fontes;
- tipo da relação: origem, reforço, correção, conflito;
- cada fonte clicável.

## Histórico
- criação;
- edições;
- confirmações;
- conflitos;
- substituições;
- desativações;
- restaurações.

## Uso
Se viável, mostrar última vez que a memória foi usada pelo Copiloto e número de usos.

---

# 19. AÇÕES SOBRE UMA MEMÓRIA

Implementar:

- Editar
- Corrigir
- Confirmar
- Desconfirmar
- Desativar
- Reativar
- Excluir
- Restaurar
- Excluir permanentemente
- Ver origem
- Ver todas as fontes
- Abrir registro de origem
- Marcar como incorreta
- Alterar categoria
- Alterar tipo
- Mesclar duplicata
- Resolver conflito

Ações destrutivas devem pedir confirmação.
Toda edição deve preservar o valor anterior no histórico.

---

# 20. “POR QUE VOCÊ SABE DISSO?”

Cada memória deve ter ação explícita:

**Por que você sabe disso?**

A explicação deve ser humana, sem depender de IDs internos.

Exemplos:

- `Você me ensinou isso em 24/10/2026 na aba Ensinar.`
- `Aprendi isso a partir de um registro seu de 23/10/2026: “Minha chave fica sempre na gaveta da entrada.”`
- `Eu inferi isso a partir de 3 registros. Você confirmou essa conclusão em 24/10/2026.`

---

# 21. “ONDE ISSO APARECEU?”

Adicionar ação que lista todas as entradas que sustentam a memória.

Mostrar:

- data;
- trecho;
- tipo da entrada;
- relação com a memória;
- botão para abrir registro completo.

---

# 22. CONTEXTO-BASE SEPARADO

Criar área:

## **Contexto-base do Copiloto**

Não misturar com memórias pessoais.

Mostrar regras estáveis do produto.

Se viável, mostrar origem da regra, arquivo/versão e indicar se é regra de produto ou pessoal.

Fatos pessoais não devem ficar escondidos permanentemente no `BASE_CONTEXT`.

Se encontrar fatos pessoais codificados lá, documentar e preparar migração para `memorias`.

---

# 23. “O QUE FOI USADO NESTA RESPOSTA?”

Preparar suporte de explicabilidade.

Quando o Copiloto usar memórias em uma resposta, idealmente registrar quais memórias foram incluídas no contexto.

Ação futura/atual:

**O que você usou para responder isso?**

Mostrar:

- memórias utilizadas;
- regras de contexto-base relevantes;
- registros recentes utilizados;
- tarefas/emocões/contextos usados, quando aplicável.

Não expor raciocínio interno oculto. Mostrar apenas fontes/contexto fornecidos ao modelo.

---

# 24. USO DE MEMÓRIAS

Se fizer sentido, criar `memoria_usos` com:

- `id`
- `user_id`
- `memoria_id`
- `interaction_id`
- `mode`
- `created_at`
- `metadata_json`

Objetivos:

- saber quando uma memória foi usada;
- suportar auditoria;
- saber quais nunca são usadas;
- explicar “o que foi usado nesta resposta?”.

Se for arquitetura excessiva para esta etapa, documentar claramente a implementação futura sem bloquear o restante.

---

# 25. ENSINAR ALGO NOVO

Dentro da tela, adicionar:

**+ Ensinar algo**

Aceitar texto e salvar de forma estruturada e rastreável.

Exemplos:

- `Minha chave fica na gaveta da entrada.`
- `Eu não trabalho aos domingos.`
- `Quando eu digo “cliente antiga”, quero dizer cliente recorrente.`

Voz pode ficar para depois se necessário.

---

# 26. CORREÇÕES

Quando o usuário corrigir a IA e marcar que quer lembrar:

- criar memória/correção estruturada;
- preservar afirmação errada anterior se existir;
- marcar como substituída/incorreta;
- guardar origem da correção;
- priorizar a correção no futuro.

---

# 27. MIGRAÇÃO DO SISTEMA ATUAL

Inspecionar como funcionam hoje:

- `memoria_ia`;
- correções lembradas;
- `learnedRules`;
- `memorias_sugeridas`;
- dados pessoais em `registros`;
- contexto pessoal fixo;
- `BASE_CONTEXT`;
- caches locais.

Criar migration/rotina local para migrar o que for seguro para `memorias`.

Regras:

- não perder dados;
- preservar texto original;
- preservar datas quando conhecidas;
- marcar origem como `migrada_sistema_antigo`;
- deduplicar;
- não inventar confiança;
- quando confiança não puder ser reconstruída, usar valor neutro/documentado;
- manter compatibilidade enquanto a migração remota não estiver ativada.

---

# 28. BACKWARD COMPATIBILITY

Enquanto a nova estrutura não estiver ativada remotamente:

- não quebrar os fluxos existentes;
- manter fallback onde necessário;
- não remover suporte antigo prematuramente;
- documentar claramente o que poderá ser removido após a migração real.

---

# 29. RLS E PRIVACIDADE

Toda tabela pessoal nova deve ter RLS.

Garantir:

- usuário só vê seus próprios dados;
- usuário só altera seus próprios dados;
- ownership real no banco;
- relações respeitam ownership;
- segurança não depende apenas do frontend.

Código pode ir para GitHub.
Memória pessoal deve permanecer privada.
Não incluir dados pessoais reais em arquivos públicos do repositório.

---

# 30. EXPORTAÇÃO

Adicionar:

**Exportar o que o Copiloto sabe sobre mim**

Formatos:

## Markdown
Para leitura humana, contendo memória, categoria, tipo, origem, confiança, status, datas, fontes e histórico essencial.

## JSON
Para backup/restauração, preservando estrutura, relações, fontes, histórico e metadados.

Nunca incluir segredos, tokens ou chaves.

---

# 31. IMPORTAÇÃO

Preparar importação segura:

1. selecionar JSON compatível;
2. validar estrutura;
3. mostrar prévia;
4. detectar duplicatas;
5. detectar conflitos;
6. permitir escolher importar/mesclar/ignorar;
7. só depois persistir.

Nunca importar silenciosamente uma massa de memórias sem revisão.

---

# 32. LIXEIRA / RECUPERAÇÃO

Criar seção **Excluídas**.

Ações:

- restaurar;
- excluir permanentemente.

---

# 33. CONTROLE EM MASSA

Se viável sem prejudicar mobile, preparar seleção múltipla para:

- desativar;
- reativar;
- alterar categoria;
- exportar seleção;
- excluir;
- mesclar quando aplicável.

---

# 34. PAINEL DE QUALIDADE DA MEMÓRIA

Se viável, criar visão de manutenção com:

- duplicatas prováveis;
- conflitos;
- candidatos aguardando confirmação;
- memórias sem fonte;
- memórias antigas sem reforço;
- memórias de baixa confiança;
- memórias desativadas;
- memórias nunca usadas.

Objetivo: permitir ao usuário **“limpar a cabeça da IA”**.

---

# 35. NÃO CRIAR MEMÓRIA DEMAIS

Ser conservador.

Não salvar permanentemente:

- acontecimentos triviais isolados;
- estados momentâneos;
- inferências frágeis;
- detalhes circunstanciais sem utilidade futura.

Memória deve representar conhecimento reutilizável.

---

# 36. UX MOBILE FIRST

O PWA é usado principalmente no iPhone.

Requisitos:

- responsivo;
- controles tocáveis;
- sem dependência de hover;
- evitar tabelas largas;
- cards/sheets/listas;
- ações destrutivas separadas;
- detalhes progressivos;
- busca fácil;
- filtros em sheet/modal;
- rolagem confortável;
- preservar identidade visual do Diário Negro.

Não redesenhar o produto inteiro sem necessidade.

---

# 37. PERFORMANCE

Evitar carregar todo histórico pesado de uma vez.

Considerar:

- paginação;
- lazy loading;
- índices SQL;
- filtros no banco;
- carregar fontes/histórico apenas ao abrir memória.

Criar índices úteis para `user_id`, `status`, `ativa`, `categoria`, `created_at`, `fingerprint`, `memoria_id` e `source_record_id`.

---

# 38. TESTES AUTOMATIZADOS OBRIGATÓRIOS

Cobrir pelo menos:

1. criação de memória explícita;
2. inferência não confirmada não vira verdade ativa;
3. correção explícita prevalece;
4. duplicata detectada;
5. conflito detectado;
6. desativada não entra no contexto;
7. excluída não entra no contexto;
8. restaurada volta a ficar disponível;
9. origem preservada;
10. fonte inicial preservada;
11. múltiplas fontes para mesma memória;
12. edição gera histórico;
13. desativação gera histórico;
14. exclusão lógica gera histórico;
15. merge preserva fontes;
16. RLS/ownership correto;
17. filtro por categoria;
18. busca;
19. exportação JSON válida;
20. importação rejeita estrutura inválida;
21. `BASE_CONTEXT` continua separado;
22. interpretação existente não quebra;
23. tarefas existentes continuam funcionando;
24. emoções continuam funcionando;
25. `decidir_agora` continua funcionando;
26. reinterpretação não duplica memória indevidamente.

---

# 39. TESTES MANUAIS / E2E

Preparar lista clara para o usuário testar depois.

## Ensino explícito
Entrada: `Lembre que minha chave fica na gaveta da entrada.`

Esperado: memória aparece, origem correta, confiança alta, fonte identificável e explicação “Por que você sabe disso?”.

## Inferência
Padrão repetido sugere preferência por compras à noite.

Esperado: candidato aguardando confirmação, não verdade ativa.

## Correção
`Não, eu não trabalho domingo. Lembre disso.`

Esperado: correção prevalece e histórico preserva a informação anterior.

## Exclusão
Excluir memória.

Esperado: sai das ativas, não é usada, aparece na lixeira e pode ser restaurada.

## Origem
Abrir “Onde isso apareceu?”.

Esperado: lista registros relacionados e permite abrir o original.

---

# 40. NÃO EXPOR RACIOCÍNIO PRIVADO

A transparência deve mostrar:

- dados usados;
- memórias usadas;
- registros usados;
- regras aplicadas;
- proveniência;
- confiança;
- histórico.

Não tentar expor chain-of-thought/raciocínio interno oculto do modelo.

---

# 41. ARQUIVOS / MODULARIZAÇÃO

Inspecione o projeto e decida os arquivos corretos.

Provavelmente será necessário alterar/criar partes em:

- frontend da tela de memória;
- CSS;
- `app.js`;
- `copiloto.js`;
- módulo dedicado de memórias;
- migrations SQL;
- testes;
- documentação.

Não concentrar tudo em um único arquivo gigante se modularização simples reduzir retrabalho.

---

# 42. DOCUMENTAÇÃO

Criar/atualizar um arquivo local explicando:

- arquitetura da memória;
- tabelas;
- estados;
- origem;
- confiança;
- deduplicação;
- conflitos;
- migração;
- ativação remota futura;
- testes;
- limitações conhecidas.

Sugestão: `MEMORIA_COPILOTO_V082.md`.

---

# 43. CRITÉRIOS DE ACEITAÇÃO

Considere a etapa local concluída somente quando:

- [ ] existe estrutura própria de memória;
- [ ] existe proveniência clara;
- [ ] existe suporte a múltiplas fontes;
- [ ] existe histórico;
- [ ] existe deduplicação;
- [ ] existe tratamento de conflitos;
- [ ] existe tela “O que o Copiloto sabe sobre mim”;
- [ ] busca funciona;
- [ ] filtros funcionam;
- [ ] detalhe mostra origem;
- [ ] “Por que você sabe disso?” funciona;
- [ ] “Onde isso apareceu?” funciona;
- [ ] editar funciona;
- [ ] confirmar funciona;
- [ ] desativar/reativar funciona;
- [ ] excluir/restaurar funciona;
- [ ] lixeira existe;
- [ ] contexto-base aparece separado;
- [ ] exportação local está preparada;
- [ ] importação segura está preparada ou claramente documentada;
- [ ] testes automatizados locais passam;
- [ ] não houve regressão nos fluxos atuais;
- [ ] nenhuma mudança remota foi feita.

---

# 44. RELATÓRIO FINAL

Ao terminar, entregar relatório curto e objetivo com:

1. o que foi implementado;
2. arquivos criados;
3. arquivos alterados;
4. migrations criadas;
5. testes executados;
6. resultados;
7. limitações;
8. o que exige ativação remota depois;
9. riscos ou decisões humanas pendentes.

Rodar no mínimo:

- suíte de testes disponível;
- `git diff --check`;
- `git status --short`;
- revisão do diff;
- validações estáticas possíveis.

Não fazer push nem deploy.

---

# 45. PRIORIDADE FINAL

Ordem de prioridade:

1. **não perder dados**;
2. **máximo controle e transparência para o usuário**;
3. **proveniência auditável**;
4. **não deixar inferência virar verdade silenciosamente**;
5. **preservar o funcionamento atual**;
6. **boa experiência no iPhone**;
7. **baixo retrabalho futuro**;
8. **simplicidade suficiente para manutenção**.

O resultado ideal é um sistema em que o usuário possa abrir o Diário Negro e auditar:

> **“Tudo que a IA sabe sobre mim, por que sabe, de onde veio, quando aprendeu, se eu confirmei, se ainda é válido e o que eu quero fazer com essa informação.”**
