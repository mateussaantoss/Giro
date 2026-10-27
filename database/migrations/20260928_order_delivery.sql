-- Encerramento preserva a OS e permite consultar quem/quando entregou.
ALTER TABLE service_orders DROP CHECK ck_orders_status;

ALTER TABLE service_orders
  ADD COLUMN status_before_close TINYINT UNSIGNED NULL AFTER status,
  ADD COLUMN closed_at DATETIME(3) NULL AFTER finished_at,
  ADD COLUMN closed_by CHAR(36) NULL AFTER closed_at,
  ADD KEY ix_orders_workshop_closed (workshop_id, closed_at),
  ADD CONSTRAINT fk_orders_closed_by FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE service_orders
  ADD CONSTRAINT ck_orders_status CHECK (status BETWEEN 0 AND 3);
