# GIRO — Frontend da plataforma

## Executar

Na raiz do projeto:

```sh
npm install
npm start
```

- Painel: http://localhost:3000/app/
- Login: http://localhost:3000/app/#/login
- Cadastro: http://localhost:3000/app/#/cadastro
- Landing page: http://localhost:3000/

O acesso ao painel passa pelo backend de autenticação do GIRO. A tela de login não possui credenciais preenchidas por padrão.

## Stack e organização

Foi mantida a stack existente: HTML, CSS e JavaScript puro, servidos pelo Express já presente no projeto. Não há build obrigatório, framework adicional ou dependência de runtime nova.

- `index.html`: documento da aplicação, carregamento e diálogo acessível.
- `styles.css`: tokens visuais, layout, componentes e breakpoints.
- `data.js`: status do sistema e fábrica de estado inicial vazio.
- `app.js`: componentes compartilhados, renderização, roteador por hash, eventos e persistência.
- `mark.svg`: marca vetorial GIRO.

O painel usa rotas por hash; links diretos e recarregamento funcionam com o servidor estático existente.

## Rotas

| Rota | Tela |
| --- | --- |
| `#/dashboard` | Visão geral baseada em Entrada, Aguardando peças e Pronto |
| `#/patio` | Kanban com as três etapas operacionais |
| `#/servicos` | Meus Serviços, exclusivo do mecânico e filtrado no backend |
| `#/ordens` | Tabela de ordens |
| `#/ordens/1048` | Detalhes da ordem |
| `#/clientes` e `#/clientes/1` | Clientes e relacionamento |
| `#/estoque` | Peças, materiais, saldos e histórico; dono e gerente |
| `#/whatsapp` | Temporariamente indisponível na interface |
| `#/historico` | Histórico da oficina e ordens encerradas |
| `#/equipe` | Equipe e serviços atribuídos |
| `#/relatorios` | Gestão, gráficos e exportação |
| `#/configuracoes` | Oficina, notificações, integrações e restauração |
| `#/ajuda` | Instruções da experiência |
| `#/login`, `#/cadastro`, `#/recuperar` | Acesso e onboarding |

## Fluxos implementados

- Criar OS no servidor com cliente, telefone, veículo, problema, serviço, prioridade, prazo, peças reservadas, itens pendentes e mão de obra. Campos incompletos podem ser preenchidos depois pelo administrador.
- Cadastrar peças e materiais, registrar entradas e saídas com motivo, consultar estoque mínimo e arquivar itens preservando o histórico.
- Reservar peças na OS sem baixa imediata; a transição para Pronto faz o commit no servidor. O histórico de materiais legado continua disponível para consulta.
- Status simplificados: Entrada, Aguardando peças e Pronto; uma OS pode ir diretamente de Entrada a Pronto.
- O mecânico usa apenas Aguardando peças e Finalizado; as mudanças são persistidas e auditadas no backend.
- Pronto permanece ativo no Pátio até Entregar veículo. A entrega grava usuário/data, tira a OS das filas ativas e mantém a consulta no Histórico; somente dono pode reabrir uma OS encerrada.
- A Visão Geral mostra contadores ativos e resumos expansíveis; ordens encerradas não entram nos totais operacionais.
- Busca e filtros de oficina permanecem nas telas administrativas; Meus Serviços usa somente as OS atribuídas à sessão autenticada.
- Registrar diagnóstico, observação, problema, peças, serviços adicionais e fotos.
- Fotos JPG/PNG/WebP de até 2 MB são redimensionadas para armazenamento local.
- Cadastrar clientes, veículos e membros da equipe; atualizar quilometragem.
- Usar dados de uma conversa para preencher uma nova OS; simular envio de mensagens.
- Exportar ordens filtradas e relatório em CSV compatível com planilhas.
- Editar oficina, preferências e restaurar demonstração com confirmação.
- Cadastro progressivo em quatro etapas, sem armazenar senha.

## Dados e limites da demonstração

Novas OS, cadastros gerados por elas e estoque são persistidos no servidor, por oficina. Registros locais legados permanecem no `localStorage`, na chave `giro-workshop-v1:<user.id>`, e não são compartilhados entre navegadores. O schema MySQL preparado está em `database/schema.sql`, mas ainda não é utilizado pelo backend atual.

Indicadores operacionais e contagens por status acompanham as OS. Indicadores mensais, metas, séries financeiras e manutenções anteriores são ilustrativos. A interface usa 15/09/2026 como dia de referência da apresentação; novas ações recebem a data do dispositivo.

Mensagens não são enviadas ao WhatsApp real; o acesso pela interface está desativado sem apagar a integração. Login, cadastro e recuperação usam a API de autenticação do backend. As novas OS são salvas em `data/service-orders.json`; reservas e estoque usam `data/inventory.json`, criado na primeira operação. Ordens locais legadas têm links `#/ordens/local-<id>` e não movimentam estoque. Os detalhes técnicos e a limitação de um único processo escritor por diretório estão em `docs/inventory.md`.

## Começar com estoque

1. Acesse Estoque e use Cadastrar item. Informe nome e unidade; categoria, mínimo e custo são opcionais. Somente o dono vê e edita custos. SKU não aparece na interface; valores já persistidos são preservados.
2. Para um item guardado na oficina, mantenha o controle de saldo e informe a Quantidade em estoque, por exemplo, 10 reparos, ou cadastre com zero. Uma quantidade positiva gera uma única Entrada com motivo Estoque inicial junto ao cadastro. Desmarcar o controle desabilita e zera a quantidade. Na edição, o saldo é somente leitura: use Entrada ou Saída para ajustes, sem sobrescrever consumo concorrente.
3. Dentro de uma OS do servidor, use Adicionar peça para reservar o saldo sem movimentação imediata. Itens não disponíveis ficam marcados como pendentes.
4. Ao marcar a OS como Pronto, o servidor confirma as reservas. O formulário legado de materiais permanece para registrar uso real.

Mecânicos registram materiais somente nas OS atribuídas a eles, sem acesso ao gerenciamento de estoque. Finalizar, entregar ou reabrir uma OS não gera outra baixa. OS encerradas permitem somente consulta de materiais.

## Acessibilidade e responsividade

- Sidebar recolhível no desktop, menu sobreposto e navegação inferior no celular.
- Kanban com rolagem horizontal; alternativa de mudança de etapa por teclado/toque.
- Botões ampliados no modo mecânico, rótulos nos campos e foco visível.
- Diálogos nativos com Escape, foco contido e restauração de foco.
- Feedback com região `aria-live`; respeito a `prefers-reduced-motion`.
- Fonte Inter com fallback local. Ícones e ilustração automotiva em SVG local.

## Verificação rápida

```sh
node --check app/app.js
node --check app/data.js
```

Para validar manualmente, crie uma Ordem de Serviço, adicione peça, item pendente e mão de obra, confira o resumo e a reserva em Meus Serviços. Marque Aguardando peças e depois Finalizado.

### Verificações realizadas nesta entrega

- Sintaxe de `app.js` e `data.js` validada com Node.
- Navegação de 19 rotas em Chromium automatizado, nas larguras 1440, 1024, 768 e 390 px.
- Nenhum erro JavaScript não tratado e nenhum transbordamento horizontal da página nessas verificações. Tabelas e Kanban mantêm sua rolagem interna intencional.
- Fluxos exercitados: busca, atualização dos três status, criação completa, persistência, atribuição, reservas e isolamento de mecânicos.
- No celular: menu, dados do atendimento, alteração de status com confirmação, upload/visualização de foto, configurações e restauração de dados.
- Revisão visual de capturas de dashboard, login, detalhes da OS, WhatsApp e relatórios.

Playwright foi executado a partir de ferramentas temporárias, sem adicionar dependências ao projeto.
