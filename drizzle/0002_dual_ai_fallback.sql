-- Add Groq + Ollama dual AI fallback configuration
ALTER TABLE `bot_config` ADD COLUMN `fallback_ai_enabled` boolean NOT NULL DEFAULT true;
ALTER TABLE `bot_config` ADD COLUMN `fallback_ai_model` varchar(100) NOT NULL DEFAULT 'mistral';
ALTER TABLE `bot_config` ADD COLUMN `fallback_ai_url` varchar(255) NOT NULL DEFAULT 'http://localhost:11434/v1';
ALTER TABLE `bot_config` ADD COLUMN `fallback_ai_key` text NOT NULL DEFAULT 'ollama';
ALTER TABLE `bot_config` ADD COLUMN `fallback_ai_timeout` int NOT NULL DEFAULT 5000;
ALTER TABLE `bot_config` ADD COLUMN `used_fallback_count` int NOT NULL DEFAULT 0;
ALTER TABLE `bot_config` ADD COLUMN `last_fallback_at` datetime;

-- Create index for tracking fallback usage
CREATE INDEX `idx_bot_config_fallback_usage` ON `bot_config` (`used_fallback_count`, `last_fallback_at`);
