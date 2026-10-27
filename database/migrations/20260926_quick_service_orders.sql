-- Permite uma OS começar sem cliente ou veículo e receber os dados depois.
-- Executar uma única vez em bases MySQL que já tenham service_orders.
ALTER TABLE service_orders
  MODIFY COLUMN vehicle_id BIGINT UNSIGNED NULL,
  MODIFY COLUMN service VARCHAR(160) NULL,
  MODIFY COLUMN issue TEXT NULL,
  ADD COLUMN client_id BIGINT UNSIGNED NULL AFTER workshop_id,
  ADD COLUMN client_name VARCHAR(120) NULL AFTER assigned_user_id,
  ADD COLUMN client_phone VARCHAR(30) NULL AFTER client_name,
  ADD COLUMN vehicle_brand VARCHAR(60) NULL AFTER client_phone,
  ADD COLUMN vehicle_model VARCHAR(120) NULL AFTER vehicle_brand,
  ADD COLUMN plate VARCHAR(10) NULL AFTER vehicle_model,
  ADD KEY ix_orders_client (client_id),
  ADD CONSTRAINT fk_orders_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
