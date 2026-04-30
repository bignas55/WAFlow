# Database Optimization Guide — Task #23

## Current State Analysis

### Existing Indexes
The schema already has indexes on:
- `botConfig`: tenantId
- `conversations`: (tenantId, phoneNumber, createdAt), phoneNumber, createdAt, source
- `templates`: (tenantId, isActive, priority)
- `knowledgeBase`: (tenantId, isActive, status)
- `customers`: (tenantId, phoneNumber), (tenantId, createdAt)
- `appointments`: date, customerId
- `webhookLogs`: createdAt
- `businessRules`: tenantId
- `conversationFlows`: tenantId, (flowId, tenantId)
- `licenses`: clientEmail

### Missing Indexes (High Priority)

1. **users table**
   - Missing: email (exists as UNIQUE but should be indexed separately for lookups)
   - Missing: accountStatus (for trial/active user queries)
   - Missing: emailVerified (for filtering unverified users)
   - Missing: isActive (for active user filters)

2. **botConfig table**
   - Missing: (tenantId, onboardingCompleted) — common query for onboarding checks
   - Missing: (tenantId, accountStatus) — combined filter

3. **conversations table**
   - Missing: (tenantId, source) — template vs AI response filtering
   - Missing: (tenantId, resolved) — status filtering
   - Missing: tenantId alone — generic tenant lookups

4. **appointments table**
   - Missing: (tenantId, date) — calendar queries
   - Missing: (tenantId, status) — status filtering
   - Missing: (customerId, tenantId) — customer's appointments
   - Missing: (tenantId, date, status) — compound query

5. **conversationAssignments table**
   - Missing: (tenantId, agentId) — agent's conversations
   - Missing: (tenantId, status) — assignment status filtering
   - Missing: tenantId — all assignments for tenant

6. **messages table (if exists)**
   - Should have: (tenantId, conversationId, createdAt)
   - Should have: (tenantId, customerId, createdAt)

## N+1 Query Patterns to Fix

### Pattern 1: Conversations with Associated Data
```typescript
// ❌ BAD: N+1 queries (one per conversation)
const conversations = await db.query.conversations.findMany();
for (const conv of conversations) {
  const botConfig = await db.query.botConfig.findFirst({
    where: eq(botConfig.tenantId, conv.tenantId)
  });
  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, conv.customerId)
  });
}

// ✅ GOOD: Single batch query with joins
const conversations = await db.query.conversations.findMany({
  where: eq(conversations.tenantId, tenantId),
  with: {
    customer: true,
    botConfig: true,
  },
  orderBy: desc(conversations.createdAt),
  limit: 50,
});
```

### Pattern 2: Appointments with Staff & Customer
```typescript
// ❌ BAD: Multiple queries
const appointments = await db.query.appointments.findMany({
  where: eq(appointments.tenantId, tenantId),
});
const enriched = await Promise.all(appointments.map(async (apt) => {
  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, apt.customerId)
  });
  const staff = await db.query.staff.findFirst({
    where: eq(staff.id, apt.staffId)
  });
  return { ...apt, customer, staff };
}));

// ✅ GOOD: Single query with relations
const appointments = await db.query.appointments.findMany({
  where: eq(appointments.tenantId, tenantId),
  with: {
    customer: true,
    staff: true,
  },
  orderBy: [desc(appointments.date), asc(appointments.time)],
  limit: 50,
});
```

### Pattern 3: Customers with Appointment Count
```typescript
// ❌ BAD: Count query per customer
const customers = await db.query.customers.findMany({
  where: eq(customers.tenantId, tenantId),
});
const withCounts = customers.map(c => ({
  ...c,
  appointmentCount: await db.query.appointments.count({
    where: and(
      eq(appointments.customerId, c.id),
      eq(appointments.tenantId, tenantId)
    )
  }),
}));

// ✅ GOOD: Single SQL query with COUNT
const customersWithCounts = await db.select({
  customer: customers,
  appointmentCount: sql<number>`COUNT(${appointments.id})`,
}).from(customers)
  .leftJoin(appointments, and(
    eq(appointments.customerId, customers.id),
    eq(appointments.tenantId, sql.placeholder('tenantId'))
  ))
  .where(eq(customers.tenantId, sql.placeholder('tenantId')))
  .groupBy(customers.id);
```

## Implementation Strategy

### Phase 1: Add Missing Indexes (Low Risk)
No application changes needed, just add indexes to existing tables.

```typescript
// In schema.ts

export const users = mysqlTable("users", {
  // ... existing columns
}, (table) => ({
  emailIdx: index("idx_users_email").on(table.email),
  accountStatusIdx: index("idx_users_account_status").on(table.accountStatus),
  emailVerifiedIdx: index("idx_users_email_verified").on(table.emailVerified),
  isActiveIdx: index("idx_users_is_active").on(table.isActive),
  createdAtIdx: index("idx_users_created_at").on(table.createdAt),
}));

export const botConfig = mysqlTable("bot_config", {
  // ... existing columns
}, (table) => ({
  tenantOnboardingIdx: index("idx_bot_config_tenant_onboarding").on(table.tenantId, table.onboardingCompleted),
  tenantStatusIdx: index("idx_bot_config_tenant_status").on(table.tenantId, table.accountStatus),
}));

export const conversations = mysqlTable("conversations", {
  // ... existing columns
}, (table) => ({
  tenantIdx: index("idx_conv_tenant").on(table.tenantId),
  tenantSourceIdx: index("idx_conv_tenant_source").on(table.tenantId, table.source),
  tenantResolvedIdx: index("idx_conv_tenant_resolved").on(table.tenantId, table.resolved),
}));

export const appointments = mysqlTable("appointments", {
  // ... existing columns
}, (table) => ({
  tenantDateIdx: index("idx_apt_tenant_date").on(table.tenantId, table.date),
  tenantStatusIdx: index("idx_apt_tenant_status").on(table.tenantId, table.status),
  customerTenantIdx: index("idx_apt_customer_tenant").on(table.customerId, table.tenantId),
  tenantDateStatusIdx: index("idx_apt_tenant_date_status").on(table.tenantId, table.date, table.status),
}));

export const conversationAssignments = mysqlTable("conversation_assignments", {
  // ... existing columns
}, (table) => ({
  tenantAgentIdx: index("idx_conv_assign_tenant_agent").on(table.tenantId, table.agentId),
  tenantStatusIdx: index("idx_conv_assign_tenant_status").on(table.tenantId, table.status),
  tenantIdx: index("idx_conv_assign_tenant").on(table.tenantId),
}));
```

### Phase 2: Fix N+1 Queries in Routers
Update main query patterns to use Drizzle relations instead of multiple queries.

**File:** `/Users/nathi/Documents/v2/server/routers/conversationsRouter.ts`
```typescript
// Replace separate queries with relation loading
export const conversationsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      return db.query.conversations.findMany({
        where: eq(conversations.tenantId, ctx.user.userId),
        with: {
          customer: true,      // Loads customer in single query
          botConfig: true,     // Loads bot config in single query
        },
        orderBy: desc(conversations.createdAt),
        limit: input.limit,
        offset: input.offset,
      });
    }),
});
```

### Phase 3: Add Pagination to Large Queries
Implement consistent pagination to prevent loading too much data.

```typescript
// Pattern for paginated lists
async function getConversationsPaginated(
  tenantId: number,
  limit: number = 50,
  offset: number = 0
) {
  const [conversations, totalCount] = await Promise.all([
    db.query.conversations.findMany({
      where: eq(conversations.tenantId, tenantId),
      with: { customer: true },
      orderBy: desc(conversations.createdAt),
      limit: Math.min(limit, 100), // Cap at 100
      offset,
    }),
    db.$count(conversations, where(eq(conversations.tenantId, tenantId))),
  ]);

  return {
    data: conversations,
    total: totalCount,
    hasMore: offset + conversations.length < totalCount,
  };
}
```

### Phase 4: Add Query Caching
Cache frequently accessed data.

```typescript
// Simple Redis-like caching for bot config
const configCache = new Map<number, { data: BotConfig; expires: number }>();

async function getBotConfig(tenantId: number) {
  const cached = configCache.get(tenantId);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const config = await db.query.botConfig.findFirst({
    where: eq(botConfig.tenantId, tenantId),
  });

  if (config) {
    // Cache for 5 minutes
    configCache.set(tenantId, { data: config, expires: Date.now() + 5 * 60 * 1000 });
  }

  return config;
}
```

## Performance Metrics to Track

1. **Query execution time** — Target: <100ms for list queries, <50ms for single lookups
2. **Database CPU** — Should stay <50% under normal load
3. **Connection pool usage** — Monitor active/idle connections
4. **Slow query log** — Any query >1000ms should be investigated
5. **Index usage** — Verify new indexes are actually used (EXPLAIN ANALYZE)

## Testing Indexes

After adding indexes, verify they're being used:

```sql
EXPLAIN ANALYZE SELECT * FROM conversations 
WHERE tenant_id = 1 
ORDER BY created_at DESC 
LIMIT 50;
```

Should see `Using index` or `Using index condition` in the output, not `Full table scan`.

## Rollback Plan

If indexes cause issues:
1. Remove new indexes: `DROP INDEX idx_name ON table_name;`
2. Revert schema.ts changes
3. Run migrations to remove index creation

Indexes don't require data migration — they only affect query performance, not data structure.

## Quick Wins (Implement First)

1. ✅ Add index on `users.emailVerified` (used heavily in pending approval queries)
2. ✅ Add index on `conversations.tenantId` (used in almost every list query)
3. ✅ Add compound index on `appointments.tenantId, appointments.date` (calendar queries)
4. ✅ Load relations in queries to avoid N+1 patterns
5. ✅ Cap pagination limits at 100 rows max

## Resources

- Drizzle ORM Docs: https://orm.drizzle.team
- MySQL Index Best Practices: Use EXPLAIN ANALYZE to verify index usage
- Compound Index Strategy: Index leftmost prefix used in WHERE clause first

---

**Next Steps:**
1. Generate migrations: `pnpm drizzle:generate`
2. Test indexes: Review EXPLAIN output
3. Update routers to use relations (Phase 2)
4. Implement pagination across all list endpoints
5. Monitor query performance in production
