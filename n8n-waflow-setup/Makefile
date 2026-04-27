.PHONY: help setup start stop restart logs logs-mysql logs-n8n test db-shell db-backup db-restore clean

help:
	@echo "WAFlow n8n Multi-Tenant SaaS — Available Commands"
	@echo ""
	@echo "Setup & Start:"
	@echo "  make setup          Start everything (Docker + DB init)"
	@echo "  make start          Start containers (if already initialized)"
	@echo "  make stop           Stop all containers"
	@echo "  make restart        Restart containers"
	@echo ""
	@echo "Logs & Monitoring:"
	@echo "  make logs           Show all logs (follow mode)"
	@echo "  make logs-n8n       Show n8n logs"
	@echo "  make logs-mysql     Show MySQL logs"
	@echo ""
	@echo "Testing:"
	@echo "  make test           Run webhook tests"
	@echo "  make db-shell       Connect to MySQL shell"
	@echo ""
	@echo "Database:"
	@echo "  make db-backup      Backup database to backup.sql"
	@echo "  make db-restore     Restore from backup.sql"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean          Stop and remove all containers"
	@echo "  make clean-all      Also remove volumes (wipes data!)"

setup:
	@echo "🚀 Starting WAFlow n8n Setup..."
	@chmod +x quickstart.sh
	@./quickstart.sh

start:
	@echo "▶️  Starting containers..."
	@docker-compose up -d
	@sleep 5
	@docker-compose ps

stop:
	@echo "⏹️  Stopping containers..."
	@docker-compose stop
	@docker-compose ps

restart:
	@echo "🔄 Restarting containers..."
	@docker-compose restart
	@sleep 5
	@docker-compose ps

logs:
	@docker-compose logs -f --tail 50

logs-n8n:
	@docker-compose logs -f n8n --tail 100

logs-mysql:
	@docker-compose logs -f mysql --tail 100

test:
	@echo "🧪 Running webhook tests..."
	@chmod +x test-webhook.sh
	@./test-webhook.sh

db-shell:
	@echo "🗄️  Connecting to MySQL..."
	@docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n

db-backup:
	@echo "💾 Backing up database..."
	@docker-compose exec mysql mysqldump -u waflow -pwaflow123 waflow_n8n > backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "✓ Backup created"

db-restore:
	@echo "📥 Restoring from backup..."
	@docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n < backup.sql
	@echo "✓ Restore complete"

clean:
	@echo "🗑️  Stopping and removing containers..."
	@docker-compose down
	@echo "✓ Containers removed (volumes preserved)"

clean-all:
	@echo "⚠️  WARNING: This will delete ALL data!"
	@read -p "Type 'yes' to confirm: " confirm && [ "$$confirm" = "yes" ] && docker-compose down -v
	@echo "✓ All containers and volumes removed"

status:
	@docker-compose ps

ps:
	@docker-compose ps

env:
	@echo "Checking .env file..."
	@[ -f .env ] && echo "✓ .env file found" || (echo "❌ .env not found, creating from template..." && cp .env.template .env && echo "✓ Created .env from template")

version:
	@echo "WAFlow n8n Multi-Tenant SaaS v1.0.0"
	@echo "Docker Compose: $$(docker-compose --version)"
	@echo "Docker: $$(docker --version)"
