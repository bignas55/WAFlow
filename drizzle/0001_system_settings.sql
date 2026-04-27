-- Add system_settings table for global AI model overrides
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `key` varchar(100) NOT NULL UNIQUE,
  `global_ai_model` varchar(100) NOT NULL DEFAULT '',
  `global_ai_api_url` varchar(255) NOT NULL DEFAULT '',
  `global_ai_api_key` text NOT NULL DEFAULT '',
  `global_ai_temperature` decimal(3,2) NOT NULL DEFAULT '0.70',
  `last_updated_by` int,
  `last_updated_at` datetime,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
