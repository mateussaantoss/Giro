-- Cria o catálogo de serviços em bancos GIRO já existentes.
-- Seguro para executar mais de uma vez.
USE giro;

CREATE TABLE IF NOT EXISTS service_templates (
  id CHAR(36) PRIMARY KEY,
  workshop_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  default_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_service_template_workshop_name (workshop_id,name),
  KEY ix_service_templates_workshop_active (workshop_id,active),
  CONSTRAINT fk_service_templates_workshop FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
) ENGINE=InnoDB;
