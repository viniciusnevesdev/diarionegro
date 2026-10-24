# CONTEXTO_CODEX.md
# Diário Negro / BBB — contexto para o Codex

## 1. Objetivo

Este arquivo é a fonte de contexto inicial para o Codex assumir o desenvolvimento local do projeto **Diário Negro / BBB** sem reconstruir toda a conversa anterior.

Leia este arquivo inteiro antes de alterar qualquer coisa.

Prioridades:

1. terminar o projeto funcional rapidamente;
2. preservar dados e comportamento já existente;
3. evitar retrabalho;
4. trabalhar com alta autonomia;
5. interromper o usuário apenas quando houver decisão realmente pessoal, destrutiva, financeira, de publicação/deploy ou ambiguidade relevante.

Não reabra decisões já tomadas sem uma razão técnica forte.

---

## 2. Repositório local

Repositório GitHub:

`viniciusnevesdev/diarionegro`

Clone local:

`/Users/vinicius/Documents/Projetos/diarionegro`

Branch preparada:

`bbb-v0.8.1`

Estado conhecido antes de o Codex assumir:

- branch `bbb-v0.8.1` existe;
- o clone veio limpo de `main`;
- nenhuma alteração funcional da v0.8.1 foi confirmada como aplicada;
- existe uma pasta local `.bbb-backups/` criada por uma tentativa anterior de patch;
- essa pasta não faz parte do produto;
- antes de trabalhar, rode `git status` e confirme o estado real;
- se houver alterações não esperadas nos arquivos de produto, inspecione-as antes de continuar.

Não use conectores/plugins do GitHub para modificar o repositório. Trabalhe pelo filesystem local, Git e Terminal.

Não faça `push`, merge em `main`, deploy ou alteração de produção sem aprovação explícita do usuário.

---

## 3. Produto

O projeto se chama **Diário Negro**.

Conceito central:

> “Diário Negro é a minha caixa-preta.”

É um PWA pessoal de auto-observação e organização da vida.

O produto registra acontecimentos, notas, tarefas, emoções, hábitos e contexto pessoal e usa uma camada de IA chamada **Copiloto** para interpretar esses registros.

A intenção não é ser apenas um app de tarefas. O Diário Negro deve funcionar como uma linha do tempo inteligente da vida.

Exemplos de acontecimentos que devem ser compreendidos como eventos:

- tomar banho;
- começar ou terminar uma rotina;
- tomar um medicamento;
- comprar um medicamento;
- fazer uma compra;
- sair com amigos;
- encontrar uma pessoa;
- iniciar ou terminar um atendimento de cliente;
- ir ao médico;
- aplicar medicamento;
- deslocamentos;
- compromissos;
- acontecimentos gerais da vida.

---

## 4. Arquitetura atual relevante

Arquivos importantes:

- `app.js`
- `copiloto.js`
- `dn-ai.js`
- `supabase/functions/copiloto/index.ts`
- `supabase/functions/transcrever-audio/index.ts`
- `supabase/functions/interpretar-registro/index.ts`
- `CONTEXTO_PESSOAL_V08.md`
- `ATIVAR_V08_COPILOTO.md`

Supabase project ref:

`htaflxymnkdretchfskn`

Edge Functions conhecidas:

- `interpretar-registro`
- `copiloto`
- `transcrever-audio`

O projeto usa registros estruturados em `public.registros`.

O front-end já usa Supabase Auth.

Nunca coloque `service_role` no navegador.

Novas tabelas expostas ao cliente devem usar RLS e privilégios mínimos.

---

## 5. Estado atual do sistema de tarefas

O sistema de tarefas já possui APIs no front-end.

Em `app.js`, existem funções equivalentes a:

- `window.DN_APP_API.getTasks()`
- `window.DN_APP_API.createTaskFromAI(...)`
- `window.DN_APP_API.editTask(...)`
- `window.DN_APP_API.deleteTask(...)`
- `window.DN_APP_API.startTask(...)`
- `window.DN_APP_API.completeTask(...)`

Eventos estruturados existentes incluem:

- `tarefa_criada`
- `tarefa_editada`
- `tarefa_iniciada`
- `tarefa_concluida`
- `tarefa_excluida`

**Não recrie o sistema de tarefas.**

O problema principal é conectar corretamente a interpretação da IA às tarefas já existentes.

---

## 6. Problema central da v0.8.1

Hoje, no modo comum de interpretação, a IA não recebe adequadamente a lista de tarefas abertas.

Com isso, ela não consegue relacionar um registro novo a uma tarefa já existente.

### Exemplo obrigatório

Existe uma tarefa semelhante a:

> “pegar/buscar receitas no médico”

Depois o usuário registra:

> “Hoje à tarde, depois de pegar as receitas com o médico, eu fiz a aplicação de testosterona.”

Comportamento desejado:

1. registrar **aplicação de testosterona** como acontecimento da vida;
2. reconhecer que “pegar as receitas” aconteceu;
3. localizar a tarefa existente correspondente;
4. marcar essa tarefa como concluída;
5. não criar uma tarefa nova duplicada.

A IA deve receber as tarefas atuais com IDs reais.

Ela nunca pode inventar `task_id`.

---

## 7. Eventos estruturados

A interpretação precisa deixar de ser apenas resumo/categoria/tags/tarefas/emoções e gerar também **eventos estruturados da vida**.

Estrutura conceitual sugerida:

```json
{
  "tipo": "atividade",
  "nome": "Banho",
  "estado": "iniciado",
  "categoria": "Rotina",
  "subcategoria": "Cuidado pessoal",
  "momento": "...",
  "detalhes": "",
  "confianca": 0.98
}
```

Estados úteis:

- ocorreu;
- iniciado;
- concluído;
- tomado;
- comprado;
- agendado;
- cancelado.

### Exemplo obrigatório

Entrada:

> “comecei a tomar banho”

Resultado esperado:

- categoria: `Rotina`
- subcategoria: `Cuidado pessoal`
- evento: `Banho`
- estado: `iniciado`

Depois:

> “terminei o banho”

Deve ser interpretado como evento `Banho`, estado `concluído`.

Nesta primeira versão, não é obrigatório construir um motor complexo de correlação temporal entre eventos, mas a estrutura precisa permitir isso depois.

---

## 8. Categoria e subcategoria

Adicionar distinção entre:

- `categoria`
- `subcategoria`

Exemplos:

- `Rotina > Cuidado pessoal`
- `Saúde > Medicamentos`
- `Trabalho > Atendimento`
- `Social > Amigos`
- `Compras > Casa`

Não criar uma taxonomia rígida enorme nesta etapa.

---

## 9. Ações sobre tarefas existentes

O schema do Copiloto deve poder retornar ações sobre tarefas existentes.

Estrutura conceitual:

```json
{
  "acao": "concluir",
  "task_id": "ID_REAL",
  "titulo_referencia": "Pegar receitas no médico",
  "novo_titulo": "",
  "evidencia": "O usuário disse que fez outra ação depois de pegar as receitas.",
  "confianca": 0.96
}
```

Ações inicialmente necessárias:

- `iniciar`
- `concluir`
- `editar`

Política de segurança:

- nunca inventar ID;
- só agir sobre IDs recebidos;
- não concluir uma tarefa por mera semelhança vaga;
- usar confiança alta;
- para autoexecução, usar limiar conservador, aproximadamente `>= 0.85`;
- quando houver dúvida relevante, não executar automaticamente.

---

## 10. Persistência das interpretações

Problema atual:

`dn-ai.js` usa cache local com prefixo semelhante a `dn-ai-v07:`.

Isso pode prender a interpretação ao navegador/dispositivo e causar nova chamada da IA/gasto de tokens.

A v0.8.1 deve persistir interpretações no Supabase.

Objetivo:

- uma interpretação pertence a um registro;
- abrir novamente o registro mostra a interpretação já salva;
- não chamar a IA novamente;
- só reinterpretar quando o usuário escolher explicitamente algo equivalente a “Interpretar novamente”.

Tabela sugerida:

`public.interpretacoes`

Campos úteis:

- `id`
- `user_id`
- `record_id`
- `resumo`
- `categoria`
- `subcategoria`
- `intencao`
- `dados_json`
- `origem`
- `modelo`
- `context_version`
- `created_at`
- `updated_at`

Restrição:

`unique (user_id, record_id)`

Segurança:

- RLS habilitado;
- `authenticated` pode `select`, `insert`, `update`;
- usuário só acessa linhas com `user_id = auth.uid()`;
- `anon` sem acesso;
- indexar `user_id`;
- filtrar por `user_id` também nas consultas do cliente.

Preferir migration versionada se o projeto já usar migrations.

Antes de executar qualquer migration remota, pedir aprovação ao usuário.

---

## 11. Timeline

`dn-ai.js` é responsável por interpretação na linha do tempo.

Comportamento desejado:

1. verificar se existe interpretação persistida no Supabase;
2. se existir, exibir `Ver interpretação`;
3. não chamar OpenAI;
4. se não existir, permitir `Interpretar com IA`;
5. depois da interpretação, salvar no Supabase;
6. `Interpretar novamente` deve ser uma ação explícita.

A UI deve mostrar pelo menos:

- resumo;
- categoria;
- subcategoria;
- eventos;
- ações sobre tarefas;
- tarefas novas detectadas;
- emoções, quando houver.

---

## 12. Fluxo principal do Copiloto

Em `copiloto.js`, o fluxo atual de texto aproximadamente:

1. recebe texto;
2. salva registro fonte;
3. chama Edge Function `copiloto`;
4. processa resultado;
5. cria tarefas novas;
6. registra emoções;
7. renderiza resultado.

Atualização desejada:

Antes da chamada da IA:

- buscar tarefas atuais com `DN_APP_API.getTasks()`;
- enviar IDs e informações relevantes das tarefas abertas;
- enviar horário atual;
- enviar timezone do navegador.

Depois da resposta:

- aplicar ações de tarefas existentes quando seguras;
- criar somente tarefas realmente novas;
- persistir interpretação vinculada ao `sourceRecord.id`;
- renderizar resultado.

Evitar duplicidade de efeitos quando uma interpretação persistida é apenas reaberta.

Ações de tarefa não devem ser executadas novamente só porque o usuário abriu uma interpretação antiga.

---

## 13. Backend / Edge Function `copiloto`

Arquivo:

`supabase/functions/copiloto/index.ts`

O schema atual possui aproximadamente:

- `resumo`
- `intencao`
- `categoria`
- `pessoas`
- `tags`
- `tarefas`
- `emocoes`
- `sessao`
- `memorias_sugeridas`

Adicionar:

- `subcategoria`
- `eventos`
- `acoes_tarefas`

No modo normal de interpretação, receber também:

- tarefas abertas;
- horário;
- timezone.

O modo `decidir_agora` já recebe contexto operacional de tarefas e não deve ser quebrado.

Não reescrever a função inteira sem necessidade.

Preservar:

- `BASE_CONTEXT` existente;
- regras aprendidas;
- fluxo de foto;
- structured output;
- comportamento `decidir_agora`.

---

## 14. Memória do Copiloto — não é prioridade da v0.8.1

O sistema atual possui memória em registros como `memoria_ia` e `correcao_ia`.

Problemas conhecidos:

- poucas memórias;
- possível duplicação;
- memória pouco estruturada;
- contexto carregado de forma simples;
- sem retrieval semântico;
- anotação normal não vira automaticamente memória persistente.

Arquitetura desejada no futuro:

- `REGISTROS` = histórico bruto
- `MEMÓRIAS` = conhecimento persistente
- `TAREFAS` = estado operacional
- `EMOÇÕES` = estado temporal
- `BASE_CONTEXT` = regras estáveis

Mas não priorize grande refatoração de memória agora.

---

## 15. Listas / Shopping — próxima fase

Depois da v0.8.1, criar listas independentes de tarefas.

Exemplos:

- Compras
- coisas para levar
- listas personalizadas

Exemplo:

> “acabou detergente”

Pode adicionar `detergente` à lista de compras.

Exemplo:

> “coloca carregador nas coisas pra levar pra casa da minha mãe”

Deve inserir em uma lista apropriada.

Não misturar lista de compras com tarefas gerais.

Planejado para etapa posterior, aproximadamente v0.8.2.

---

## 16. Voz e fotos — problemas conhecidos

### Voz

Fluxo atual:

áudio → `transcrever-audio` → texto → interpretação.

Desejado depois:

- transcript visível;
- transcript editável;
- transcript persistente.

### Fotos

Hoje:

- até 4 fotos;
- compressão client-side;
- IA analisa imagem;
- nota opcional.

Desejado depois:

- thumbnails;
- progresso claro;
- nota interpretada;
- informação reutilizável eventualmente pode virar memória.

Não deixar melhorias visuais atrasarem o cérebro da v0.8.1.

---

## 17. UX conhecida para fases seguintes

Problemas já identificados:

- botões positivos/neutros não devem ser pretos;
- preferir azul ou verde;
- modal precisa de melhor posicionamento;
- teclado pode atrapalhar modal/input;
- botão fechar precisa de refinamento;
- home futuramente deverá ter páginas horizontais:
  - Tarefas
  - Compras
  - listas personalizadas.

Esses pontos vêm depois do núcleo funcional.

---

## 18. Bug conhecido em memória

Existe um possível bug na ação “Ensinar isso”:

memórias sugeridas podem ser filtradas/reindexadas visualmente e o índice do clique pode apontar para a posição errada do array original.

Não é prioridade máxima da v0.8.1, mas não piorar esse comportamento.

---

## 19. Ordem de implementação acordada

Prioridade:

1. persistência durável da interpretação;
2. eventos estruturados;
3. sincronização com tarefas existentes;
4. categoria + subcategoria;
5. listas / compras;
6. memória automática controlada;
7. refinamentos de UX.

A primeira entrega deve focar nos quatro primeiros itens.

---

## 20. Testes obrigatórios da v0.8.1

### Teste A — tarefa existente concluída

Pré-condição:

existe tarefa aberta:

> “Pegar receitas no médico”

Entrada:

> “Hoje à tarde, depois de pegar as receitas com o médico, eu fiz a aplicação de testosterona.”

Esperado:

- aplicação de testosterona vira evento;
- tarefa de receitas é localizada pelo ID real;
- tarefa é concluída;
- nenhuma tarefa duplicada é criada;
- interpretação é persistida.

### Teste B — evento iniciado

Entrada:

> “comecei a tomar banho”

Esperado:

- categoria: Rotina;
- subcategoria: Cuidado pessoal;
- evento: Banho;
- estado: iniciado;
- não criar tarefa permanente sem motivo.

### Teste C — tarefa nova continua funcionando

Entrada contendo uma pendência real nova.

Esperado:

- `tarefas[]` continua criando tarefa nova via `createTaskFromAI`;
- fluxo existente não é quebrado.

### Teste D — persistência

Depois de interpretar um registro:

1. recarregar página;
2. abrir o mesmo registro.

Esperado:

- interpretação é carregada do Supabase;
- não há chamada nova à OpenAI;
- botão indica que já existe interpretação;
- somente `Interpretar novamente` gera nova análise.

---

## 21. Critérios de autonomia

O usuário quer alta autonomia.

Pode decidir sozinho:

- nomes internos de funções;
- estrutura de helpers;
- pequenos ajustes de schema;
- testes;
- refactors seguros;
- implementação técnica reversível;
- criação de branch;
- commits locais;
- correções necessárias para fazer testes passarem;
- instalação local de dependências leves se realmente necessárias.

Peça aprovação antes de:

- `git push`;
- merge em `main`;
- deploy;
- executar migration no Supabase remoto;
- apagar dados;
- resetar banco;
- alterar produção;
- criar gastos relevantes;
- expor serviço à internet;
- mudar requisito de produto;
- decidir algo subjetivo que pertence ao usuário.

Nunca execute `supabase db reset --linked`.

---

## 22. Git

Trabalhe na branch:

`bbb-v0.8.1`

Antes de alterar:

```bash
git status
git branch --show-current
```

Durante o trabalho:

- mantenha alterações pequenas e rastreáveis;
- use `git diff`;
- rode testes;
- faça commits locais coerentes quando útil.

Não faça push sem aprovação.

Não altere credenciais.

Não coloque tokens em arquivos versionados.

---

## 23. Segurança

Não ler, imprimir, enviar ao modelo ou versionar segredos desnecessariamente.

Não expor:

- GitHub PAT;
- service role;
- OpenAI API key;
- senhas.

Pode usar publishable key do Supabase no cliente se o projeto já foi arquitetado dessa forma.

RLS é obrigatório para nova tabela acessível pelo navegador.

---

## 24. Forma de trabalhar

Não pedir ao usuário para executar pequenos comandos e colar resultados repetidamente.

Você está rodando localmente com acesso ao repositório.

Portanto:

1. inspecione;
2. planeje;
3. altere;
4. rode testes;
5. leia os erros;
6. corrija;
7. repita;
8. apresente o resultado.

Se algo falhar, investigue você mesmo antes de perguntar.

Pergunte apenas quando realmente precisar de uma decisão humana.

---

## 25. Missão inicial para o Codex

Ao assumir este projeto:

1. leia este arquivo;
2. leia os arquivos relevantes do repositório;
3. rode `git status`;
4. confirme que está em `bbb-v0.8.1`;
5. inspecione a arquitetura atual;
6. implemente a menor solução segura para a v0.8.1;
7. implemente:
   - persistência de interpretações;
   - categoria + subcategoria;
   - eventos;
   - ações sobre tarefas existentes;
8. preserve o modo `decidir_agora`;
9. preserve criação de novas tarefas;
10. escreva ou ajuste testes;
11. rode os testes;
12. corrija o que falhar;
13. não faça deploy;
14. não faça push;
15. ao terminar, apresente:
    - arquivos alterados;
    - o que foi implementado;
    - testes executados;
    - resultados;
    - riscos restantes;
    - qualquer etapa que realmente precise de aprovação.

---

## 26. Prompt inicial recomendado

> Leia `CONTEXTO_CODEX.md` inteiro e assuma o desenvolvimento deste projeto a partir dele. Trabalhe de forma autônoma na v0.8.1. Inspecione primeiro o estado real do repositório e não presuma que patches anteriores foram aplicados. Implemente persistência de interpretações, eventos estruturados, categoria/subcategoria e sincronização com tarefas existentes. Preserve os fluxos atuais. Rode testes, investigue e corrija erros sozinho. Não faça push, deploy nem alterações no Supabase remoto sem minha aprovação. Só me interrompa se houver uma decisão realmente humana ou uma ação irreversível/externa.

---

## 27. Definição de pronto da primeira etapa

A v0.8.1 só está pronta quando:

- código local funciona;
- testes mínimos passam;
- os quatro testes obrigatórios foram cobertos adequadamente;
- diff foi revisado;
- nenhum segredo foi exposto;
- nenhum deploy/push ocorreu sem autorização;
- o Codex consegue explicar claramente o que mudou.

Depois disso, pedir aprovação para a etapa remota:

- migration Supabase;
- deploy da Edge Function;
- publicação do front-end;
- testes reais no ambiente do usuário.
