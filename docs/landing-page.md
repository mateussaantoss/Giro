# Landing pública — experiência cinematográfica GIRO

## Escopo

Somente a página `/`. A aplicação `/app/`, autenticação, backend, APIs e dados não foram modificados.

- `index.html`: narrativa, navegação, planos, FAQ e formulário público.
- `css/landing-cinematic.css`: folha independente exclusiva de `.giro-landing`, identidade ciano, breakpoints e movimento reduzido. A landing não carrega mais os estilos legados `css/styles.css`, evitando conflitos de posicionamento.
- `js/landing-cinematic.js`: cenas reversíveis, progressão de scroll, aproximação da interface e efeitos de ponteiro.
- `js/main.js`: comportamento original da landing; pequenos ajustes de acessibilidade e reativação do envio após “Enviar outra mensagem”. Não é carregado pelo aplicativo interno.
- `assets/images/landing-*.webp` e `landing-sources.md`: recursos locais e procedência.
- `assets/brand/`: nova logo e favicon fornecidos no ZIP do usuário. Marca ciano nas áreas escuras e versão escura nas claras; nenhum recurso de `/app/` foi substituído.
- `test/landing.test.js`: verificações da página e isolamento dos recursos.

## Tecnologia

HTML, CSS e JavaScript puro, servidos pelo Express já instalado. Sem dependências novas no projeto, sem build, GSAP, vídeo ou WebGL. O scroll nativo é o playhead; um `requestAnimationFrame` atualiza apenas cenas visíveis. Apenas a abertura tem um trecho sticky limitado, em telas com largura mínima de 900 px e altura mínima de 760 px. Todas as outras seções seguem o fluxo natural, sem pinning. Não há interceptação de wheel/touch, snap obrigatório ou rolagem artificial. ResizeObserver, resize, carregamento de fontes e pageshow recalculam a geometria.

O ciano `#5CCBFF` vem da nova marca fornecida. A landing não grava preferências de tema no localStorage nem interfere no tema interno. A direção combina fotografia e abertura de impacto inspiradas no Norris com foco único, tipografia mais limpa, contraste entre superfícies claras/escuras e aproximação contínua do produto inspirados na Apple. Não utiliza conteúdo ou recursos copiados desses sites.

## Executar

```powershell
npm.cmd install
npm.cmd start
```

Acesse http://localhost:3000/. Para desenvolvimento: `npm.cmd run dev`.

## Roteiro de revisão

1. Role a abertura: fotografia aproxima, título recua e a marca GIRO entra. Volte para reverter.
2. Em “A experiência”, confira a nova composição editorial clara. As três linhas permanecem legíveis e separadas em todas as posições do scroll; apenas os traços azuis acompanham a progressão. A órbita, os cards flutuantes e a troca de textos foram removidos.
3. Na apresentação do produto, veja uma única captura real, com título, explicação curta e recursos legíveis. A tela se aproxima suavemente conforme entra na janela e reverte ao retornar. Não há diagramas, capítulos, textos sobre a interface ou troca de telas. A referência adicional da Apple AirPods inspirou a hierarquia e o foco em um único elemento, sem copiar seus recursos.
4. Confira 1440, 1024, 768, 390, 375 e 320 px. Em tablets, celulares e janelas baixas não há seções retidas. A apresentação da plataforma usa fluxo natural em todos os tamanhos.
5. Ative a preferência de movimento reduzido no sistema ou nas ferramentas do navegador: não há pinning/zoom/parallax; todo o conteúdo continua disponível. A preferência pode mudar durante a sessão.
6. Teste menu mobile, Escape, Tab/Enter, links para `/app/` e `/app/#/login`, FAQ, cobrança mensal/anual, seleção de plano e preenchimento do formulário, inclusive estado/cidade.
7. O formulário mantém `POST /api/leads`, nomes dos campos e seleção do plano. Envio real de e-mail requer a configuração SMTP já existente. A consulta de municípios continua usando o IBGE.
8. No computador, mova o cursor: uma luz azul sutil acompanha o ponteiro. Botões, planos, perguntas e links recebem iluminação localizada; os botões principais têm atração leve e a composição do produto reage em perspectiva. O cursor padrão é preservado. Efeitos de ponteiro ficam desativados em toque e com movimento reduzido.

O link WhatsApp anterior foi preservado com seu destino original. **Ele já contém o número placeholder `5500000000000`**; é necessário fornecer o contato real antes de usá-lo em produção. Não foi inventado um número comercial.

## Validação

```powershell
node --check js/landing-cinematic.js
node --check js/main.js
node --test test/landing.test.js
npm.cmd test
```

Revisão em Chrome automatizado: animação de ida/volta, seis tamanhos de viewport, menu mobile/Escape, imagens locais, movimento reduzido, conteúdo sem JavaScript, planos, FAQ, validação do formulário, payload de lead, confirmação/reenvio e login original. O envio de lead foi interceptado apenas no navegador de testes para não disparar mensagens reais; SMTP não foi validado.

Na suíte anterior ao novo teste da landing: 33 passaram, 4 foram ignorados e 1 falhou em `test/ui-smoke.test.js:181`. Esse teste do painel busca `#new-order-form`, mas a aplicação interna atual renderiza `#quick-order-form`. Nenhum desses arquivos internos ou teste legado foi alterado para mascarar a divergência.

Na execução da suíte completa, incluindo os quatro testes novos da landing: **37 passaram, 4 foram ignorados e a mesma divergência do teste interno permaneceu**. Após o novo redesign com a marca enviada, a revisão automatizada no Chrome passou sem erros de console. Além dos fluxos já descritos, foi verificada a ausência de sobreposição entre as linhas editoriais em seis tamanhos de viewport e diferentes posições do scroll.
