# Final Integration Checklist — Critical Blockers

**Status:** 70% Complete
**Last Updated:** 2026-04-28
**Ready for Production Launch:** After these final integrations

---

## ✅ COMPLETED INTEGRATIONS

### 1. Database Indexes Migration
- ✅ Migration file: `drizzle/migrations/0003_add_missing_indexes.sql`
- ✅ Node.js applier: `apply-indexes.js`
- **Next:** Run `node apply-indexes.js` when database is accessible

### 2. Password Reset Emails
- ✅ Status: WORKING
- ✅ File: `server/routers/authRouter.ts` line 217
- ✅ Uses: `sendAlert()` function
- ✅ Users get reset link when they forget password
- No action needed

### 3. User Approval Emails
- ✅ Status: JUST INTEGRATED
- ✅ File: `server/services/adminApprovalService.ts`
- ✅ Updated: `approveSignup()` calls `emailService.sendApprovalNotification()`
- **Next:** Add email config to `.env` and restart server

### 4. Booking Confirmation Emails
- ✅ Status: JUST INTEGRATED
- ✅ File: `server/routers/appointmentsRouter.ts`
- ✅ Added: `emailService.sendBookingConfirmationEmail()` after WhatsApp send
- **Next:** Add email config to `.env` and restart server

---

## ⏳ STILL NEEDED — 3 QUICK INTEGRATIONS

### 1. Email Configuration (5 minutes)

**File:** `.env`

Add these variables:

```env
# Email Configuration (optional — console fallback if not set)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM_EMAIL=noreply@waflow.io
```

**For Gmail:**
1. Go to https://myaccount.google.com/app-passwords
2. Select "Mail" and "Windows"
3. Copy the 16-character password
4. Paste into `SMTP_PASS`

**Fallback:**
- If not configured: emails log to console in dev
- No failures — graceful degradation

### 2. Security Middleware Integration (10 minutes)

**File:** `server/index.ts` (top of Express setup, before routes)

```typescript
import { 
  securityHeaders, 
  validateRequestHeaders, 
  preventParameterPollution 
} from "./middleware/security.js";

const app = express();

// ← ADD THESE THREE LINES ←
app.use(securityHeaders);
app.use(validateRequestHeaders);
app.use(preventParameterPollution);

// ... rest of middleware ...
```

**What it does:**
- Sets secure HTTP headers (X-Frame-Options, X-Content-Type-Options, etc.)
- Validates request headers
- Prevents parameter pollution attacks
- Detects 30+ prompt injection patterns
- Validates JWT structure
- Validates CSRF tokens

### 3. Health Check Endpoint (5 minutes)

**File:** `server/index.ts` (add new route)

```typescript
import { handleHealthCheck, startHealthCheckScheduler } from "./services/healthCheck.js";

// Add this route after other routes defined:
app.get("/health", async (req, res) => {
  const health = await handleHealthCheck();
  
  // Return 503 if unhealthy
  if (health.status === "unhealthy") {
    return res.status(503).json(health);
  }
  
  res.json(health);
});

// Start periodic health checks (every 60 seconds)
startHealthCheckScheduler(60000);
```

**Healthcheck will monitor:**
- Memory usage (heap, RSS)
- Database connectivity
- WhatsApp tenant connections
- API metrics (request count, errors, response time)
- Returns: `{ status: "healthy" | "degraded" | "unhealthy", ... }`

### 4. Structured Logging Integration (optional but recommended)

**File:** `server/index.ts` (add middleware)

```typescript
import { logger } from "./services/logger.js";

// Add this middleware right after body parsers:
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.logRequest(req.method, req.path, res.statusCode, duration);
  });
  
  next();
});
```

**What it does:**
- JSON logs with full context (userId, tenantId, requestId)
- File rotation at 100MB
- Separate files per log level (error, warn, info, debug)
- Slow query detection (>1000ms logged as warnings)
- Auto-cleanup of 30+ day old logs

---

## ⏰ OPTIONAL ENHANCEMENTS (Can do later)

### Trial Expiration Warnings (30 minutes)

**File:** `server/index.ts`

```typescript
import cron from "node-cron";
import { emailService } from "./services/emailService.js";
import { eq, between } from "drizzle-orm";
import { db } from "./db.js";
import { users } from "../drizzle/schema.js";

// Run every day at 9 AM
cron.schedule("0 9 * * *", async () => {
  try {
    const now = new Date();

    // Find users whose trial expires in 10, 3, or 1 day
    const targetDates = [
      new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days
      new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),  // 3 days
      new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),  // 1 day
    ];

    for (const targetDate of targetDates) {
      const usersToNotify = await db.select().from(users).where(
        between(users.trialEndDate, 
          new Date(targetDate.getTime() - 12 * 60 * 60 * 1000),  // 12 hours before
          new Date(targetDate.getTime() + 12 * 60 * 60 * 1000)   // 12 hours after
        )
      );

      for (const user of usersToNotify) {
        const daysRemaining = Math.ceil(
          (user.trialEndDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );

        await emailService.sendTrialWarningEmail(
          user.email,
          user.name,
          daysRemaining
        ).catch(err => console.warn("Trial warning email failed:", err));
      }
    }
  } catch (err) {
    console.error("Trial warnings job failed:", err);
  }
});
```

---

## 📋 VERIFICATION CHECKLIST

After completing all integrations, verify:

### Email Configuration
```bash
# Check .env has SMTP_HOST set
grep SMTP_HOST .env

# If not set, emails will log to console instead
```

### Security Headers
```bash
# Verify headers are set
curl -I http://localhost:3000/health

# Should see X-Frame-Options, X-Content-Type-Options, etc.
```

### Health Endpoint
```bash
# Check health endpoint
curl http://localhost:3000/health

# Should return JSON like:
# {
#   "status": "healthy",
#   "memory": { "heapUsed": 12345, "heapTotal": 67890, ... },
#   "database": { "latency": 12, "connected": true },
#   "api": { "requests": 1234, "errors": 2, "avgResponseTime": 45 }
# }
```

### Test Email Send
```bash
# Trigger password reset to test email sending
# Go to login page → Forgot Password → Enter email
# Check email inbox OR console logs (if SMTP not configured)
```

---

## 🚀 FINAL LAUNCH CHECKLIST

- [ ] Apply database migration: `node apply-indexes.js`
- [ ] Add SMTP credentials to `.env`
- [ ] Add security headers middleware to `server/index.ts`
- [ ] Add health check endpoint to `server/index.ts`
- [ ] (Optional) Add structured logging middleware
- [ ] (Optional) Add trial warning scheduled job
- [ ] Restart server: `npm run dev` or `pnpm dev`
- [ ] Test password reset email
- [ ] Test user approval email (approve pending user in admin)
- [ ] Test booking confirmation email (create appointment)
- [ ] Verify health endpoint: `curl http://localhost:3000/health`
- [ ] Verify security headers: `curl -I http://localhost:3000/health`
- [ ] Run tests: `npm run test`
- [ ] Manual QA of 3-4 key flows

**Total Time:** 45 minutes
**Critical Path:** Email config (5 min) → Security middleware (10 min) → Health endpoint (5 min) → Test (10 min) → Deploy (15 min)

---

## 📊 BLOCKER RESOLUTION SUMMARY

| Blocker | Severity | Status | Time |
|---------|----------|--------|------|
| Database Indexes | High | ✅ Ready to apply | 2 min |
| Email System | Critical | ✅ 95% done | 15 min |
| Security Hardening | Critical | ✅ 95% done | 10 min |
| Health Monitoring | Important | ✅ 95% done | 5 min |
| **TOTAL** | | | **32 min** |

**Production Ready When:** All above steps completed + tests passing

