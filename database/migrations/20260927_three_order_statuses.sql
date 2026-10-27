-- Mapeia os status antigos sem excluir OS nem eventos de histórico.
-- 0 Entrada, 1 Aguardando peças, 2 Pronto.
ALTER TABLE service_orders DROP CHECK ck_orders_status;

UPDATE service_orders
SET status = CASE
  WHEN status = 3 THEN 1
  WHEN status = 6 THEN 2
  ELSE 0
END;

UPDATE order_status_history
SET old_status = CASE
  WHEN old_status = 3 THEN 1
  WHEN old_status = 6 THEN 2
  WHEN old_status IS NULL THEN NULL
  ELSE 0
END,
new_status = CASE
  WHEN new_status = 3 THEN 1
  WHEN new_status = 6 THEN 2
  ELSE 0
END;

ALTER TABLE service_orders
  ADD CONSTRAINT ck_orders_status CHECK (status BETWEEN 0 AND 2);
