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
- `data.js`: dados brasileiros fictícios e fábrica de estado inicial.
- `app.js`: componentes compartilhados, renderização, roteador por hash, eventos e persistência.
- `mark.svg`: marca vetorial GIRO.

O painel usa rotas por hash; links diretos e recarregamento funcionam com o servidor estático existente.

## Rotas

| Rota | Tela |
| --- | --- |
| `#/dashboard` | Visão geral, indicadores, pátio e atividade |
| `#/patio` | Pátio com sete etapas e visualização de lista |
| `#/servicos` | Meu trabalho, modo mecânico |
| `#/servicos/1048` | Serviço específico no modo mecânico |
| `#/ordens` | Tabela de ordens |
| `#/ordens/1048` | Detalhes da ordem |
| `#/clientes` e `#/clientes/1` | Clientes e relacionamento |
| `#/veiculos` e `#/veiculos/1` | Veículos e prontuário |
| `#/whatsapp` | Central de atendimento demonstrativa |
| `#/historico` | Movimentações da oficina |
| `#/equipe` | Equipe e serviços atribuídos |
| `#/relatorios` | Gestão, gráficos e exportação |
| `#/configuracoes` | Oficina, notificações, integrações e restauração |
| `#/ajuda` | Instruções da experiência |
| `#/login`, `#/cadastro`, `#/recuperar` | Acesso e onboarding |

## Fluxos implementados

- Criar OS com veículo, cliente vinculado, responsável, prioridade, valor e previsão.
- Arrastar cards entre etapas no desktop ou alterar status pelo diálogo em qualquer dispositivo.
- Buscar por placa, OS, modelo e cliente; filtrar por responsável, status e prioridade.
- Iniciar, pausar e retomar serviço; conclusão pelo mecânico envia à inspeção final.
- Finalização da OS exige confirmação e libera o veículo como Pronto.
- Registrar diagnóstico, observação, problema, peças, serviços adicionais e fotos.
- Fotos JPG/PNG/WebP de até 2 MB são redimensionadas para armazenamento local.
- Cadastrar clientes, veículos e membros da equipe; atualizar quilometragem.
- Usar dados de uma conversa para preencher uma nova OS; simular envio de mensagens.
- Exportar ordens filtradas e relatório em CSV compatível com planilhas.
- Editar oficina, preferências e restaurar demonstração com confirmação.
- Cadastro progressivo em quatro etapas, sem armazenar senha.

## Dados e limites da demonstração

O estado operacional do painel é persistido no `localStorage`, chave `giro-demo-v2`. Não há sincronização entre navegadores. Em Configurações → Demonstração é possível restaurar todos os dados fictícios.

Indicadores operacionais e contagens por status acompanham as OS. Indicadores mensais, metas, séries financeiras e manutenções anteriores são ilustrativos. A interface usa 15/09/2026 como dia de referência da apresentação; novas ações recebem a data do dispositivo.

Mensagens não são enviadas ao WhatsApp real. Login, cadastro e recuperação usam a API de autenticação do backend atual. Para produção completa, ainda é necessário conectar autorização por perfil, API de ordens, banco de dados transacional, armazenamento de fotos e WhatsApp Business no servidor. As APIs da landing page existentes não são usadas como backend do painel.

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

Para validar manualmente, crie uma OS, mova-a no pátio, abra no modo mecânico, pause/retome, adicione uma observação e finalize. Recarregue a página para conferir persistência. Repita a mudança de status em viewport de celular e teste o fluxo WhatsApp → Nova OS.

### Verificações realizadas nesta entrega

- Sintaxe de `app.js` e `data.js` validada com Node.
- Navegação de 19 rotas em Chromium automatizado, nas larguras 1440, 1024, 768 e 390 px.
- Nenhum erro JavaScript não tratado e nenhum transbordamento horizontal da página nessas verificações. Tabelas e Kanban mantêm sua rolagem interna intencional.
- Fluxos exercitados: busca, drag-and-drop, persistência após recarregar, nova OS, observações, atualização do orçamento, início/pausa/retomada/finalização, mensagens, conversa para OS, filtro por membro da equipe, novo cliente, login e cadastro em quatro etapas.
- No celular: menu, dados do atendimento, alteração de status com confirmação, upload/visualização de foto, configurações e restauração de dados.
- Revisão visual de capturas de dashboard, login, detalhes da OS, WhatsApp e relatórios.

Playwright foi executado a partir de ferramentas temporárias, sem adicionar dependências ao projeto.
