# GIRO

Sistema de gestão para oficinas mecânicas: clientes, veículos, ordens de serviço, equipe, estoque e histórico.

Este documento explica como instalar o projeto em outro computador, como configurar o MySQL e como migrar os dados existentes.

## Requisitos

- Node.js 18 ou superior.
- npm.
- MySQL 8.0 ou superior.
- Git, caso o projeto seja baixado de um repositório.

Verifique as versões:

```bash
node --version
npm --version
mysql --version
```

## Instalação do projeto

Entre na pasta do projeto:

```bash
cd Giro-main
```

Instale as dependências:

```bash
npm install
```

O projeto usa Express, Nodemailer e `mysql2`.

## Criar o banco MySQL

Entre no MySQL como administrador:

```bash
mysql -u root -p
```

Dentro do MySQL, crie o banco e o usuário da aplicação. Substitua `SENHA_FORTE` por uma senha criada localmente. Não coloque essa senha neste README:

```sql
CREATE DATABASE IF NOT EXISTS giro
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'giro_user'@'localhost'
  IDENTIFIED BY 'SENHA_FORTE';

CREATE USER IF NOT EXISTS 'giro_user'@'%'
  IDENTIFIED BY 'SENHA_FORTE';

ALTER USER 'giro_user'@'localhost' IDENTIFIED BY 'SENHA_FORTE';
ALTER USER 'giro_user'@'%' IDENTIFIED BY 'SENHA_FORTE';

GRANT ALL PRIVILEGES ON giro.* TO 'giro_user'@'localhost';
GRANT ALL PRIVILEGES ON giro.* TO 'giro_user'@'%';

FLUSH PRIVILEGES;
EXIT;
```

Se o MySQL estiver em Docker, o comando para abrir o cliente é semelhante a:

```bash
docker exec -it NOME_DO_CONTAINER mysql -uroot -p
```

Descubra o nome do container com:

```bash
docker ps
```

## Criar as tabelas

Na raiz do projeto, execute:

```bash
mysql -u giro_user -p giro < database/schema.sql
```

Digite a senha do usuário `giro_user`.

O schema cria tabelas para:

- Oficinas, usuários e sessões.
- Recuperação de senha e convites.
- Clientes e veículos.
- Ordens de serviço e histórico.
- Serviços, peças, materiais e fotos.
- Estoque, reservas e movimentações.
- Leads e auditoria.

Se o banco já existia antes do catálogo de serviços, execute também a migração incremental:

```bash
mysql -u giro_user -p giro < database/migrations/20261022_service_templates.sql
```

O schema usa `CREATE TABLE IF NOT EXISTS` e pode ser executado novamente sem apagar as tabelas existentes.

## Configurar o `.env`

Copie o exemplo:

```bash
cp .env.example .env
```

Abra o arquivo:

```bash
nano .env
```

Configuração mínima do MySQL:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=giro
DB_USER=giro_user
DB_PASSWORD=SENHA_FORTE
DB_CONNECTION_LIMIT=10
```

Para ativar o modo MySQL, mantenha `DB_HOST`, `DB_NAME` e `DB_USER` preenchidos e não defina `GIRO_DATA_DIR`.

Configuração opcional de e-mail:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=seu-email@gmail.com
SMTP_PASS="sua-senha-de-aplicativo"
SMTP_FROM="GIRO <seu-email@gmail.com>"
```

Nunca publique o `.env`, senhas do banco ou senha de aplicativo do Gmail.

## Integracao n8n/Evolution no SENAI

Configure `N8N_API_TOKEN` (segredo local forte) e `N8N_WORKSHOP_ID` (oficina
de demonstracao) no ambiente. Nunca publique tokens. O middleware existente
permite desenvolvimento sem token com alerta, mas nao use assim no SENAI ou
producao. Sem oficina as ferramentas AI retornam 503.

- `GET /api/ai/mechanics`: `{mechanics:[{id,name}]}`, somente mecanicos ativos da oficina, sem outros dados pessoais.
- `GET /api/ai/services?q=opcional`: `{services:[{id,name,defaultPrice}]}`, catalogo ativo, busca literal pelo nome sem alterar nomes.
- `POST /api/ai/service-orders`: `{plate,description,customerPhone,messageId?,assignedUserId?,serviceTemplateId?}`. IDs sao validados na oficina. O template gera snapshot de nome/preco em `laborItems`, `estimatedValue` em centavos e desconto zero; a descricao continua relato do cliente. Precos livres no body sao ignorados. Sem selecoes, mantem criacao progressiva sem inventar preco/atribuicao.
- `GET/POST /api/ai/customers` e `/api/ai/vehicles` continuam disponiveis em JSON e MySQL.
- `messageId` deduplica: 201 na criacao, 200 no retry, 409 se mudar mecanico/servico em novas OS. Por compatibilidade, outras mudancas continuam reutilizando a original; importadas sem hash deduplicam so pela chave.

Importe [`integrations/n8n/giro-agent-tools.json`](integrations/n8n/giro-agent-tools.json)
em area inativa e copie somente as tools **Buscar Mecânicos**, **Buscar Serviços**
e **Criar Ordem de Serviço** para o agente existente. Substitua a tool antiga
de criacao. Sao HTTP Request Tool v4.5, com conexoes apenas `ai_tool` para
`AI Agent`, sem alterar `main`. O host e `host.docker.internal:3000`.
`CONFIGURE_N8N_API_TOKEN` e apenas placeholder; prefira Credential local
Generic Header Auth (`X-N8N-Token`) e remova o header placeholder duplicado.
Nao exporte segredos nem invente IDs de credentials. O prompt curto e detalhes
de importacao estao em [`docs/n8n.md`](docs/n8n.md).

Exemplos **nao executados**: use token apenas no ambiente local e uma instancia
isolada de demonstracao. GETs nao enviam WhatsApp. O POST abaixo cria OS,
nao envia mensagens, e exige cliente/veiculo de teste previamente cadastrados.
Substitua os placeholders por IDs reais retornados pelas tools; nunca use base real.

```bash
curl --fail-with-body 'http://localhost:3000/api/ai/mechanics' \
  -H "X-N8N-Token: ${N8N_API_TOKEN}"
curl --fail-with-body --get 'http://localhost:3000/api/ai/services' \
  --data-urlencode 'q=Revisao' -H "X-N8N-Token: ${N8N_API_TOKEN}"
curl --fail-with-body 'http://localhost:3000/api/ai/service-orders' \
  -H "X-N8N-Token: ${N8N_API_TOKEN}" -H 'Content-Type: application/json' \
  -d '{"plate":"PLACA_TESTE","description":"Relato confirmado do cliente de teste","customerPhone":"TELEFONE_TESTE_NORMALIZADO","assignedUserId":"ID_MECANICO_ATIVO","serviceTemplateId":"ID_SERVICO_ATIVO","messageId":"senai-evento-teste-unico"}'
```

Para teste do **workflow**, mantenha producao desativada e use somente curl
no `webhook-test` com listener temporario, apos conferir allowlist de um
numero de teste **exato** na entrada e no destinatario. Nao libere
`fromMe=false` geral. O filtro self-phone existente pode diferir do filtro
do GIRO; confira ambos usando placeholders, sem configurar numeros novos reais.
**Curl ao workflow pode enviar uma resposta WhatsApp real**, diferentemente
dos GETs diretos acima. Nao execute sem filtro e consentimento do destinatario.

Modelo de comando do workflow, somente para teste controlado e nao executado:

```bash
curl --fail-with-body -X POST 'http://localhost:5678/webhook-test/SEU_PATH_DE_TESTE' \
  -H 'Content-Type: application/json' \
  -d '{"data":{"key":{"id":"senai-teste-unico","remoteJid":"NUMERO_TESTE_EXATO@s.whatsapp.net","fromMe":false},"pushName":"Teste SENAI","message":{"conversation":"Solicitacao de teste controlado"}}}'
```

Verificacao automatizada: `node --check server.js`, `node --check database/store.js`,
`node --test test/n8n-api.test.js` e `npm test`. Testes JSON usam diretorio temporario.
MySQL so executa com `MYSQL_TEST_*` explicitos, em banco exclusivo de teste,
criando e limpando oficinas temporarias. Nunca aponte esses testes para producao.

## Migrar os dados JSON existentes

Antes de migrar, faça uma cópia da pasta `data/`:

```bash
cp -r data data-backup
```

Com o MySQL configurado no `.env`, execute:

```bash
node database/migrate-json.js
```

A migração:

- Lê os JSONs da pasta `data/`.
- Importa oficinas, usuários, clientes, veículos, OS, estoque, tokens, leads e logs.
- Usa uma transação MySQL.
- Pode ser executada novamente sem duplicar os registros importados.
- Não apaga nem altera os arquivos JSON de origem.
- Mostra as quantidades importadas ao terminar.

Uma saída esperada contém linhas semelhantes a:

```text
workshops: 2
users: 2
orders: 11
inventoryItems: 3
movements: 6
```

## Iniciar o sistema

Com MySQL configurado:

```bash
npm start
```

Abra no navegador:

```text
http://localhost:3000/
http://localhost:3000/app/#/login
```

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

Pare o servidor com `Ctrl+C`.

## Confirmar que o MySQL está ativo

Quando o MySQL está configurado, o servidor valida a conexão e o schema na inicialização. Se o banco estiver indisponível, o servidor deve informar o erro e não usar JSON silenciosamente.

Teste o banco diretamente:

```bash
mysql -h 127.0.0.1 -P 3306 -u giro_user -p giro -e "SELECT 1;"
```

Teste a API:

```bash
curl http://localhost:3000/api/health
```

## Testes do projeto

Execute a suíte completa:

```bash
npm test
```

Os testes usam diretórios temporários e ativam o fallback JSON para não alterar o banco real. O teste de navegador exige Chrome disponível no ambiente.

## Como o modo de armazenamento funciona

Quando `DB_HOST`, `DB_NAME` e `DB_USER` estão configurados e `GIRO_DATA_DIR` não está definido, o backend usa MySQL.

Quando `GIRO_DATA_DIR` está definido, o projeto usa JSON. Esse modo é usado pelos testes isolados e pode ser útil para desenvolvimento sem banco.

No computador do SENAI, use MySQL e deixe `GIRO_DATA_DIR` vazio.

O frontend ainda mantém algumas preferências visuais e registros legados de demonstração no `localStorage`. As operações novas do servidor, incluindo autenticação, ordens, clientes/veículos migrados, estoque e histórico, usam o backend configurado.

## Solução de problemas

### `Access denied for user`

O usuário ou a senha do `.env` não correspondem ao usuário MySQL. Entre como root e execute novamente os comandos de `CREATE USER`, `ALTER USER` e `GRANT` deste README. Verifique também se existe o usuário para `%`, pois conexões Docker podem aparecer como `172.x.x.x`.

### `ECONNREFUSED 127.0.0.1:3306`

O MySQL não está iniciado ou está usando outra porta. Verifique o serviço ou o container:

```bash
sudo systemctl status mysql
docker ps
```

### `Column count doesn't match value count`

Atualize o projeto para a versão mais recente do `database/migrate-json.js`. Esse erro indica um migrador desatualizado em relação ao schema.

### `Giro rodando`, mas login não funciona

Confirme que o banco foi migrado, que o `.env` está na raiz do projeto e que não existe `GIRO_DATA_DIR` apontando para um ambiente JSON diferente.

### Porta 3000 ocupada

Verifique o processo:

```bash
ss -ltnp 'sport = :3000'
```

Encerre o processo antigo ou rode temporariamente em outra porta:

```bash
PORT=3001 npm start
```

## Estrutura importante

```text
server.js                 API Express e autenticação
db.js                     Pool e transações MySQL
database/schema.sql       Estrutura do banco
database/migrate-json.js  Migração dos JSONs para MySQL
database/store.js         Persistência MySQL de usuários e OS
database/inventory-store.js Persistência MySQL do estoque
app/                      Frontend do painel
data/                     JSONs legados e fallback de testes
```

## Segurança

- Não versionar `.env`.
- Não colocar senhas no código ou no schema.
- Não compartilhar senha de MySQL ou SMTP em mensagens.
- Fazer backup do banco antes de executar alterações estruturais.
- Usar um usuário MySQL exclusivo para o GIRO.
- Não usar o usuário root no `.env` da aplicação.
