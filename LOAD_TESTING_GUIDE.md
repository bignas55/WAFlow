# WAFlow Load Testing Guide

## Objective

Verify that WAFlow can handle 1000 concurrent users with instant message responses and <2 second latency without crashes or database exhaustion.

---

## Prerequisites

- All 3 instances running and healthy
- MySQL and Redis ready
- Load testing tool installed (Apache Bench, wrk, or k6)
- Baseline metrics documented

---

## Test 1: Connection Pool Saturation

**Goal:** Verify database connections don't get exhausted under load

### Setup

```bash
# Monitor active connections in real-time
watch -n 1 'mysql -h localhost -u waflow -p waflow -e "SHOW STATUS LIKE \"Threads_connected\";"'
```

### Execute

```bash
# Simulate 500 concurrent connections
ab -n 5000 -c 500 http://localhost/api/trpc/auth.me

# Expected:
# - Requests per second: 200-300
# - Failed requests: 0
# - Latency p99: <500ms
# - Database connections: <400 per instance (max 500)
```

### Success Criteria

- ✅ All requests succeed
- ✅ No "Connection refused" errors
- ✅ No "Max connection pool reached" errors
- ✅ Database connections < 450 per instance

---

## Test 2: Message Processing Throughput

**Goal:** Verify message processing handles sustained load

### Setup

Create test messages file:

```bash
cat > messages.json << 'EOF'
{
  "messages": [
    {"phone": "27791234567", "text": "Hello"},
    {"phone": "27792345678", "text": "How are you?"},
    {"phone": "27793456789", "text": "What time is it?"},
    {"phone": "27794567890", "text": "Tell me a joke"},
    {"phone": "27795678901", "text": "What's the weather?"}
  ]
}
EOF
```

### Execute Using wrk

```bash
# Install wrk if needed
brew install wrk  # macOS
sudo apt install wrk  # Linux

# Create Lua script for simulating messages
cat > load_test.lua << 'WRKLUA'
request = function()
  wrk.method = "POST"
  wrk.headers["Content-Type"] = "application/json"
  wrk.body = '{"tenantId":1,"phoneNumber":"27791234567","messageText":"Hello","contactName":"Test"}'
  return wrk.format(nil)
end
WRKLUA

# Run 10 minute test with 100 concurrent connections
wrk -t 4 -c 100 -d 10m -s load_test.lua http://localhost/api/whatsapp/webhook

# Expected output:
# Running 10m test @ http://localhost/api/whatsapp/webhook
# 4 threads, 100 connections
# Requests/sec: 100-150 (depending on AI response time)
# Latency avg: 1-2s
# Latency p99: 2-5s
```

### Success Criteria

- ✅ Sustained request rate > 100 msg/sec for AI responses
- ✅ Sustained request rate > 300 msg/sec for template matches (cached)
- ✅ No timeout errors
- ✅ Error rate < 0.1%

---

## Test 3: Redis Memory Management

**Goal:** Verify Redis doesn't run out of memory and evicts properly

### Setup

```bash
# Monitor Redis memory in real-time
watch -n 1 'redis-cli INFO memory | grep -E "used_memory|used_memory_peak|mem_fragmentation"'

# Get baseline
redis-cli DBSIZE  # Should show key count
```

### Execute

```bash
# Send 100,000 cache operations
for i in {1..100000}; do
  redis-cli SET "cache:tenant:$((i % 100)):$((i % 10))" "test_data_$i"
  if [ $((i % 1000)) -eq 0 ]; then
    echo "Sent $i keys"
  fi
done

# Monitor eviction
redis-cli INFO stats | grep -E "evicted_keys|evicted_clients"
```

### Success Criteria

- ✅ Memory usage stays < 3.5GB
- ✅ No "OOM command not allowed" errors
- ✅ LRU eviction working (old keys removed, new keys added)
- ✅ Cache hits still > 70%

---

## Test 4: Concurrent User Simulation

**Goal:** Simulate 1000 real users connecting simultaneously

### Setup

Create user simulation script:

```bash
cat > simulate_users.sh << 'SIMSCRIPT'
#!/bin/bash
# Simulate N concurrent users making requests

CONCURRENT_USERS=1000
DURATION=300  # 5 minutes

echo "Simulating $CONCURRENT_USERS concurrent users for ${DURATION}s..."

for i in $(seq 1 $CONCURRENT_USERS); do
  (
    for j in {1..10}; do
      curl -s "http://localhost/api/trpc/botConfig.get?tenantId=$i" > /dev/null
      sleep $((RANDOM % 5))
    done
  ) &
  
  if [ $((i % 100)) -eq 0 ]; then
    echo "Started $i users..."
  fi
done

wait
echo "All users completed"
SIMSCRIPT

chmod +x simulate_users.sh
```

### Execute

```bash
# Start the simulation
./simulate_users.sh

# Monitor in separate terminal
./scripts/health-check.sh

# Check logs for errors
docker-compose logs waflow-1 | grep "❌"
```

### Success Criteria

- ✅ All 1000 user requests complete successfully
- ✅ No connection refused errors
- ✅ No timeout errors
- ✅ Average response time < 500ms (for cached endpoints)

---

## Test 5: Failover Under Load

**Goal:** Verify system handles instance failure gracefully

### Setup

```bash
# Start baseline traffic
ab -n 10000 -c 100 http://localhost/api/trpc/auth.me &

# Get baseline response time
curl -w "Time: %{time_total}s\n" http://localhost
```

### Execute

```bash
# Stop one instance while traffic is running
docker-compose -f docker-compose.1k-users.yml stop waflow-1

# Monitor Nginx failover (should redirect to waflow-2/3)
watch -n 0.5 'curl -s http://localhost/health'

# Check for increased latency but no 502 errors
ab -n 1000 -c 50 http://localhost/api/trpc/auth.me

# Restart the instance
docker-compose -f docker-compose.1k-users.yml start waflow-1

# Verify it rejoins the pool
sleep 10
./scripts/health-check.sh
```

### Success Criteria

- ✅ Nginx failover is automatic (no 502 errors)
- ✅ Requests redirect to healthy instances
- ✅ Failed instance recovers and rejoins pool
- ✅ No data loss during failover
- ✅ Response times increase slightly but remain acceptable

---

## Test 6: Cache Hit Rate Under Load

**Goal:** Verify caching reduces database load by 70-80%

### Setup

```bash
# Start fresh with empty logs
docker-compose logs -f waflow-1 &
LOG_PID=$!

# Log baseline (first request, all cache misses)
curl "http://localhost/api/trpc/botConfig.get?tenantId=1"
```

### Execute

```bash
# Make 1000 identical requests (should all hit cache after first)
for i in {1..1000}; do
  curl -s "http://localhost/api/trpc/botConfig.get?tenantId=1" > /dev/null
done

# Count cache hits vs misses in logs
sleep 2
docker-compose logs waflow-1 | grep -c "⚡ Cache HIT"  # Should be ~999
docker-compose logs waflow-1 | grep -c "🔄 Cache MISS"  # Should be ~1
```

### Success Criteria

- ✅ Cache hit rate > 95% for repeated queries
- ✅ Cache hit rate > 70% overall (across different tenants)
- ✅ Database queries reduced by 70-80%
- ✅ Response time: first request 100-200ms, subsequent <1ms

---

## Test 7: Rate Limiter Effectiveness

**Goal:** Verify rate limiters prevent abuse

### Execute

```bash
# Test auth rate limiter (10 requests per 15 minutes)
for i in {1..20}; do
  curl -s -X POST http://localhost/api/trpc/auth.login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}' \
    | grep -q "error" && echo "Request $i: Rate limited" || echo "Request $i: Allowed"
done

# After 15 failed attempts, subsequent requests should be blocked
```

### Success Criteria

- ✅ First 10 auth attempts allowed
- ✅ Attempts 11+ blocked with 429 Too Many Requests
- ✅ API rate limiter enforced (300 req/min)
- ✅ Per-phone message rate limiter enforced (20 msg/60s)

---

## Test 8: Database Query Performance

**Goal:** Verify queries complete quickly even under load

### Setup

```bash
# Enable MySQL slow query log
mysql -e "SET GLOBAL slow_query_log='ON';"
mysql -e "SET GLOBAL long_query_time=0.5;"  # Log queries > 500ms

# Clear previous slow queries
mysql -e "TRUNCATE mysql.slow_log;"
```

### Execute

```bash
# Run load test
ab -n 5000 -c 100 http://localhost/api/trpc/botConfig.get?tenantId=1

# Check for slow queries
mysql -e "SELECT COUNT(*) as slow_queries FROM mysql.slow_log;"

# Should be < 50 slow queries out of 5000 requests
```

### Success Criteria

- ✅ < 1% of queries exceed 500ms (< 50 out of 5000)
- ✅ No N+1 query patterns detected
- ✅ Query cache hit rate > 80%
- ✅ Average query time < 10ms

---

## Full Load Test Script

Run all tests in sequence:

```bash
#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         WAFlow Full Load Test Suite - 1000 User Scale        ║"
echo "╚════════════════════════════════════════════════════════════════╝"

echo ""
echo "Test 1: Connection Pool Saturation"
ab -n 5000 -c 500 http://localhost/api/trpc/auth.me 2>&1 | grep -E "Requests/sec|Failed|Time per request"

echo ""
echo "Test 2: Message Processing Throughput"
ab -n 10000 -c 100 http://localhost/api/whatsapp/webhook 2>&1 | grep -E "Requests/sec|Failed|Time per request"

echo ""
echo "Test 3: Cache Hit Rate"
for i in {1..500}; do
  curl -s "http://localhost/api/trpc/botConfig.get?tenantId=1" > /dev/null
done
echo "Cache test completed"

echo ""
echo "Test 4: Failover Simulation"
echo "Stopping instance 1..."
docker-compose -f docker-compose.1k-users.yml stop waflow-1
sleep 5

echo "Testing with 1 instance down..."
ab -n 1000 -c 50 http://localhost/api/trpc/auth.me 2>&1 | grep -E "Requests/sec|Failed"

echo "Restarting instance 1..."
docker-compose -f docker-compose.1k-users.yml start waflow-1
sleep 10

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         Load Test Complete - Check results above             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
```

---

## Performance Baseline

Expected results for 1000-user production setup:

| Test | Metric | Target | Pass/Fail |
|------|--------|--------|-----------|
| **Connection Pool** | Concurrent connections | <450 per instance | |
| **Message Processing** | Requests/sec | >100 | |
| **Message Processing** | Error rate | <0.1% | |
| **Cache Hit Rate** | Hit ratio | >70% | |
| **Cache Performance** | Response time (cached) | <1ms | |
| **Failover** | Automatic restart | <5s | |
| **Failover** | 502 errors | 0 | |
| **Rate Limiting** | Auth blocks at 11+ attempts | Yes | |
| **Rate Limiting** | API enforces limit | 300 req/min | |
| **Database** | Slow queries % | <1% | |
| **Database** | Query time avg | <10ms | |

---

## Interpreting Results

### ✅ All Tests Pass

- System is production-ready
- Can handle 1000 concurrent users
- Instant message responses working
- Failover and recovery working
- Rate limiting preventing abuse

### ⚠️ Some Tests Fail

- Identify bottleneck (DB, Redis, or instances)
- Scale the limiting resource:
  - High DB connections → Add instance 4
  - High memory → Increase Redis maxmemory
  - High CPU → Add instance 4
- Re-run tests after scaling

### ❌ Critical Failures

- Stop production traffic
- Review error logs: `docker-compose logs waflow-1 | grep "❌"`
- Check database: `mysql -e "SHOW ENGINE INNODB STATUS\G"`
- Check Redis: `redis-cli INFO`
- Restart infrastructure: `docker-compose restart`
