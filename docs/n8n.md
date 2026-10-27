# Integracao n8n/Evolution para SENAI

## Ambiente e autorizacao

Configure no ambiente do GIRO `N8N_API_TOKEN` (segredo forte local) e
`N8N_WORKSHOP_ID` (ID da oficina de demonstracao). Nao publique o token.
Todas as rotas abaixo reutilizam `n8nToken` e exigem `X-N8N-Token` quando
o token esta configurado. O comportamento legado sem token continua aberto
para desenvolvimento com alerta: nunca use assim em producao ou no SENAI.
As ferramentas AI retornam 503 sem oficina configurada. O body nao escolhe oficina.

## Contrato das APIs

- `POST /api/whatsapp/messages`: normaliza a entrada Evolution ou `{phone,name,text}` e retorna `{message:{phone,name,text}}`. Nao envia WhatsApp e nao persiste mensagens.
- `GET/POST /api/ai/customers`: consulta por `?phone=...` ou cria cliente com `{name,phone}`.
- `GET/POST /api/ai/vehicles`: consulta por `?plate=...` ou cria veiculo com `{plate,model,year,customerPhone}`.
- `GET /api/ai/mechanics`: `{mechanics:[{id,name}]}`, apenas mecanicos ativos da oficina, role normalizada, status `ACTIVE`/`active`. Sem e-mail, senha, telefone ou outros campos de usuario.
- `GET /api/ai/services?q=...`: `{services:[{id,name,defaultPrice}]}`, apenas catalogo ativo da oficina. `q` e opcional e busca trecho literal do nome, sem diferenciar maiusculas; apostrofos, acentos, `%` e `_` nao viram SQL ou curingas. Os nomes retornam intactos.
- `POST /api/ai/service-orders`: `{plate,description,customerPhone,messageId?,assignedUserId?,serviceTemplateId?}`. O header `X-Message-Id` tem precedencia sobre o body. Retorna `{ok:true,created,order}`, HTTP 201 na criacao ou 200 no retry.

IDs selecionados precisam pertencer a oficina e estar ativos; mecanico precisa
ter role MECHANIC. IDs invalidos, inativos ou externos retornam 400.
Cliente/veiculo inexistente retorna 404; veiculo de outro cliente retorna 409.
Com template, `service` recebe o nome do catalogo; `issue` continua sendo
o relato em `description`. O servidor grava um snapshot independente:
`laborItems:[{templateId,description:template.name,value:defaultPrice}]`,
`estimatedValue` arredondado a centavos, `discount:0`, e nota no historico
informando estimativa sujeita a avaliacao, nao agendamento confirmado.
`order.estimatedValue` no retorno AI reflete o valor salvo, inclusive em retries.
Preco, desconto ou laborItems enviados arbitrariamente no body sao ignorados.
Editar/desativar o template nao altera o snapshot de uma OS existente.

Sem IDs, a criacao progressiva existente e preservada: sem atribuicao,
`estimatedValue:null`, `laborItems:[]`, sem inventar preco ou mecanico.
O backend JSON e o MySQL suportam consultas e as tres mutacoes AI.
No MySQL, validacoes, locks e snapshot ficam na mesma transacao;
`created_by` e `history.userId` continuam nulos.

### Idempotencia e compatibilidade

`messageId` deduplica por oficina. Novas OS armazenam hash **somente das
selecoes** (mecanico e template): alterar ou remover uma selecao no retry
retorna 409. A comparacao ocorre antes da revalidacao do catalogo, permitindo
retries apos editar/desativar o template sem recalcular preco.
Por compatibilidade shipped, mudar apenas descricao, placa ou telefone ainda
reutiliza a OS original; nao ha hash integral do payload. OS importadas/antigas
sem hash continuam deduplicadas apenas pela chave, sem invalidacao retroativa.
Sem messageId nao ha garantia de deduplicacao. Nao use um novo messageId para
contornar 409: encaminhe a divergencia para atendimento humano.

## Importar somente as tools

Arquivo: [`integrations/n8n/giro-agent-tools.json`](../integrations/n8n/giro-agent-tools.json).
Contem somente tres HTTP Request Tool `n8n-nodes-base.httpRequestTool` v4.5:
**Buscar Mecanicos**, **Buscar Servicos** e a versao atualizada de
**Criar Ordem de Servico** (os nomes no editor preservam acentos).
Importe em uma area temporaria/inativa e copie os tres nos para o workflow
existente; substitua a tool antiga de criacao, nao mantenha duas com mesmo nome.
Nao recrie o workflow, nao altere conexoes `main`, containers ou ativacao.
As conexoes fornecidas sao apenas `ai_tool` para `AI Agent`; se o editor nao
resolver a referencia externa, conecte as tres tools manualmente ao agente existente.

Todos os requests usam `http://host.docker.internal:3000` (nao 3001).
O host precisa estar acessivel do n8n; nao altere containers automaticamente.
Os headers contem somente `CONFIGURE_N8N_API_TOKEN`, um placeholder que **nao
autentica**. Prefira no editor Authentication > Generic Credential Type >
Header Auth, com Credential local de nome `X-N8N-Token` e valor secreto;
remova o header placeholder para nao enviar headers duplicados. Nenhum ID de
credential foi inventado no arquivo. Nao exporte o valor secreto no JSON.

`customerPhone` vem de `$('HTTP Request1').item.json.message.phone`, ja
normalizado pelo GIRO. `messageId` vem de
`$('Webhook').item.json.body.data.key.id`, nunca de `$fromAI`.
Confirme esses nomes e a estrutura real do evento no workflow existente;
nao execute eventos sem ID valido. `q` usa `$fromAI` com default vazio.
Somente placa, relato e selecoes confirmadas sao preenchidos pelo modelo.

### System prompt curto para colar no agente

```text
Voce atende a oficina GIRO. Consulte Buscar Mecanicos e pergunte a preferencia do cliente; use so o ID real escolhido, ou vazio se sem preferencia. Consulte Buscar Servicos antes de informar precos ou selecionar servico. Nao invente IDs, precos, diagnosticos ou disponibilidade. Confirme ambiguidades e a escolha do servico. Descreva valores como estimativas do catalogo sujeitas a avaliacao, nunca como agendamento confirmado. Confirme cliente, veiculo e relato antes de Criar Ordem de Servico. Nao envie preco livre; o servidor calcula o snapshot. Nao invente telefone nem messageId: as ferramentas usam o evento normalizado. Se faltar informacao, continue o cadastro progressivo sem inventar dados. Em erro 409, nao tente criar novamente com outra chave; encaminhe ao atendimento humano.
```

## Testes seguros

Os exemplos curl GET/POST estao no [README SENAI](../README.md#integracao-n8nevolution-no-senai).
GETs e requests diretos ao GIRO nao enviam WhatsApp/e-mail. POST cria dados;
use apenas ambiente isolado de demonstracao, nunca base real.

Para validar o workflow, mantenha producao **desativada** e use somente
`curl` no endpoint `webhook-test` com o listener de teste habilitado.
Antes do agente e do envio, exija allowlist de **um numero de teste exato**,
normalizado, tanto na entrada como no destinatario. Nunca libere
`fromMe=false` indiscriminadamente: isso inclui clientes reais.
Um curl ao workflow **pode enviar resposta WhatsApp real** pela Evolution;
so execute apos verificar filtro e destinatario, com consentimento do teste.
Nao foi executado nenhum curl de workflow nesta implementacao.

`fromMe=true` e ignorado pelo GIRO para evitar loops. O teste self-phone
legado depende de `N8N_TEST_PHONE=NUMERO_TESTE_EXATO_NORMALIZADO` e
`N8N_TEST_PREFIX=#giro`: apenas esse numero com esse prefixo e aceito.
O filtro self-phone do workflow e o do GIRO podem diferir; confira ambos,
nao suponha equivalencia nem configure numeros reais novos. Remova a excecao
apos testar e mantenha a allowlist no workflow, inclusive para `fromMe=false`.

```bash
node --check server.js
node --check database/store.js
node --test test/n8n-api.test.js
npm test
```

O teste JSON cria fixtures em diretorio temporario, sem SMTP. O teste MySQL
somente roda com `MYSQL_TEST_HOST`, `MYSQL_TEST_NAME`, `MYSQL_TEST_USER` e
`MYSQL_TEST_WORKSHOP_ID` explicitamente configurados (opcionais: PORT,
PASSWORD e N8N_TOKEN com prefixo `MYSQL_TEST_`). Use banco exclusivo de teste,
nunca producao. O workshop configurado e apenas gate de opt-in legado: o teste
cria oficinas UUID proprias, clientes, veiculos, mecanicos e templates e limpa
somente essas fixtures. Nao usa `DB_*` de producao como fallback.
