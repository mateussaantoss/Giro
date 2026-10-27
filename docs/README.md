# Catálogo de serviços

O catálogo é separado por oficina. OWNER e MANAGER podem criar, editar e ativar/desativar serviços em **Configurações > Serviços**.

Ao criar uma OS, um serviço ativo pode preencher a descrição e o preço inicial da mão de obra. O preço pode ser ajustado antes de salvar. A OS armazena um snapshot em `laborItems` (`templateId`, `description`, `value` e, quando informado, `assignedUserId`), portanto alterações futuras no catálogo não alteram ordens antigas.

No modo JSON, os registros ficam em `data/service-templates.json`. Em MySQL, ficam na tabela `service_templates`; a migração JSON importa o arquivo quando ele existir.
