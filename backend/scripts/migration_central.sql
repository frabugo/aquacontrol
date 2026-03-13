-- migration_central.sql — Base de datos central para multi-tenant
CREATE DATABASE IF NOT EXISTS aquacontrol_central;
USE aquacontrol_central;

CREATE TABLE IF NOT EXISTS tenants (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  nombre_empresa VARCHAR(200) NOT NULL,
  subdominio     VARCHAR(50) NOT NULL UNIQUE,
  database_name  VARCHAR(100) NOT NULL UNIQUE,
  activo         TINYINT(1) NOT NULL DEFAULT 1,
  plan           VARCHAR(50) NOT NULL DEFAULT 'basico',
  max_usuarios   INT NOT NULL DEFAULT 5,
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_subdominio (subdominio)
);

CREATE TABLE IF NOT EXISTS tenant_modulos (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  modulo    VARCHAR(50) NOT NULL,
  UNIQUE KEY uk_tenant_modulo (tenant_id, modulo),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Registrar la BD actual como tenant por defecto
INSERT IGNORE INTO tenants (nombre_empresa, subdominio, database_name, activo, plan, max_usuarios)
VALUES ('AquaControl Principal', 'default', 'aquacontrol', 1, 'enterprise', 999);
