-- ============================================================
--  AirDnC – Database Schema
--  Database : rpa_area_finance_internal_P
--  Schema   : tech_solutions
-- ============================================================
--
--  ⚠  NÃO armazene credenciais neste arquivo.
--     Use variáveis de ambiente ou Azure Key Vault.
--
--  Parâmetros de conexão devem ser definidos em variáveis:
--     DB_HOST  =  sql-latam.straumann.com
--     DB_NAME  =  (configurar via ambiente)
--     DB_USER  =  (configurar via ambiente)
--     DB_PASS  =  (configurar via ambiente — NUNCA em código)
-- ============================================================

USE [rpa_area_finance_internal_P];
GO

-- ============================================================
--  TABLE: tech_solutions.tb_users
--  Usuários validados via Teams / Power Automate
-- ============================================================
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'tb_users' AND schema_id = SCHEMA_ID('tech_solutions')
)
BEGIN
  CREATE TABLE tech_solutions.tb_users (
    id             INT           IDENTITY(1,1) PRIMARY KEY,
    email          NVARCHAR(256) NOT NULL UNIQUE,
    display_name   NVARCHAR(256) NOT NULL,
    department     NVARCHAR(128) NULL,
    is_admin       BIT           NOT NULL DEFAULT 0,
    is_active      BIT           NOT NULL DEFAULT 1,
    created_at     DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    last_login_at  DATETIME2     NULL,
    updated_at     DATETIME2     NOT NULL DEFAULT GETUTCDATE()
  );
  CREATE INDEX idx_users_email ON tech_solutions.tb_users (email);
  PRINT 'Created tech_solutions.tb_users';
END
GO

-- ============================================================
--  TABLE: tech_solutions.tb_bookings
--  Todas as reservas de mesas (histórico completo)
-- ============================================================
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'tb_bookings' AND schema_id = SCHEMA_ID('tech_solutions')
)
BEGIN
  CREATE TABLE tech_solutions.tb_bookings (
    id               BIGINT        IDENTITY(1,1) PRIMARY KEY,
    desk_id          INT           NOT NULL,
    desk_label       NVARCHAR(64)  NOT NULL,
    booking_date     DATE          NOT NULL,
    booked_by_email  NVARCHAR(256) NOT NULL,
    booked_by_name   NVARCHAR(256) NOT NULL,
    booked_by_dept   NVARCHAR(128) NULL,
    team_owner       NVARCHAR(128) NULL,
    status           NVARCHAR(32)  NOT NULL DEFAULT 'reserved'
                       CONSTRAINT chk_booking_status
                       CHECK (status IN ('reserved','active','cancelled','completed','no_show')),
    notes            NVARCHAR(512) NULL,
    created_at       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    updated_at       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    cancelled_at     DATETIME2     NULL,
    cancelled_by     NVARCHAR(256) NULL
  );
  CREATE INDEX idx_bookings_desk_date ON tech_solutions.tb_bookings (desk_id, booking_date);
  CREATE INDEX idx_bookings_user      ON tech_solutions.tb_bookings (booked_by_email, booking_date);
  CREATE INDEX idx_bookings_date      ON tech_solutions.tb_bookings (booking_date);
  PRINT 'Created tech_solutions.tb_bookings';
END
GO

-- ============================================================
--  TABLE: tech_solutions.tb_login_logs
--  Trilha de auditoria de login / logout
-- ============================================================
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'tb_login_logs' AND schema_id = SCHEMA_ID('tech_solutions')
)
BEGIN
  CREATE TABLE tech_solutions.tb_login_logs (
    id           BIGINT        IDENTITY(1,1) PRIMARY KEY,
    email        NVARCHAR(256) NULL,
    user_name    NVARCHAR(256) NULL,
    event_type   NVARCHAR(32)  NOT NULL
                   CONSTRAINT chk_login_event
                   CHECK (event_type IN ('login','logout','login_fail','session_expire')),
    status       NVARCHAR(16)  NOT NULL
                   CONSTRAINT chk_login_status
                   CHECK (status IN ('success','fail')),
    error_msg    NVARCHAR(512) NULL,
    user_agent   NVARCHAR(512) NULL,
    created_at   DATETIME2     NOT NULL DEFAULT GETUTCDATE()
  );
  CREATE INDEX idx_login_email_time ON tech_solutions.tb_login_logs (email, created_at);
  PRINT 'Created tech_solutions.tb_login_logs';
END
GO

-- ============================================================
--  TABLE: tech_solutions.tb_desk_audit
--  Log de alterações nas configurações das mesas
-- ============================================================
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'tb_desk_audit' AND schema_id = SCHEMA_ID('tech_solutions')
)
BEGIN
  CREATE TABLE tech_solutions.tb_desk_audit (
    id                BIGINT        IDENTITY(1,1) PRIMARY KEY,
    desk_id           INT           NOT NULL,
    desk_label        NVARCHAR(64)  NOT NULL,
    changed_by_email  NVARCHAR(256) NOT NULL,
    changed_by_name   NVARCHAR(256) NOT NULL,
    change_type       NVARCHAR(64)  NOT NULL
                        CONSTRAINT chk_desk_change_type
                        CHECK (change_type IN (
                          'edit_info','set_availability','clear_availability',
                          'edit_equipment','admin_override'
                        )),
    old_value         NVARCHAR(MAX) NULL,  -- snapshot JSON antes da mudança
    new_value         NVARCHAR(MAX) NULL,  -- snapshot JSON depois da mudança
    created_at        DATETIME2     NOT NULL DEFAULT GETUTCDATE()
  );
  CREATE INDEX idx_desk_audit_desk ON tech_solutions.tb_desk_audit (desk_id, created_at);
  CREATE INDEX idx_desk_audit_user ON tech_solutions.tb_desk_audit (changed_by_email);
  PRINT 'Created tech_solutions.tb_desk_audit';
END
GO

-- ============================================================
--  VIEW: tech_solutions.vw_daily_occupancy
--  Relatório de ocupação diária
-- ============================================================
IF NOT EXISTS (
  SELECT 1 FROM sys.views
  WHERE name = 'vw_daily_occupancy' AND schema_id = SCHEMA_ID('tech_solutions')
)
BEGIN
  EXEC('
    CREATE VIEW tech_solutions.vw_daily_occupancy AS
    SELECT
      booking_date,
      desk_id,
      desk_label,
      team_owner,
      booked_by_name,
      booked_by_dept,
      status,
      created_at
    FROM tech_solutions.tb_bookings
    WHERE status IN (''reserved'',''active'',''completed'')
  ');
  PRINT 'Created tech_solutions.vw_daily_occupancy';
END
GO

PRINT 'AirDnC schema setup complete.';
GO
