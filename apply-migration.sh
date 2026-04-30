#!/bin/bash
set -e

echo "🚀 Applying database migration: Add missing indexes..."

# Load environment variables from .env
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set. Please configure your .env file."
  exit 1
fi

# Parse DATABASE_URL to extract connection details
# Expected format: mysql://user:password@host:port/database
if [[ $DATABASE_URL =~ mysql://([^:]+):([^@]+)@([^:]+):([^/]+)/(.+)$ ]]; then
  MYSQL_USER="${BASH_REMATCH[1]}"
  MYSQL_PASS="${BASH_REMATCH[2]}"
  MYSQL_HOST="${BASH_REMATCH[3]}"
  MYSQL_PORT="${BASH_REMATCH[4]}"
  MYSQL_DB="${BASH_REMATCH[5]}"
else
  echo "❌ Invalid DATABASE_URL format. Expected: mysql://user:password@host:port/database"
  exit 1
fi

echo "📍 Connecting to database: $MYSQL_HOST:$MYSQL_PORT/$MYSQL_DB"

# Create a temporary file with the SQL commands
TEMP_SQL=$(mktemp)
cat > "$TEMP_SQL" << 'SQL_COMMANDS'
-- Task #23: Add missing indexes for database optimization

-- Users table indexes
CREATE INDEX `idx_users_email_verified` ON `users` (`email_verified`);
CREATE INDEX `idx_users_account_status` ON `users` (`account_status`);
CREATE INDEX `idx_users_is_active` ON `users` (`is_active`);
CREATE INDEX `idx_users_created_at` ON `users` (`created_at`);

-- BotConfig table indexes
CREATE INDEX `idx_bot_config_tenant_onboarding` ON `bot_config` (`tenant_id`, `onboarding_completed`);
CREATE INDEX `idx_bot_config_tenant_status` ON `bot_config` (`tenant_id`, `account_status`);

-- Conversations table indexes (in addition to existing)
CREATE INDEX `idx_conv_tenant` ON `conversations` (`tenant_id`);
CREATE INDEX `idx_conv_tenant_source` ON `conversations` (`tenant_id`, `source`);
CREATE INDEX `idx_conv_tenant_resolved` ON `conversations` (`tenant_id`, `resolved`);

-- Appointments table indexes
CREATE INDEX `idx_apt_tenant_date` ON `appointments` (`tenant_id`, `date`);
CREATE INDEX `idx_apt_tenant_status` ON `appointments` (`tenant_id`, `status`);
CREATE INDEX `idx_apt_customer_tenant` ON `appointments` (`customer_id`, `tenant_id`);
CREATE INDEX `idx_apt_tenant_date_status` ON `appointments` (`tenant_id`, `date`, `status`);

-- ConversationAssignments table indexes
CREATE INDEX `idx_conv_assign_conv` ON `conversation_assignments` (`conversation_id`);
CREATE INDEX `idx_conv_assign_agent` ON `conversation_assignments` (`tenant_id`, `agent_id`);
CREATE INDEX `idx_conv_assign_status` ON `conversation_assignments` (`tenant_id`, `status`);
CREATE INDEX `idx_conv_assign_tenant` ON `conversation_assignments` (`tenant_id`);
SQL_COMMANDS

# Execute the migration
mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASS" "$MYSQL_DB" < "$TEMP_SQL"

# Clean up
rm "$TEMP_SQL"

echo "✅ Migration applied successfully!"
echo ""
echo "📊 To verify indexes were created, run:"
echo "   SHOW INDEX FROM users;"
echo "   SHOW INDEX FROM conversations;"
echo "   SHOW INDEX FROM appointments;"
