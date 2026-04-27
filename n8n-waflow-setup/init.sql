-- WAFlow n8n Multi-Tenant Database Schema
-- MySQL 8.0+

USE waflow_n8n;

-- ============================================================================
-- USERS & AUTH
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  phone VARCHAR(20),
  role ENUM('admin', 'user') DEFAULT 'user',
  plan ENUM('free', 'starter', 'pro', 'enterprise') DEFAULT 'free',
  status ENUM('active', 'suspended', 'deleted') DEFAULT 'active',
  password_version INT DEFAULT 0,
  two_factor_enabled BOOLEAN DEFAULT false,
  subscription_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_email (email),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  refresh_token_hash VARCHAR(255) UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_user_id (user_id),
  KEY idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- BOT CONFIG (Multi-Tenant Settings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_config (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL UNIQUE,
  whatsapp_phone VARCHAR(20),
  whatsapp_connection_status ENUM('disconnected', 'connecting', 'connected', 'error') DEFAULT 'disconnected',
  whatsapp_session_token TEXT,
  whatsapp_api_type ENUM('wwjs', 'meta_api') DEFAULT 'wwjs',
  meta_api_phone_number_id VARCHAR(255),
  meta_api_business_account_id VARCHAR(255),
  meta_api_access_token VARCHAR(255),

  ai_provider ENUM('openai', 'groq', 'ollama', 'custom') DEFAULT 'groq',
  ai_api_url VARCHAR(255),
  ai_api_key VARCHAR(255),
  ai_model VARCHAR(100),
  ai_system_prompt TEXT,
  ai_temperature DECIMAL(3,2) DEFAULT 0.7,
  ai_max_tokens INT DEFAULT 500,

  business_hours_enabled BOOLEAN DEFAULT false,
  business_hours_start TIME,
  business_hours_end TIME,
  business_hours_timezone VARCHAR(50),
  after_hours_message TEXT,

  enable_menu_mode BOOLEAN DEFAULT false,
  menu_trigger VARCHAR(50),

  enable_bookings BOOLEAN DEFAULT false,
  enable_broadcast BOOLEAN DEFAULT false,
  enable_kb_search BOOLEAN DEFAULT true,

  rate_limit_per_phone INT DEFAULT 20,
  rate_limit_window_seconds INT DEFAULT 3600,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_tenant_id (tenant_id),
  KEY idx_whatsapp_status (whatsapp_connection_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- CUSTOMERS (CRM) — Must be created BEFORE conversations
-- ============================================================================

CREATE TABLE IF NOT EXISTS customers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  tags JSON,

  message_count INT DEFAULT 0,
  last_message_at DATETIME,
  opted_out BOOLEAN DEFAULT false,
  opted_out_at DATETIME,

  appointment_count INT DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0,

  birthday DATE,
  custom_fields JSON,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_tenant_phone (tenant_id, phone),
  KEY idx_tenant_id (tenant_id),
  KEY idx_opted_out (opted_out)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- CONVERSATIONS & MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  customer_id INT NOT NULL,
  phone VARCHAR(20) NOT NULL,
  direction ENUM('inbound', 'outbound') NOT NULL,
  message_type ENUM('text', 'image', 'document', 'audio', 'interactive') DEFAULT 'text',
  content TEXT,
  media_url VARCHAR(255),

  source ENUM('template', 'ai', 'agent', 'after_hours', 'broadcast') DEFAULT 'ai',
  response_time_ms INT,

  sentiment ENUM('positive', 'neutral', 'negative') DEFAULT 'neutral',
  confidence DECIMAL(3,2),

  template_id INT,
  ai_used BOOLEAN DEFAULT false,
  escalated BOOLEAN DEFAULT false,
  resolved BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  KEY idx_tenant_customer (tenant_id, customer_id),
  KEY idx_phone (phone),
  KEY idx_created_at (created_at),
  KEY idx_resolved (resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TEMPLATES (Auto-Reply Rules)
-- ============================================================================

CREATE TABLE IF NOT EXISTS templates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  trigger_keywords JSON NOT NULL,
  response_text TEXT NOT NULL,

  priority INT DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  match_type ENUM('exact', 'contains', 'starts_with') DEFAULT 'contains',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_tenant_id (tenant_id),
  KEY idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- KNOWLEDGE BASE (RAG Context)
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_base (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100),

  source_type ENUM('text', 'url', 'pdf') DEFAULT 'text',
  source_url VARCHAR(255),

  embedding_id VARCHAR(255),
  enabled BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_tenant_id (tenant_id),
  KEY idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- APPOINTMENTS & BOOKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  customer_id INT NOT NULL,
  phone VARCHAR(20) NOT NULL,

  service VARCHAR(255),
  staff_id INT,
  date DATE NOT NULL,
  time_start TIME NOT NULL,
  time_end TIME NOT NULL,
  duration_minutes INT,

  status ENUM('pending', 'confirmed', 'completed', 'cancelled', 'no-show') DEFAULT 'pending',
  notes TEXT,

  recurring BOOLEAN DEFAULT false,
  recurrence_pattern VARCHAR(100),

  confirmation_sent BOOLEAN DEFAULT false,
  reminder_sent BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  KEY idx_tenant_id (tenant_id),
  KEY idx_date (date),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  role VARCHAR(100),
  availability_json JSON,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- BROADCASTING
-- ============================================================================

CREATE TABLE IF NOT EXISTS broadcast_schedules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  message_template TEXT NOT NULL,

  recipient_filter JSON,
  scheduled_for DATETIME,
  status ENUM('draft', 'scheduled', 'sent', 'cancelled') DEFAULT 'draft',

  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_tenant_id (tenant_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS broadcast_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  broadcast_id INT NOT NULL,
  customer_id INT NOT NULL,
  phone VARCHAR(20),
  status ENUM('pending', 'sent', 'failed', 'blocked') DEFAULT 'pending',
  error_message VARCHAR(255),

  sent_at DATETIME,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (broadcast_id) REFERENCES broadcast_schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  KEY idx_tenant_id (tenant_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- WEBHOOKS & INTEGRATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(255) NOT NULL,
  event_type VARCHAR(100),
  secret_token VARCHAR(255),
  enabled BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_events (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  webhook_id INT NOT NULL,
  event_type VARCHAR(100),
  payload JSON,
  status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
  retry_count INT DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (webhook_id) REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  KEY idx_tenant_id (tenant_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- ANALYTICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_daily (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  date_recorded DATE NOT NULL,

  messages_received INT DEFAULT 0,
  messages_sent INT DEFAULT 0,
  conversations_resolved INT DEFAULT 0,
  ai_responses_generated INT DEFAULT 0,

  customers_new INT DEFAULT 0,
  opt_outs INT DEFAULT 0,

  appointments_booked INT DEFAULT 0,
  broadcast_sent INT DEFAULT 0,

  avg_response_time_ms INT DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_tenant_date (tenant_id, date_recorded),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  user_id INT,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id INT,
  details JSON,

  ip_address VARCHAR(45),
  user_agent VARCHAR(255),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_tenant_id (tenant_id),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- N8N INTEGRATION TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS n8n_workflows (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  workflow_id INT UNIQUE,
  workflow_name VARCHAR(255),
  purpose VARCHAR(255),
  enabled BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- SYSTEM SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT,
  setting_key VARCHAR(255) NOT NULL,
  setting_value TEXT,
  setting_type VARCHAR(50),

  UNIQUE KEY uk_tenant_key (tenant_id, setting_key),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- SEED DATA
-- ============================================================================

INSERT INTO users (id, email, password_hash, name, role, status) VALUES
(1, 'admin@waflow.local', '$2a$10$example_hash_here', 'Admin User', 'admin', 'active'),
(2, 'demo@waflow.local', '$2a$10$example_hash_here', 'Demo User', 'user', 'active');

INSERT INTO bot_config (tenant_id, ai_provider, ai_api_url, ai_model, ai_system_prompt) VALUES
(2, 'groq', 'https://api.groq.com/openai/v1', 'mixtral-8x7b-32768', 'You are a helpful WhatsApp customer service bot.');

INSERT INTO customers (tenant_id, phone, name) VALUES
(2, '1234567890', 'Sample Customer');

INSERT INTO templates (tenant_id, name, trigger_keywords, response_text, priority) VALUES
(2, 'Greeting', '["hello", "hi", "hey"]', 'Hello! Thanks for reaching out. How can I help you today?', 100);

INSERT INTO knowledge_base (tenant_id, title, content, category) VALUES
(2, 'Business Hours', 'We are open Monday-Friday 9AM-5PM EST', 'Hours');
