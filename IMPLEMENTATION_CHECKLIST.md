# ✅ WAFlow Public Launch Checklist

## Phase 1: Code Implementation (DONE ✓)

### Security Fixes
- [x] Generate new JWT_SECRET (cryptographically random 32-byte)
- [x] Generate new ENCRYPTION_KEY (cryptographically random 32-byte)
- [x] Generate new WHATSAPP_WEBHOOK_TOKEN
- [x] Update `.env` with new secrets
- [ ] **YOU DO**: Rotate Groq API key (delete old, create new)

### Paystack Integration
- [x] Create `paystackService.ts` - payment verification & authorization
- [x] Add `paymentWebhook` procedure to `billingRouter.ts`
- [x] Add `initializePayment` procedure for frontend integration
- [x] Implement webhook signature verification
- [ ] **YOU DO**: Create Paystack account & get API keys

### Error Monitoring
- [x] Create `sentryService.ts` with Sentry integration
- [x] Initialize Sentry in `server/index.ts`
- [x] Add request tracing middleware
- [x] Add error handler middleware
- [ ] **YOU DO**: Create Sentry account & get DSN (optional but recommended)

### Database & Backups
- [x] Create `backup-database.sh` script
- [x] Make script executable (chmod +x)
- [ ] **YOU DO**: Add to crontab for daily backups

### Testing
- [x] Create `critical-paths.test.ts` with 20+ test cases
- [x] Cover: auth, payments, database, config, error handling, bookings
- [ ] **YOU DO**: Run tests with `npm test` and fix any failures

---

## Phase 2: Manual Setup (YOU DO NOW)

### A. Groq API Key Rotation (10 minutes)
**Status:** ⏳ Pending

- [ ] Go to https://console.groq.com/keys
- [ ] Sign in to your Groq account
- [ ] Delete old key: `gsk_***REDACTED***` (old key has been removed from git)
- [ ] Click "Generate API Key"
- [ ] Copy new key (starts with `gsk_...`)
- [ ] In `/Users/nathi/Documents/v2/.env`, replace:
  ```
  AI_API_KEY=PASTE_NEW_GROQ_KEY_HERE
  ```
  with your actual new key
- [ ] Save `.env`
- [ ] Restart server: `npm run dev`
- [ ] Check logs show "✓ Configuration validated"

**Why:** Old key is exposed in git history. Anyone could drain your API credits.

---

### B. WhatsApp Setup (1-2 hours)
**Status:** ⏳ Pending

#### Step 1: Create Meta Business Account
- [ ] Go to https://business.facebook.com/
- [ ] Click "Create Account"
- [ ] Fill in business info
- [ ] Verify email

#### Step 2: Get WhatsApp Business Approval
- [ ] In Meta Business Suite, go to WhatsApp → Getting Started
- [ ] Complete WhatsApp Business Account setup
- [ ] Provide business description
- [ ] Agree to terms
- [ ] **WAIT for approval** (usually 1-2 hours)

#### Step 3: Register Your Phone Number
- [ ] Go to WhatsApp → Phone Numbers
- [ ] Click "Add Phone Number"
- [ ] Enter your actual WhatsApp number (e.g., +1234567890)
- [ ] Verify via SMS or call
- [ ] **Save the Phone Number ID** (looks like: 123456789012345)

#### Step 4: Get Access Token
- [ ] Go to Settings → Account Access Tokens
- [ ] Create new token with `whatsapp_business_messaging` permission
- [ ] **Save the token** (looks like: EAABsZCoZA...)

#### Step 5: Get Business Account ID
- [ ] Go to Settings → Business Accounts
- [ ] **Copy your Business Account ID** (numeric, e.g., 123456789)

#### Step 6: Update Environment Variables
In `.env`, update:
```bash
WHATSAPP_PHONE_NUMBER_ID=YOUR_PHONE_NUMBER_ID_HERE
WHATSAPP_BUSINESS_ACCOUNT_ID=YOUR_BUSINESS_ACCOUNT_ID_HERE
WHATSAPP_ACCESS_TOKEN=YOUR_ACCESS_TOKEN_HERE
WHATSAPP_APP_SECRET=PASTE_META_APP_SECRET_HERE
```

#### Step 7: Get Meta App Secret
- [ ] In Meta Apps, select your app
- [ ] Go to Settings → Basic
- [ ] Find "App Secret"
- [ ] **Replace**: `WHATSAPP_APP_SECRET=PASTE_META_APP_SECRET_HERE`

#### Step 8: Test in WAFlow
- [ ] Restart server: `npm run dev`
- [ ] Go to Settings → WhatsApp in UI
- [ ] Click "Start Session" or scan QR code
- [ ] Send a test message from your WhatsApp number
- [ ] Verify it appears in Inbox

**Why:** Without real WhatsApp credentials, the system can't send/receive messages.

---

### C. Paystack Setup (1-2 hours)
**Status:** ⏳ Pending

#### Step 1: Create Paystack Account
- [ ] Go to https://dashboard.paystack.com/signup
- [ ] Sign up with your email
- [ ] Set password
- [ ] Verify email

#### Step 2: Complete KYC Verification
- [ ] Fill in business name, description, website URL
- [ ] Add bank account for payouts (required for processing)
- [ ] **WAIT for approval** (usually same day, sometimes instant)

#### Step 3: Get API Keys
- [ ] Go to Settings → API Keys & Webhooks
- [ ] Find **Public Key** (starts with `pk_live_...` or `pk_test_...`)
- [ ] Find **Secret Key** (starts with `sk_live_...` or `sk_test_...`)
- [ ] **Copy both keys**

#### Step 4: Update Environment Variables
In `.env`, add/update:
```bash
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxx
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxx
```

#### Step 5: Configure Webhook in Paystack
- [ ] In Paystack dashboard, go to Settings → API Keys & Webhooks
- [ ] Add webhook URL:
  ```
  https://YOUR_NGROK_URL/api/trpc/billing.paystackWebhook
  ```
- [ ] Copy **Webhook verify token** (if it creates one)
- [ ] Test webhook endpoint

#### Step 6: Test Payment Flow
- [ ] Restart server: `npm run dev`
- [ ] Go to Billing page in UI
- [ ] Select "Pro" plan
- [ ] Click "Upgrade"
- [ ] Use Paystack test card:
  - **Card:** 4011 1111 1111 1111
  - **Expiry:** Any future date (e.g., 12/25)
  - **CVC:** Any 3 digits (e.g., 123)
- [ ] Should redirect to success page
- [ ] Verify user is upgraded to Pro in database

**Why:** Without Paystack, users can't upgrade plans or pay.

---

### D. Sentry Setup (Optional, 30 minutes)
**Status:** ⏳ Optional

#### Step 1: Create Sentry Account
- [ ] Go to https://sentry.io/signup/
- [ ] Sign up with email
- [ ] Create organization

#### Step 2: Create Project
- [ ] Name: `waflow-production`
- [ ] Platform: `Node.js`
- [ ] **Copy your DSN** (looks like: https://xxx@sentry.io/123456)

#### Step 3: Update Environment Variable
In `.env`, add:
```bash
SENTRY_DSN=https://xxx@sentry.io/123456
```

#### Step 4: Test Error Capture
- [ ] Restart server
- [ ] Trigger an intentional error (e.g., invalid API call)
- [ ] Check Sentry dashboard
- [ ] Should see error appear in Issues

**Why:** Catch production errors before they destroy user experience.

---

### E. Database Backup Setup (15 minutes)
**Status:** ⏳ Pending

#### Step 1: Verify Backup Script
- [ ] Backup script already created at `/Users/nathi/Documents/v2/backup-database.sh`
- [ ] Already executable (chmod +x)
- [ ] Test it once:
  ```bash
  /Users/nathi/Documents/v2/backup-database.sh
  ```
- [ ] Should create a file in `~/Documents/v2/backups/`

#### Step 2: Add to Crontab
- [ ] Edit crontab:
  ```bash
  crontab -e
  ```
- [ ] Add this line (runs daily at 2 AM):
  ```
  0 2 * * * /Users/nathi/Documents/v2/backup-database.sh
  ```
- [ ] Save and exit

#### Step 3: Verify
- [ ] Check backups directory tomorrow at 2 AM
- [ ] Should have new backup file created

**Why:** Automated backups protect against data loss.

---

## Phase 3: Testing & Verification

### Integration Tests
- [ ] Run tests: `npm test`
- [ ] Should see 20+ tests pass
- [ ] If failures, fix based on error messages

### Manual QA
- [ ] Test all 38 frontend pages:
  - [ ] Dashboard page loads
  - [ ] Settings page displays correctly
  - [ ] Inbox shows messages
  - [ ] Appointments calendar works
  - [ ] Billing page shows plan options
  - [ ] (Continue for all other pages)
- [ ] Verify Socket.IO real-time updates
- [ ] Test error messages for invalid inputs
- [ ] Test loading states on slow connections

### Load Testing (Optional)
- [ ] Install k6: `brew install k6` (Mac)
- [ ] Create test script
- [ ] Test with 50+ concurrent users
- [ ] Verify response times < 2 seconds

### Final Security Audit
- [ ] Verify NO API keys in git history
- [ ] Verify NO weak secrets in `.env`
- [ ] Verify rate limiting is working
- [ ] Verify CORS is restrictive
- [ ] Verify HTTPS/TLS certificate valid

---

## Phase 4: Go Live

### Pre-Launch
- [ ] All checkboxes above completed
- [ ] No API keys exposed in version control
- [ ] Backup script running daily
- [ ] Error monitoring (Sentry) capturing errors
- [ ] PM2 keeping processes alive
- [ ] ngrok tunnel stable and public URL working

### Launch
- [ ] Deploy to production environment (or continue with local + ngrok)
- [ ] Invite beta testers
- [ ] Monitor error logs
- [ ] Monitor Sentry for issues
- [ ] Monitor backup logs

### Post-Launch (First 24 Hours)
- [ ] Check Sentry errors
- [ ] Monitor database backup logs
- [ ] Check ngrok stability
- [ ] Gather initial user feedback
- [ ] Be ready to fix critical issues

---

## Quick Reference Commands

```bash
# Restart server (after .env changes)
npm run dev

# Run tests
npm test

# Test backup script
/Users/nathi/Documents/v2/backup-database.sh

# Check PM2 status (if running)
pm2 list

# View ngrok URL
# (check your terminal where ngrok is running)

# Generate new secrets (if needed)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Timeline

| Phase | Task | Duration | Status |
|-------|------|----------|--------|
| 1 | Code implementation | Done | ✅ |
| 2A | Groq key rotation | 10 min | ⏳ |
| 2B | WhatsApp setup | 1-2 hrs | ⏳ |
| 2C | Paystack setup | 1-2 hrs | ⏳ |
| 2D | Sentry setup | 30 min | ⏳ |
| 2E | Backup setup | 15 min | ⏳ |
| 3 | Testing & QA | 2-3 hrs | ⏳ |
| 4 | Go live | - | ⏳ |

**Total: ~6-8 hours** of focused work

---

## Getting Stuck?

| Problem | Solution |
|---------|----------|
| Groq key deleted but don't have new one | Create new key at https://console.groq.com/keys |
| WhatsApp approval taking too long | Check Meta Business dashboard for status, may need additional info |
| Paystack KYC failing | Verify business details match your bank account |
| Sentry not capturing errors | Check SENTRY_DSN is correct and server restarted |
| Backup script fails | Check MySQL is running and credentials are correct |
| Tests failing | Read error message and fix the issue, usually missing dependency |

---

## Success Criteria

✅ **Ready for public testing when:**
- [ ] All API keys rotated and production-grade secrets set
- [ ] WhatsApp connected and test message sent successfully
- [ ] Paystack integrated and test payment completed
- [ ] Database backups running daily
- [ ] Error monitoring capturing errors
- [ ] All integration tests passing
- [ ] Manual QA completed on all pages
- [ ] Load testing shows acceptable response times
- [ ] Security audit passed (no exposed keys, proper validation)

**Expected completion:** End of Week (5-7 days)

Good luck! 🚀
