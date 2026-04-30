# WAFlow Production Readiness Checklist

**Last Updated:** April 28, 2026  
**Status:** Pre-Launch Testing  
**Version:** v2.0

---

## ✅ CRITICAL PATH TESTING

### 1️⃣ HEALTH CHECK (5 min)

```bash
# From your machine or via browser:
curl https://your-ngrok-url/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2026-04-28T...",
  "database": "connected",
  "whatsapp": "unknown",
  "email": "configured"
}
```

**Test:**
- [ ] Visit `/health` endpoint
- [ ] Status should be "healthy"
- [ ] All subsystems should show (not "error")

---

### 2️⃣ EMAIL SYSTEM (15 min)

#### Test 2A: Password Reset Flow
1. [ ] Log out of WAFlow
2. [ ] Click "Forgot Password"
3. [ ] Enter admin email: `shirangonathan88@gmail.com`
4. [ ] **Check Gmail inbox** for reset email
5. [ ] Click reset link in email
6. [ ] Set new password
7. [ ] Log back in with new password

**Expected:** Email arrives within 5 seconds, link works, login succeeds

#### Test 2B: User Approval Email
1. [ ] Create a new user via Admin → Users
2. [ ] Check Gmail inbox for approval notification
3. [ ] Verify email contains user details

**Expected:** Approval email sent automatically

#### Test 2C: Booking Confirmation
1. [ ] Create a test appointment via Appointments
2. [ ] Check if booking confirmation email is sent
3. [ ] Verify customer email in confirmation

**Expected:** Email sent, properly formatted

---

### 3️⃣ WHATSAPP INTEGRATION (20 min)

#### Test 3A: QR Code Authentication
1. [ ] Go to Configuration → WhatsApp
2. [ ] Click "Start QR Session"
3. [ ] Scan QR code with your phone's WhatsApp
4. [ ] Wait for "Connected" status

**Expected:** Connection shows "Connected" ✅

#### Test 3B: Message Reception
1. [ ] From your WhatsApp number, send message: "hello"
2. [ ] Check Inbox - message should appear within 3 seconds
3. [ ] Verify sender phone number is correct

**Expected:** Message shows in Inbox

#### Test 3C: AI Response
1. [ ] Message should trigger AI response
2. [ ] Response should appear in conversation
3. [ ] Check that response was generated from system prompt

**Expected:** AI responds with appropriate message

#### Test 3D: Template Matching
1. [ ] Send a message that matches a template trigger (e.g., "help")
2. [ ] Should receive template response instead of AI

**Expected:** Template response, not AI response

#### Test 3E: Customer Context
1. [ ] Send appointment booking request via WhatsApp
2. [ ] Check CRM → Customers
3. [ ] Verify customer was created/updated
4. [ ] Check conversation history is saved

**Expected:** Customer profile created, history preserved

---

### 4️⃣ CRITICAL PAGES QA (45 min)

#### Dashboard
- [ ] Page loads without errors
- [ ] WhatsApp status shows correctly
- [ ] Stats cards display numbers
- [ ] All navigation links work

#### Inbox
- [ ] Messages load from database
- [ ] Can scroll through messages
- [ ] Mark message as resolved works
- [ ] Assign to agent dropdown works

#### Appointments
- [ ] View existing appointments
- [ ] Create new appointment
- [ ] Set date/time/customer
- [ ] Save appointment successfully
- [ ] View appointment details

#### CRM / Customers
- [ ] View customer list
- [ ] Search customers by name/phone
- [ ] Click customer to view profile
- [ ] Edit customer information
- [ ] Add custom tags to customer

#### Knowledge Base (Train AI)
- [ ] Write Article: Create test article, save, verify it loads
- [ ] Upload PDF: Upload test PDF, verify content extracted
- [ ] Add Website: Add URL, verify content scraped
- [ ] Ask AI: Query knowledge base, verify response uses KB articles

#### System Prompt Studio (NEW)
- [ ] Configure Business Name & Description
- [ ] Select Knowledge Base articles
- [ ] Extract website content (add URL, click Extract)
- [ ] Add custom instructions
- [ ] Select tone (Professional/Friendly/Casual/Formal)
- [ ] Select language
- [ ] Click Generate
- [ ] Review generated prompt
- [ ] Edit prompt in Edit step
- [ ] Click Save Prompt
- [ ] Verify saved to bot config

---

### 5️⃣ PERFORMANCE & LOAD (30 min)

#### 5A: Response Time Check
1. [ ] Open DevTools (F12) → Network tab
2. [ ] Reload Dashboard
3. [ ] Check load times:
   - [ ] Dashboard should load in <2 seconds
   - [ ] Inbox should load in <2 seconds
   - [ ] API calls should respond in <1 second

#### 5B: Concurrent User Simulation
1. [ ] Open WAFlow in 3 different browser windows/tabs
2. [ ] Navigate simultaneously to different pages
3. [ ] Check for crashes or timeouts
4. [ ] Verify each session works independently

#### 5C: Memory & CPU Check
```bash
# From terminal:
pm2 monit

# Watch for:
# - CPU: Should stay <50%
# - Memory: Should stay <500MB
# - Restarts: Should be 0
```

---

### 6️⃣ DOCUMENTATION (20 min)

Create a file: `OPERATIONS.md`

```markdown
# WAFlow Operations Guide

## Quick Start
- Deployment: `pnpm build && pm2 restart all`
- Logs: `pm2 logs waflow`
- Status: `pm2 status`

## Common Issues

### WhatsApp Disconnected
- Solution: Go to Configuration → Restart QR Session

### Email Not Sending
- Check SMTP credentials in .env
- Verify Gmail app password is current
- Check ALERTS_ENABLED=true

### High Memory Usage
- Restart PM2: `pm2 restart all`
- Check for memory leaks: `pm2 monit`

### Database Connection Failed
- Check DATABASE_URL in .env
- Verify MySQL container is running
- Restart database if needed

## Monitoring
- Health endpoint: `/health`
- PM2 dashboard: `pm2 web` then visit localhost:9615
- Database backups: Daily at 2 AM UTC
```

---

## 📊 TESTING SUMMARY

| Component | Status | Notes |
|-----------|--------|-------|
| Email System | ⏳ TESTING | Check all flows |
| WhatsApp Integration | ⏳ TESTING | QR scan + messaging |
| Dashboard | ⏳ TESTING | All stats & navigation |
| Inbox | ⏳ TESTING | Message pipeline |
| Appointments | ⏳ TESTING | CRUD operations |
| CRM | ⏳ TESTING | Customer management |
| Knowledge Base | ⏳ TESTING | All 3 input types |
| System Prompt Studio | ✅ CODED | Ready for QA |
| Performance | ⏳ TESTING | Load & response time |
| Documentation | ⏳ TODO | Runbooks |

---

## 🚨 BLOCKERS (Must Fix Before Launch)

- [ ] Health endpoint returns "healthy"
- [ ] All 6 QA pages load without JavaScript errors
- [ ] Email system sends messages successfully
- [ ] WhatsApp QR scan works and receives messages
- [ ] No crashes under concurrent user load
- [ ] Response times <2 seconds for all pages

---

## ✨ NICE-TO-HAVE (Can fix after launch)

- [ ] Performance optimizations
- [ ] Advanced monitoring setup
- [ ] Automated backup testing
- [ ] Load test automation

---

## 📋 TEST EXECUTION LOG

| Date | Tester | Component | Result | Notes |
|------|--------|-----------|--------|-------|
| 2026-04-28 | Nathan | Health Check | ⏳ | To be completed |
| | | Email System | ⏳ | To be completed |
| | | WhatsApp | ⏳ | To be completed |
| | | Pages QA | ⏳ | To be completed |
| | | Performance | ⏳ | To be completed |

---

## 🎯 LAUNCH GO/NO-GO DECISION

**Ready to launch when:**
- ✅ All critical blockers resolved
- ✅ 6+ QA pages verified working
- ✅ No crashes in 1 hour of testing
- ✅ Email & WhatsApp both operational

**Estimated Timeline:** 2-3 hours testing → Launch ready

---

**Next Steps:**
1. Execute tests in order (Health → Email → WhatsApp → Pages → Performance)
2. Mark each as ✅ PASS, ⚠️ ISSUES, or ❌ FAIL
3. Report results below
4. Fix any blockers
5. Once all ✅, WAFlow is production-ready!
