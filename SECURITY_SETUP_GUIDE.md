# 🔐 WAFlow Security & Integration Setup Guide

## Status: 3 Secrets Already Generated ✓

Your `.env` file has been updated with:
- ✅ **JWT_SECRET**: New secure random 32-byte key
- ✅ **ENCRYPTION_KEY**: New secure random 32-byte key  
- ✅ **WHATSAPP_WEBHOOK_TOKEN**: New secure random token

**⚠️ RESTART YOUR SERVER** after these changes for new secrets to take effect.

---

## Task 1: Rotate Groq API Key (10 min)

**Why:** Your current key is exposed in git. Anyone with it can call your API and drain credits.

### Steps:

1. **Revoke the old key:**
   - Go to https://console.groq.com/keys
   - Sign in with your Groq account
   - Find and delete: `gsk_***REDACTED***` (old key has been removed from git)

2. **Create a new key:**
   - Click "Generate API Key"
   - Copy the new key (starts with `gsk_...`)

3. **Update `.env`:**
   ```bash
   # Replace in .env:
   AI_API_KEY=PASTE_NEW_GROQ_KEY_HERE
   # With your actual new key
   AI_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxx
   ```

4. **Verify:**
   ```bash
   # Restart server
   npm run dev
   # Check logs for "✓ Configuration validated"
   ```

---

## Task 2: Set Up WhatsApp Integration (1-2 hours)

**Why:** Without real WhatsApp credentials, all messaging is blocked.

### Prerequisites:
- Meta Business Account (free to create)
- WhatsApp Business Account
- A phone number to register

### Steps:

1. **Create Meta Business Account:**
   - Go to https://business.facebook.com/
   - Click "Create Account"
   - Fill in business details
   - Verify email

2. **Get WhatsApp Business Approval:**
   - In Meta Business Suite, go to "WhatsApp" → "Getting Started"
   - Complete WhatsApp Business Account setup
   - Provide business info and agree to terms
   - **Wait for approval** (usually 1-2 hours, sometimes instant)

3. **Register Your Phone Number:**
   - In WhatsApp Business settings, go to "Phone Numbers"
   - Click "Add Phone Number"
   - Enter your actual WhatsApp number (e.g., +1234567890)
   - Verify via SMS or voice call
   - **Save the Phone Number ID** (looks like: `123456789012345`)

4. **Get Access Token:**
   - Go to Settings → Account Access Tokens
   - Create a new token with `whatsapp_business_messaging` permission
   - **Save the token** (looks like: `EAABsZCoZA...`)

5. **Get Business Account ID:**
   - In Settings → Business Accounts
   - Copy your Business Account ID (numeric)

6. **Update `.env`:**
   ```bash
   WHATSAPP_PHONE_NUMBER_ID=YOUR_PHONE_NUMBER_ID
   WHATSAPP_BUSINESS_ACCOUNT_ID=YOUR_BUSINESS_ACCOUNT_ID
   WHATSAPP_ACCESS_TOKEN=YOUR_ACCESS_TOKEN
   WHATSAPP_APP_SECRET=PASTE_META_APP_SECRET_HERE
   ```

7. **Get Webhook Secret:**
   - Go to Meta Apps → Your App → Webhooks
   - Set webhook URL: `https://YOUR_NGROK_URL/api/webhooks/whatsapp`
   - Generate a webhook verify token
   - **Update:**
   ```bash
   WHATSAPP_WEBHOOK_TOKEN=THE_TOKEN_YOU_GENERATED
   ```

8. **Test in WAFlow:**
   - Go to Settings → WhatsApp in UI
   - Click "Start Session" or scan QR code
   - Send a test message from your WhatsApp number
   - Verify it appears in the inbox

---

## Task 3: Set Up Paystack Payments (1-2 hours)

**Why:** Without Paystack, users can't upgrade plans or pay.

### Prerequisites:
- Paystack account (free, supports South Africa)
- Bank account for payouts

### Steps:

1. **Create Paystack Account:**
   - Go to https://dashboard.paystack.com/signup
   - Email: (use your main email)
   - Password: (create strong password)
   - Verify email

2. **Verify Business:**
   - Complete KYC: business name, description, website
   - Add bank account for payouts
   - **Wait for approval** (usually same day)

3. **Get API Keys:**
   - Go to Settings → API Keys & Webhooks
   - Find: **Public Key** (starts with `pk_live_...` or `pk_test_...`)
   - Find: **Secret Key** (starts with `sk_live_...` or `sk_test_...`)
   - **Copy both keys**

4. **Update `.env`:**
   ```bash
   PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxx
   PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxx
   ```

5. **Implement Webhook Handler:**

   In `server/routers/billingRouter.ts`, add:
   ```typescript
   export const billingRouter = router({
     // ... existing procedures ...

     paymentWebhook: publicProcedure
       .input(z.object({
         reference: z.string(),
         amount: z.number(),
         customer_email: z.string(),
       }))
       .mutation(async ({ input }) => {
         // Verify with Paystack
         const verified = await verifyPaystackPayment(input.reference);
         
         if (!verified) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payment verification failed' });

         // Update user's plan and expiry
         await db.update(users)
           .set({
             plan: 'pro', // based on amount
             planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
           })
           .where(eq(users.email, input.customer_email));

         return { success: true };
       }),
   });
   ```

6. **Add Webhook in Paystack Dashboard:**
   - Go to Settings → API Keys & Webhooks
   - Add webhook URL: `https://YOUR_NGROK_URL/api/trpc/billing.paymentWebhook`
   - Test with webhook endpoint

7. **Test Payment Flow:**
   - Go to Billing page in UI
   - Select "Pro" plan
   - Click "Upgrade"
   - Use Paystack test card: `4011 1111 1111 1111` (any future date, any CVC)
   - Verify account upgrades to Pro after payment

---

## Task 4: Set Up Error Monitoring (30 min)

**Why:** Without error tracking, production bugs go unnoticed.

### Option A: Sentry (Recommended - Free Tier)

1. **Create Sentry Account:**
   - Go to https://sentry.io/signup/
   - Sign up with email
   - Create organization

2. **Create Project:**
   - Name: "waflow-production"
   - Platform: "Node.js"
   - Get your **DSN** (looks like: `https://xxx@sentry.io/123456`)

3. **Install Sentry:**
   ```bash
   npm install @sentry/node
   ```

4. **Add to `server/index.ts`:**
   ```typescript
   import * as Sentry from "@sentry/node";

   if (process.env.SENTRY_DSN) {
     Sentry.init({
       dsn: process.env.SENTRY_DSN,
       environment: process.env.NODE_ENV,
       tracesSampleRate: 1.0,
     });
   }

   // After error handlers:
   app.use(Sentry.Handlers.errorHandler());
   ```

5. **Update `.env`:**
   ```bash
   SENTRY_DSN=https://xxx@sentry.io/123456
   ```

6. **Test:**
   - Trigger an error in your app
   - Check Sentry dashboard at https://sentry.io
   - Should see error appear in Issues

### Option B: Basic Logging (If Sentry overkill)

Just log errors to stdout in JSON format:
```typescript
console.error(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'error',
  message: err.message,
  stack: err.stack,
}));
```

---

## Task 5: Set Up Database Backups (15 min)

**Why:** Protect against data loss.

### Daily Backup Script:

Create `backup-db.sh`:
```bash
#!/bin/bash

BACKUP_DIR="/Users/nathi/Documents/v2/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/waflow_backup_$DATE.sql"

mkdir -p $BACKUP_DIR

# Dump database
mysqldump -u waflow -pwaflowpassword waflow > $BACKUP_FILE

# Keep only last 7 days of backups
find $BACKUP_DIR -name "waflow_backup_*.sql" -mtime +7 -delete

echo "✅ Backup created: $BACKUP_FILE"
```

### Add to Crontab:

```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 2 AM):
0 2 * * * /path/to/backup-db.sh
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] Groq API key rotated and new key in `.env`
- [ ] WhatsApp credentials obtained and in `.env`
- [ ] Test message sent through WhatsApp and received in inbox
- [ ] Paystack account created and webhook configured
- [ ] Test payment completed successfully
- [ ] Sentry DSN in `.env` and errors being captured
- [ ] Database backup script running daily
- [ ] Server restarted after all `.env` changes
- [ ] All tests passing: `npm test`

---

## Next Steps (After All Tasks Complete)

1. Write 10-15 integration tests (auth, WhatsApp, booking, payments)
2. Manual QA of all 38 frontend pages
3. Load test with 50+ concurrent users
4. Final security review
5. Deploy to staging
6. Invite beta testers

**Estimated completion: 5-7 days** with focused work on these tasks.

---

## Need Help?

If you get stuck on any step:
1. Check Groq docs: https://console.groq.com/docs
2. Check Meta docs: https://developers.facebook.com/docs/whatsapp
3. Check Paystack docs: https://paystack.com/docs
4. Check Sentry docs: https://docs.sentry.io/

Good luck! 🚀
