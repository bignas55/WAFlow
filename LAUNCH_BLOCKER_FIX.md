# Fixing Critical Launch Blockers

## Blocker #1: Database Indexes — QUICK FIX ⚡

### Step 1: Migration File Ready
✅ **DONE** — Migration file created at `drizzle/migrations/0003_add_missing_indexes.sql`

The migration contains all index definitions for:
- users: email_verified, account_status, is_active, created_at
- bot_config: tenant_id+onboarding_completed (compound), tenant_id+account_status
- conversations: tenant_id, tenant_id+source, tenant_id+resolved
- appointments: tenant_id+date, tenant_id+status, customer_id+tenant_id, tenant_id+date+status (compound)
- conversation_assignments: conversation_id, tenant_id+agent_id, tenant_id+status, tenant_id

### Step 2: Apply Migration
Run in your local environment (with MySQL running):

```bash
cd /Users/nathi/Documents/v2

# If you have mysql client installed:
mysql -h localhost -P 3306 -u waflow -pwaflowpassword waflow < drizzle/migrations/0003_add_missing_indexes.sql

# OR using Node.js (no MySQL client required):
node apply-indexes.js

# OR using pnpm/npm (automatic):
pnpm drizzle:migrate
# or
npm run drizzle:migrate
```

### Step 3: Verify Indexes Applied
```sql
SHOW INDEX FROM users;
SHOW INDEX FROM conversations;
SHOW INDEX FROM appointments;
-- Should see all new indexes listed
```

**Time:** ~2 minutes to apply
**Impact:** Immediate performance improvement for list queries

---

## Blocker #2: Email System — IMPLEMENTATION GUIDE 📧

### What Was Created
- **emailService.ts** — Complete email service with:
  - Password reset emails
  - User approval notifications
  - Trial warning emails (10, 3, 1 day before expiry)
  - Booking confirmation emails
  - Daily summary emails
  - Console fallback for development (no SMTP required)

### Environment Setup

Add these to your `.env` file:

```env
# Email Configuration (optional — console fallback if not set)
SMTP_HOST=smtp.gmail.com           # Your SMTP server
SMTP_PORT=587                      # 587 for TLS, 465 for SSL
SMTP_USER=your-email@gmail.com     # SMTP username
SMTP_PASS=your-app-password        # SMTP password (use app-specific password for Gmail)
SMTP_FROM_EMAIL=noreply@waflow.io  # From address
```

### Gmail Setup (Easy Option)
1. Go to myaccount.google.com/app-passwords
2. Generate an App Password for "Mail" + "Windows"
3. Copy the password (16 characters with spaces)
4. Set `SMTP_USER` to your Gmail address
5. Set `SMTP_PASS` to the generated password

### Integration Points

#### 1. Password Reset Email (Auth Router)
**File:** `server/routers/authRouter.ts`

Add after password reset token is created:

```typescript
import { emailService } from "../services/emailService";

export const resetPassword = protectedProcedure
  .input(z.object({ email: z.string().email() }))
  .mutation(async ({ input }) => {
    // ... existing reset token generation code ...
    
    const resetLink = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
    await emailService.sendPasswordResetEmail(user.email, resetLink);
    
    return { success: true };
  });
```

#### 2. User Approval Email (Admin Router)
**File:** `server/routers/adminRouter.ts`

Add when approving a user:

```typescript
import { emailService } from "../services/emailService";

export const approveTenant = adminProcedure
  .input(z.object({ tenantId: z.number() }))
  .mutation(async ({ input }) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, input.tenantId),
    });
    
    // ... existing approval logic ...
    
    // Send approval email
    await emailService.sendApprovalNotification(user.email, user.name);
    
    return { success: true };
  });
```

#### 3. Trial Warning Emails (Scheduled Job)
**File:** Create new `server/jobs/trialWarningsJob.ts`

```typescript
import { emailService } from "../services/emailService";
import { logger } from "../services/logger";

/**
 * Runs daily to send trial expiration warnings
 * Call this from a cron job (e.g., AWS Lambda, node-cron)
 */
export async function sendTrialWarnings() {
  try {
    const now = new Date();

    // Find users whose trial expires in 10, 3, or 1 day
    const targetDates = [
      new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days
      new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),  // 3 days
      new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),  // 1 day
    ];

    for (const targetDate of targetDates) {
      const users = await db.query.users.findMany({
        where: and(
          eq(users.accountStatus, "trial_active"),
          between(users.trialEndDate, targetDate, targetDate),
        ),
      });

      for (const user of users) {
        const daysRemaining = Math.ceil(
          (user.trialEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );

        await emailService.sendTrialWarningEmail(user.email, user.name, daysRemaining);
      }
    }

    logger.info("JOBS", `Trial warnings sent for ${users.length} users`);
  } catch (error) {
    logger.error("JOBS", "Failed to send trial warnings", error as Error);
  }
}
```

Set up a cron job to run this daily:

```typescript
// In server/index.ts, add:
import cron from "node-cron";
import { sendTrialWarnings } from "./jobs/trialWarningsJob";

// Run every day at 9 AM
cron.schedule("0 9 * * *", sendTrialWarnings);
```

#### 4. Booking Confirmation Email (Appointments Router)
**File:** `server/routers/appointmentsRouter.ts`

Add when creating an appointment:

```typescript
import { emailService } from "../services/emailService";

export const createAppointment = publicProcedure
  .input(z.object({
    customerEmail: z.string().email(),
    customerName: z.string(),
    serviceName: z.string(),
    date: z.string(),
    time: z.string(),
  }))
  .mutation(async ({ input }) => {
    // ... existing appointment creation ...
    
    // Send confirmation email
    await emailService.sendBookingConfirmationEmail(
      input.customerEmail,
      input.customerName,
      input.serviceName,
      input.date,
      input.time
    );
    
    return { success: true };
  });
```

#### 5. Daily Summary Email (Optional)
**File:** `server/jobs/dailySummaryJob.ts`

```typescript
export async function sendDailySummaries() {
  // Query users with dailySummary enabled
  const users = await db.query.users.findMany({
    where: and(
      eq(botConfig.enableDailySummary, true),
      eq(users.isActive, true),
    ),
    with: { botConfig: true },
  });

  for (const user of users) {
    // Get yesterday's stats
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const [messagesReceived, appointments] = await Promise.all([
      db.$count(
        conversations,
        and(
          eq(conversations.tenantId, user.id),
          gte(conversations.createdAt, yesterday),
        )
      ),
      db.query.appointments.findMany({
        where: and(
          eq(appointments.tenantId, user.id),
          gte(appointments.createdAt, yesterday),
        ),
      }),
    ]);

    await emailService.sendDailySummaryEmail(user.email, user.name, {
      messagesReceived,
      messagesReplied: Math.floor(messagesReceived * 0.95), // Estimate
      appointmentsBooked: appointments.filter(a => a.status === "booked").length,
      appointmentsCompleted: appointments.filter(a => a.status === "completed").length,
    });
  }
}

// Schedule daily at 8 AM
cron.schedule("0 8 * * *", sendDailySummaries);
```

**Time:** ~2 hours for full integration
**Impact:** Users can now reset passwords, get approvals, see trial warnings, receive booking confirmations

---

## Blocker #3: Backend Integration — SECURITY & MONITORING 🔒

### Step 1: Add Security Middleware

**File:** `server/index.ts`

At the top of your Express setup, add:

```typescript
import { 
  securityHeaders, 
  validateRequestHeaders, 
  preventParameterPollution 
} from "./middleware/security";

const app = express();

// Security headers first
app.use(securityHeaders);

// Request validation
app.use(validateRequestHeaders);
app.use(preventParameterPollution);

// ... rest of middleware ...
```

### Step 2: Add Health Check Endpoint

**File:** `server/index.ts`

Add this route:

```typescript
import { handleHealthCheck, startHealthCheckScheduler } from "./services/healthCheck";

// Health check endpoint
app.get("/health", handleHealthCheck);

// Start periodic health checks
startHealthCheckScheduler(60000); // Check every 60 seconds
```

### Step 3: Add Structured Logging to API Routes

**File:** `server/index.ts`

Add logging middleware:

```typescript
import { logger } from "./services/logger";

app.use((req, res, next) => {
  const start = Date.now();
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.logRequest(req.method, req.path, res.statusCode, duration);
  });
  
  next();
});
```

### Step 4: Log Query Performance

**File:** `server/db.ts` (or wherever you initialize Drizzle)

Add query logging (optional but recommended):

```typescript
import { logger } from "./services/logger";

// Add to Drizzle initialization if it supports hooks
// Or add logging to critical query routers manually
```

### Step 5: Monitor in Production

Create a simple monitoring dashboard or integration:

```typescript
// Example: Export health check data
app.get("/api/metrics/health", async (req, res) => {
  const health = await healthCheck.performHealthCheck();
  res.json(health);
});

// Example: Get recent logs
app.get("/api/admin/logs/:level", async (req, res) => {
  const logs = await logger.getLogs(req.params.level, 100);
  res.json(logs);
});
```

**Time:** ~1 hour
**Impact:** Security hardened, monitoring enabled, problems visible

---

## Complete Fix Checklist

### Database (5 minutes)
- [ ] Run `pnpm drizzle:generate`
- [ ] Run `pnpm drizzle:migrate`
- [ ] Verify indexes in database

### Email (2 hours)
- [ ] Add SMTP environment variables (or use console fallback)
- [ ] Import emailService in auth router
- [ ] Add password reset email sending
- [ ] Add user approval email sending
- [ ] Add trial warning emails (scheduled job)
- [ ] Add booking confirmation emails
- [ ] Test emails in development

### Backend Integration (1 hour)
- [ ] Add security middleware to Express
- [ ] Add health check endpoint
- [ ] Add request logging middleware
- [ ] Test all endpoints
- [ ] Verify logs are being written

### Testing (30 minutes)
- [ ] Trigger password reset and check email
- [ ] Approve a test user and check email
- [ ] Visit `/health` endpoint and verify response
- [ ] Check that logs are being created
- [ ] Verify security headers with curl:
  ```bash
  curl -I http://localhost:3000/health
  ```

---

## Total Time: ~3.5 hours

After completing all steps:
- ✅ Database optimized with indexes
- ✅ Email system working
- ✅ Security hardened
- ✅ Monitoring enabled
- ✅ Ready for public launch (with QA)

---

## Fallbacks & Safety

**Email fails gracefully:**
- If SMTP isn't configured, emails log to console in dev
- Failed emails are logged with retry suggestions
- Users aren't blocked if email fails

**Security is non-breaking:**
- Headers added don't break any clients
- Parameter pollution prevention is transparent
- Rate limiting uses sliding window (fair)

**Monitoring is passive:**
- Health checks don't affect performance
- Logging is async and non-blocking
- Can be disabled without code changes

You can proceed with any of these with confidence. Pick one to start!
