# Memória do Copiloto — arquitetura v0.8.2

## Visão geral

A v0.8.2 separa quatro conceitos:

- `registros`: fatos brutos e linha do tempo;
- `memorias`: conhecimento pessoal reutilizável;
- `memoria_fontes`: evidências que originam, reforçam, corrigem ou contradizem uma memória;
- `memoria_historico`: trilha auditável das alterações;
- `memoria_usos`: quais memórias foram incluídas no contexto de uma interação;
- `BASE_CONTEXT`: regras estáveis do produto, exibidas separadamente na interface.

O navegador nunca recebe `service_role`. Todas as tabelas pessoais têm RLS por `user_id`, políticas separadas por operação e chaves compostas que impedem relacionar uma fonte, histórico ou uso à memória de outro usuário.

## Tabelas

### `public.memorias`

Guarda texto, tipo, categoria, origem, estado, confirmação, confiança original/atual, fonte inicial, fingerprint, chave canônica, substituições, mesclagens, exclusão lógica e metadados. O índice único parcial impede duplicatas exatas vivas para o mesmo usuário.

### `public.memoria_fontes`

Uma memória pode ter várias fontes. `relation_type` distingue origem, reforço, correção, confirmação, conflito e importação. O fingerprint da fonte evita inserir a mesma evidência duas vezes.

### `public.memoria_historico`

Triggers registram criação, edição, confirmação, mudança de estado, conflito, mesclagem, exclusão lógica e exclusão permanente. A exclusão permanente anonimiza a referência (`memoria_id` vira `null`), mas preserva o snapshot auditável anterior.

### `public.memoria_usos`

Registra as memórias incluídas no contexto de cada interação. Isso representa fontes fornecidas ao modelo, não chain-of-thought. A chave única torna a gravação idempotente.

## Estados e aprendizado

- `ativa`: pode entrar no contexto;
- `candidata` / `aguardando_confirmacao`: não entra no contexto;
- `desativada`: preservada, mas não usada;
- `substituida`: versão anterior mantida para auditoria;
- `conflitante`: aguarda resolução humana;
- `excluida`: soft delete, disponível na lixeira.

Ensinos e correções explícitos entram confirmados e com confiança alta. Sugestões da IA são persistidas como inferências não confirmadas, inativas. O botão “Confirmar memória” promove a candidata. Uma inferência não confirmada é filtrada novamente antes da montagem do contexto, como defesa em profundidade.

## Deduplicação e conflitos

O texto é normalizado (caixa, acentos, pontuação e espaços) e recebe fingerprint determinístico. Inserir o mesmo fato reforça a memória existente e acrescenta a nova fonte.

A chave canônica tenta representar o assunto estável. Uma informação diferente sobre o mesmo assunto vira conflito. Se a informação nova for ensino ou correção explícita, ela substitui a anterior, preservando ambas e o histórico. Casos ambíguos ficam inativos como `conflitante` até confirmação.

A mesclagem move todas as fontes para a memória canônica, conserva a maior confiança e marca a duplicata como substituída.

## Interface

Em **Ajustes → Copiloto → O que o Copiloto sabe sobre mim** há:

- resumo de ativas, pendentes, conflitos, desativadas e excluídas;
- busca, filtros e ordenação;
- cartões com origem, confiança, confirmação e fontes;
- “Por que você sabe disso?” e “Onde isso apareceu?”;
- detalhe com evidências, histórico e uso;
- ensinar, editar/corrigir, confirmar/desconfirmar, desativar/reativar;
- resolver conflito, mesclar, excluir, restaurar e excluir permanentemente;
- exportar JSON/Markdown;
- importar JSON com validação e prévia;
- migrar memórias do sistema legado;
- contexto-base separado e identificado como regra de produto.

A tela usa cartões, controles tocáveis e detalhes progressivos, sem tabela larga ou dependência de hover.

## Compatibilidade e migração do legado

Enquanto a migration não for ativada remotamente, `copiloto.js` continua lendo `memoria_ia` e `correcao_ia` em `registros`. Inferências não confirmadas não são gravadas nesse fallback, evitando que virem verdade por acidente.

Após a ativação, o botão **Migrar legado**:

1. lê apenas registros visíveis ao usuário autenticado;
2. preserva texto e data originais;
3. marca a origem como `migrada_sistema_antigo`;
4. usa confiança neutra `0.5`, pois a confiança histórica não pode ser reconstruída;
5. registra o registro antigo como fonte;
6. deduplica e transforma repetições em reforços.

O fallback legado deve permanecer por pelo menos uma versão após a migração real e só deve ser removido depois de conferir contagens, fontes e contexto em produção.

## Exportação e importação

O JSON usa o identificador `diario-negro-memorias-v1` e inclui memórias, fontes, histórico e usos. A importação valida o formato, normaliza entradas, mostra quantas são novas, duplicadas ou conflitantes e só persiste após confirmação. Duplicatas são mescladas; conflitos são ignorados para revisão manual por padrão. Nenhum segredo ou token é exportado.

O Markdown é voltado à leitura humana e inclui texto, tipo, categoria, origem, estado, confiança, datas e fontes.

## Ativação remota futura

Nada desta etapa foi aplicado remotamente. Depois de autorização explícita:

1. revisar `supabase/migrations/20261024170000_create_memorias_governanca.sql`;
2. aplicar a migration no ambiente aprovado;
3. validar RLS com dois usuários de teste e uma sessão anônima;
4. publicar o frontend e a Edge Function `copiloto`;
5. abrir a área de memória, executar a migração legada e conferir o relatório;
6. realizar os testes manuais abaixo;
7. somente depois considerar remover o fallback legado.

Nunca executar `supabase db reset --linked`.

## Testes manuais após ativação

1. Ensinar: `Lembre que minha chave fica na gaveta da entrada.` Verificar origem, 100% de confiança, explicação e fonte.
2. Inferência: provocar uma sugestão de preferência. Verificar que nasce aguardando confirmação, inativa, e não entra no contexto.
3. Confirmar a inferência. Verificar promoção para ativa e histórico.
4. Correção: `Não, eu não trabalho domingo. Lembre disso.` Verificar prioridade sobre informação anterior e preservação da anterior como substituída.
5. Repetir um ensino. Verificar uma única memória com mais de uma fonte.
6. Alterar o lugar da chave. Verificar substituição explícita ou conflito quando ambíguo.
7. Desativar e excluir. Verificar que saem do contexto; restaurar pela lixeira.
8. Abrir “Onde isso apareceu?” e o registro original.
9. Exportar JSON e Markdown; importar o JSON e revisar a prévia sem confirmar primeiro.
10. Interpretar um registro e verificar em “Uso pelo Copiloto” que a memória fornecida ao modelo foi registrada.

## Limitações conhecidas

- A detecção de conflito é lexical por assunto canônico; semântica mais profunda pode ser adicionada depois, mas não deve decidir silenciosamente contra o usuário.
- O painel registra memórias fornecidas ao modelo, não prova que o modelo se apoiou nelas internamente.
- A migration não foi executada em Postgres local porque este clone não possui `supabase/config.toml`, Supabase CLI ou runtime local configurado. Os testes validam contrato, RLS e comportamento do cliente estaticamente e com JavaScript isolado.
- A seleção em massa ficou fora desta entrega; as ações unitárias cobrem todo o ciclo seguro e evitam comprometer a experiência no iPhone.
