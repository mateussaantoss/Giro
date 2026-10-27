# Banco de dados MySQL do GIRO

O arquivo `schema.sql` cria o banco `giro` e as tabelas necessárias para a primeira etapa da migração:

- oficinas, usuários, permissões, sessões e recuperação de senha;
- leads da landing page;
- clientes, veículos e equipe;
- ordens de serviço, status, histórico, observações, serviços, peças e fotos;
- estoque, reservas, idempotência de operações, auditoria e configurações da oficina.

## Importar em outro ambiente

Requisitos: MySQL 8.0 ou superior.

```sh
mysql -u SEU_USUARIO -p < database/schema.sql
```

Ou, dentro do cliente MySQL:

```sql
SOURCE /caminho/para/database/schema.sql;
```

O script usa `CREATE TABLE IF NOT EXISTS`, portanto pode ser executado novamente sem apagar os dados existentes.

## Modo operacional MySQL

Definir `DB_HOST`, `DB_NAME` e `DB_USER` ativa o modo MySQL do servidor. Nesse modo o bootstrap valida o schema e carrega os dados do banco; os JSON não são lidos nem escritos. Se qualquer variável obrigatória estiver ausente, o servidor usa os arquivos JSON apenas para desenvolvimento e testes isolados.

Uma falha de conexão ou schema no modo MySQL interrompe o startup, sem fallback silencioso.

## Migrar os JSON existentes

Configure `DB_HOST`, `DB_NAME` e `DB_USER` (a senha pode ser vazia em ambiente local) e execute:

```sh
node database/migrate-json.js
```

O diretório é `GIRO_DATA_DIR` quando definido, ou `data/`. A migração lê os JSON, importa tudo em uma transação, usa upserts idempotentes, imprime contagens e nunca remove ou altera os arquivos de origem. Em falha, a transação é revertida.

## Integração da aplicação

Os arquivos de origem nunca são removidos ou alterados pela migração.

`db.js` fornece `createPool`, `withTransaction` e `close`; ele não abre conexão ao ser carregado. Não coloque senha diretamente no código ou no `schema.sql`.

### Integração atual

O modo MySQL integra o bootstrap, sessões, autenticação, equipe, clientes/veículos, ordens de serviço, histórico, entrega, cancelamento, estoque, reservas, materiais, movimentações e auditoria. O fallback JSON permanece disponível somente para testes isolados e desenvolvimento sem `DB_*` configurado.

O `server.js` ativa o MySQL quando `DB_HOST`, `DB_NAME` e `DB_USER` estão definidos e `GIRO_DATA_DIR` não está definido. Em um ambiente de produção, mantenha o banco configurado e não use `GIRO_DATA_DIR`.
