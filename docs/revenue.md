# Relatório de receita

`GET /api/reports/revenue?from=ISO&to=ISO&assignedUserId=opcional` exige autenticação e a permissão `reports.view`. Apenas OWNER e MANAGER possuem essa permissão. O intervalo é semiaberto: `from` é incluído e `to` é excluído. Sem parâmetros, o período é o mês atual no fuso local do servidor.

O relatório considera receita realizada somente para ordens entregues com `closedAt` dentro do período. Cancelamentos usam `cancelledAt` e nunca entram na receita. O total usa o `estimatedValue` positivo salvo no fechamento; quando não existe, usa `max(0, soma dos itens de mão de obra - desconto)`. `grossParts` é sempre `0` porque o sistema ainda não possui preço de venda de materiais.

O endpoint `.csv` (`/api/reports/revenue.csv`) exporta as ordens do mesmo relatório. Os valores são escapados contra fórmulas de planilhas.

O JSON retorna `period`, `summary`, `byPeriod`, `byStatus`, `byMechanic` e `orders`. `byPeriod.date` usa UTC no formato `YYYY-MM-DD`; `period.dateField` é `closedAt`. O escopo sempre é a oficina do usuário autenticado, com filtro opcional pelo mecânico atribuído.
