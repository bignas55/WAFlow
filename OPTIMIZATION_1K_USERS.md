# WAFlow Optimization for 1,000 Concurrent Users

## What Changed

### 1. Application Level
- **Worker Concurrency:** 200 → 500
- **DB Connection Pool:** 300 → 500
- **Node Memory:** Default → 4GB
- **Instances:** 1 → 3 (behind load balancer)

### 2. Database Level
- **MySQL Buffer Pool:** 2GB → 4GB
- **Max Connections:** 500 → 1,000
- **Query Cache:** Disabled → 256MB enabled
- **Temp Tables:** Optimized for large result sets
- **Flush Policy:** Safer (every transaction) → Faster (every second)

### 3. Redis Level
- **Memory:** 2GB → 4GB
- **Eviction Policy:** LRU (remove old keys)
- **Persistence:** Enabled (AOF)
- **TCP Backlog:** Increased for high concurrency

### 4. Load Balancing
- **Nginx:** 3 upstream servers
- **Algorithm:** Least connections (balances per-connection load)
- **Health Checks:** Automatic failover
- **Connection Reuse:** Keepalive enabled

### 5. Messaging Optimization
- **Message Queue:** Redis with optimized settings
- **Rate Limiting:**
  - Auth: 10 req/min per IP
  - API: 100 req/sec per IP
  - Webhooks: 1,000 req/sec per IP
- **WebSocket:** Direct proxy, no buffering

## Performance Expectations

| Metric | Before | After |
|--------|--------|-------|
| Concurrent Users | 50-100 | **1,000** |
| Messages/sec | 10-20 | **50-100** |
| API Requests/min | 6,000 | **600,000** |
| DB Connections | 300 | 500 |
| App Instances | 1 | 3 |
| Load Balancer | None | Nginx |

## How to Use

```bash
cd ~/Documents/v2
chmod +x setup-1k-users.sh
./setup-1k-users.sh
```

Access at: **http://localhost**

## Monitoring

Check app health:
```bash
docker compose -f docker-compose.1k-users.yml ps
```

View logs:
```bash
docker compose -f docker-compose.1k-users.yml logs -f waflow-1
docker compose -f docker-compose.1k-users.yml logs -f waflow-2
docker compose -f docker-compose.1k-users.yml logs -f waflow-3
```

Check Redis:
```bash
docker exec waflow-redis-1k redis-cli info memory
docker exec waflow-redis-1k redis-cli dbsize
```

Check MySQL:
```bash
docker exec waflow-mysql-1k mysql -uwaflow -pwaflowpassword -e "SHOW PROCESSLIST;"
```

## Next Steps for Higher Scale

For **10,000 users:**
- Add more app instances (5-10)
- Use MySQL cluster or RDS
- Use Redis cluster
- Add CDN for static assets
- Implement request caching

For **100,000+ users:**
- Kubernetes orchestration
- Database sharding
- Message queue (Kafka/RabbitMQ)
- Microservices architecture
- Global load balancing
