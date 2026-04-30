#!/bin/bash

# WAFlow Database Backup Script
# Automatically backs up MySQL database daily
# Add to crontab: 0 2 * * * /path/to/backup-database.sh

set -e

# Configuration
DB_USER="waflow"
DB_PASSWORD="waflowpassword"
DB_NAME="waflow"
DB_HOST="localhost"
BACKUP_DIR="/Users/nathi/Documents/v2/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/waflow_backup_$TIMESTAMP.sql"
LOG_FILE="$BACKUP_DIR/backup.log"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Function to log messages
log_msg() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_msg "🔄 Starting database backup..."

# Check if MySQL is running
if ! command -v mysqldump &> /dev/null; then
    log_msg "❌ mysqldump not found. Please install MySQL client."
    exit 1
fi

# Perform backup with error handling
if mysqldump \
    -h "$DB_HOST" \
    -u "$DB_USER" \
    -p"$DB_PASSWORD" \
    --single-transaction \
    --quick \
    --lock-tables=false \
    "$DB_NAME" > "$BACKUP_FILE" 2>>"$LOG_FILE"; then

    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log_msg "✅ Backup completed successfully: $BACKUP_FILE ($BACKUP_SIZE)"

    # Compress backup (optional - saves space)
    # gzip "$BACKUP_FILE"
    # log_msg "✅ Backup compressed to $BACKUP_FILE.gz"

else
    log_msg "❌ Backup failed. Check $LOG_FILE for details."
    exit 1
fi

# Clean up old backups (keep last 7 days)
log_msg "🧹 Cleaning up old backups..."
DELETED_COUNT=0
while IFS= read -r old_file; do
    rm -f "$old_file"
    log_msg "🗑️  Deleted old backup: $(basename $old_file)"
    ((DELETED_COUNT++))
done < <(find "$BACKUP_DIR" -name "waflow_backup_*.sql" -mtime +7)

if [ $DELETED_COUNT -eq 0 ]; then
    log_msg "ℹ️  No old backups to delete (keeping last 7 days)"
else
    log_msg "✅ Deleted $DELETED_COUNT old backup(s)"
fi

# Summary
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "waflow_backup_*.sql" | wc -l)
log_msg "📊 Total backups on disk: $TOTAL_BACKUPS"
log_msg "✨ Backup script completed successfully"
