-- Add AI model tracking columns to conversations table
ALTER TABLE `conversations` ADD COLUMN `model_used` varchar(50) DEFAULT 'groq';
ALTER TABLE `conversations` ADD COLUMN `used_fallback` boolean DEFAULT false NOT NULL;

-- Create index for tracking fallback usage in conversations
CREATE INDEX `idx_conversations_model_fallback` ON `conversations` (`model_used`, `used_fallback`, `created_at`);
