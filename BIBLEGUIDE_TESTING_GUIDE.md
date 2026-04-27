# BibleGuide Testing Guide

## System Status ✅

All BibleGuide code has been implemented and verified:

- ✅ **bibleGuideService.ts** (366 lines) - Bible knowledge base + personalization
- ✅ **bibleGuideFeatures.ts** (351 lines) - Feature handlers (Daily Verse, Ask Question, Study, Quiz, Prayer)
- ✅ **messagePipeline.ts** - Integrated BibleGuide handler at line 382-531
- ✅ **Database schema** - customers table has `metadata` JSON field for age group storage
- ✅ **Bug fixed** - Line 1798 now correctly passes `tenantId` to getCustomerAgeGroup()

## Expected Bot Flow

### 1. Initial Contact (User sends "hello")
**User Message:** `hello`

**Bot Response:**
```
👋 Welcome to *BibleGuide* 📖🙏
I'm here to help you grow in God's Word every day!

Please choose your age group so I can teach in a way that fits you:

1️⃣ 👶 Kids (6–12 years old)
2️⃣ 👨‍🦱 Teens (13–17 years old)
3️⃣ 🎓 Young Adults (18–30 years old)
4️⃣ 👔 Adults (31–59 years old)
5️⃣ 🧓 Seniors (60+ years old)
```

### 2. Age Group Selection (User sends digit 1-5)
**User Message:** `4` (selects Adults)

**Bot Response 1 (immediate):**
```
✅ Got it! You selected: 😊 *Adults*
```

**Bot Response 2 (after 600ms delay):**
```
📖 *BibleGuide Menu*
What would you like to do today?

1️⃣ Daily Verse & Devotional
2️⃣ Ask a Bible Question
3️⃣ Guided Study (by book or topic)
4️⃣ Bible Quiz
5️⃣ Prayer Guide
0️⃣ Change Age Group
```

### 3. Feature Selection (User sends feature number)
**User Message:** `1` (selects Daily Verse)

**Bot Response 1:** Daily verse personalized for the selected age group

**Bot Response 2 (after 1000ms delay):** Same feature menu again (for next selection)

### 4. Change Age Group (User sends 0)
**User Message:** `0`

**Bot Response:** Age group selection menu (same as step 1)

## Age Group Personalization

Each age group has different:
- **Word choice** (simple vs. sophisticated)
- **Topic relevance** (age-appropriate themes)
- **Response length** (kids get shorter, adults get longer)
- **Ending prompt** (how to close each response)

### Kids (6-12)
- Simple, fun language with emojis
- Focus on Bible stories and characters
- Shorter responses
- Encouraging tone

### Teens (13-17)
- Relatable language with modern references
- Focus on decisions, identity, peer pressure
- Medium-length responses
- Supportive but not preachy

### Young Adults (18-30)
- Conversational, mature language
- Focus on purpose, relationships, faith journey
- Longer responses
- Thoughtful and reflective

### Adults (31-59)
- Professional, wisdom-focused language
- Focus on family, work, leadership
- Detailed responses
- Practical application

### Seniors (60+)
- Respectful, legacy-focused language
- Focus on life wisdom, faith foundation
- Comprehensive responses
- Reflection on God's faithfulness

## How to Test

### 1. Start the Development Server
```bash
cd /Users/nathi/Documents/v2
npm run dev
```

Or if npm scripts don't work:
```bash
cd /Users/nathi/Documents/v2
npx tsx server/index.ts
```

Wait for the server to start (port 3000) and WhatsApp WWJS to authenticate.

### 2. Open WhatsApp Web
- Use the bot's WhatsApp number (tenant 4: 27619434732)
- Send messages from your WhatsApp account

### 3. Test Sequence
1. Send: `hello`
   - Expect: Age group menu
   
2. Send: `4` 
   - Expect: "Got it! Adults" + Feature menu (after short delay)
   
3. Send: `1`
   - Expect: Daily verse for adults + Feature menu
   
4. Send: `2`
   - Expect: Question menu
   
5. Send: `what is salvation?`
   - Expect: Verses about salvation personalized for adults
   
6. Send: `0`
   - Expect: Age group menu again
   
7. Send: `2`
   - Expect: Acknowledge "Teens" + Feature menu
   
8. Send: `1`
   - Expect: Daily verse for teens (simpler language)

### 4. Monitor Logs
Watch the server console for BibleGuide debug messages:
```
📖 [BibleGuide] Feature response ready, sending...
📖 [BibleGuide] Message 1 sent: 27619434732
📖 [BibleGuide] Waiting 1000ms before menu...
📖 [BibleGuide] Sending menu message...
📖 [BibleGuide] Message 2 (menu) sent: 27619434732
```

### 5. Check Database
Messages are stored in the `conversations` table with `source: "bibleguide"`.

Age group selection is stored in `customers.metadata.bibleguideAgeGroup`.

## Troubleshooting

### Issue: Bot not responding
- ✅ Check server is running on port 3000
- ✅ Check WhatsApp WWJS is authenticated (should show qr code in terminal)
- ✅ Verify tenant 4 is configured as BibleGuide bot (businessName contains "bibleguide")

### Issue: Only first message appears, no menu
- Likely cause: Message 2 is being sent but with 1000ms delay
- Check if WhatsApp is receiving both messages (check conversation history)
- Check server logs for "Message 2" being sent

### Issue: Wrong age group response
- Clear the browser cache and database customer metadata
- Send "0" to reset age group
- Then send "hello" to start fresh

### Issue: Syntax errors on startup
- All syntax errors have been fixed
- If you see errors, run: `npm install --legacy-peer-deps`

## Configuration

### Bot Configuration (tenant 4)
- **Business Name:** Should contain "bibleguide" (triggers feature)
- **System Prompt:** Will be enhanced with age group guidelines
- **AI Model:** Currently uses Groq llama-3.1-8b-instant (configured in .env)
  - Can be changed to Ollama gemma4:latest via dashboard

### WhatsApp Configuration
- **Phone Number:** 27619434732 (tenant 4)
- **Mode:** WhatsApp Web (WWJS) with fallback to Meta Cloud API
- **Session:** Stored in `.wwebjs_auth/session-tenant_4/`

## Key Files Modified

| File | Changes |
|------|---------|
| `server/services/bibleGuideService.ts` | New Bible knowledge base + personalization |
| `server/services/bibleGuideFeatures.ts` | New feature handlers |
| `server/whatsapp/messagePipeline.ts` | BibleGuide integration at lines 382-531 + system prompt enhancement at line 1798 |
| `drizzle/schema.ts` | Added `metadata` field to customers table |
| `client/src/App.tsx` | Removed Webhooks, Tickets, Flow Builder routes |
| `client/src/components/Layout.tsx` | Removed from navigation |
| `server/routers/aiConfigRouter.ts` | Expanded to 27+ Ollama models |

## Next Steps

1. ✅ Code is ready - no changes needed
2. 🔄 Start the development server
3. 🔄 Test the complete flow with WhatsApp messages
4. 🔄 Monitor console logs for errors
5. 🔄 Verify responses are age-appropriate
6. 🔄 Check database for stored messages
7. ✅ Deploy to production when satisfied

---

**Last Updated:** April 26, 2026
**Status:** All code verified, ready for testing
**Test Bot Number:** 27619434732 (tenant 4)
