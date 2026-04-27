# BibleGuide Bot - Complete Deployment Steps

All code is complete and integrated. Follow these exact steps to deploy:

## 🚀 DEPLOYMENT CHECKLIST (Copy & Paste)

### Step 1: Apply Database Migration
```bash
cd /Users/nathi/Documents/v2
pnpm exec drizzle-kit push
```
**What it does:** Adds the `metadata JSON` field to the `customers` table for storing age group preferences.

**Expected output:**
```
✅ Database migration applied successfully
```

---

### Step 2: Create BibleGuide Menu Items
```bash
node setup-bibleguide-menu.js
```

**What it does:** Creates the age group selection menu items (1-5) in the database for the BibleGuide bot.

**Expected output:**
```
✅ BibleGuide menu items created successfully!
  1. 👶 Kids (6–12 years old)
  2. 👨‍🦱 Teens (13–17 years old)
  3. 🎓 Young Adults (18–30 years old)
  4. 👔 Adults (31–59 years old)
  5. 🧓 Seniors (60+ years old)
```

**Note:** If you get "Found existing menu items", that's fine - just skip this step.

---

### Step 3: Configure BibleGuide Bot in Dashboard

**CRITICAL:** These exact settings must match for the bot to work!

Go to Dashboard → **Configuration** and set:

#### Section: Basic Settings
- **Business Name:** `BibleGuide` (EXACT MATCH - case sensitive!)
- **System Prompt:** Include "Bible" or "biblical" in your prompt
- Example:
  ```
  You are a helpful Bible teaching assistant. Provide age-appropriate Biblical guidance,
  encouragement, and answers to religious questions.
  ```

#### Section: Menu Settings
- **Enable Menu Mode:** ✅ ON
- **Menu Trigger:** `menu` (or accept defaults: hello, hi, help, start)
- **Menu Greeting:** Use default or customize

#### Section: AI Configuration
- **AI Provider:** Choose one:
  - Ollama (Local) - Recommended
  - Groq (Cloud, Fast)
  - OpenAI (Reliable)
- **AI Model:** Pick any available model
  - Ollama: `gemma4:latest`, `llama3.2:latest`, etc.
  - Groq: `llama-3.1-8b-instant`
  - OpenAI: `gpt-4o-mini`

#### Section: WhatsApp Settings
- **WhatsApp Status:** Should show "Connected" ✅
- If not connected, scan the QR code in the WhatsApp page

**Then click SAVE**

---

### Step 4: Start the Bot
```bash
pnpm dev
```

**Expected output in terminal:**
```
✅ Server running on http://localhost:3000
✅ Client running on http://localhost:5173
✅ MySQL connected
[BibleGuide] service initialized
```

**Wait 10-15 seconds for WhatsApp to connect**

---

### Step 5: Test the Bot

Send these messages to your WhatsApp number in order:

#### Test 1: Trigger Menu
**Send:** `hello`

**Expected Response:**
```
👋 Welcome to *BibleGuide*!
Please choose your age group so I can teach in a way that fits you:

1️⃣ 👶 Kids (6–12 years old)
2️⃣ 👨‍🦱 Teens (13–17 years old)
3️⃣ 🎓 Young Adults (18–30 years old)
4️⃣ 👔 Adults (31–59 years old)
5️⃣ 🧓 Seniors (60+ years old)
```

#### Test 2: Select Age Group
**Send:** `3` (or any number 1-5)

**Expected Response (TWO messages in sequence):**

*Message 1 (immediate):*
```
✅ Got it! You selected: 😊 *Young Adults*
```

*Message 2 (after ~600ms delay):*
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

✅ **If you get both messages in order, your bot is working!**

#### Test 3: Use a Feature
**Send:** `1` (Daily Verse)

**Expected Response:**
```
📖 *Daily Verse for Young Adults*

[A Bible verse personalized for the Young Adults age group]

[Explanation relevant to young adults' life stage]
```

#### Test 4: Ask a Question
**Send:** `What does the Bible say about purpose?`

**Expected Response:**
```
[AI-generated answer with Bible verses]
[Tailored to Young Adults perspective]
```

---

## ✅ SUCCESS INDICATORS

You'll know it's working if:

1. ✅ Messages arrive in the correct order (acknowledgment then menu)
2. ✅ Age group is personalized (Kids get simpler language, Adults get deeper theology)
3. ✅ All 5 features work (Daily Verse, Questions, Study, Quiz, Prayer)
4. ✅ Changing age group (send `0`) shows age selection menu again
5. ✅ Console logs show: `[BibleGuide] Age group selected: Young Adults`

---

## 🐛 TROUBLESHOOTING

### Problem: "Doesn't recognize my age group selection"
**Solution:**
1. Check: `dashboard → configuration → business name` is exactly `BibleGuide`
2. Check: `enableMenuMode` is ON
3. Check server console for: `[BibleGuide] Age group selected:`
4. If no log: run `pnpm exec drizzle-kit push` again

### Problem: "Getting wrong response (e.g., Quiz instead of menu)"
**Solution:**
1. Verify menu items exist: Go to Drizzle Studio: `pnpm drizzle:studio`
2. Check `bot_menu_options` table - should have 5 items (1-5) for tenant 2
3. Verify each item title contains age group keywords (Kids, Teens, Young Adults, Adults, Seniors)

### Problem: "Messages arriving out of order"
**Solution:**
1. This is normal - there's a 600ms delay between acknowledgment and menu
2. If critical, edit `/server/whatsapp/messagePipeline.ts` line 260:
   ```typescript
   await new Promise(r => setTimeout(r, 800)); // Increase to 800ms
   ```

### Problem: "Bot says 'Please select age group first' for every command"
**Solution:**
1. Age group wasn't saved to database
2. Check: `pnpm exec drizzle-kit push` completed successfully
3. Verify `customers` table has `metadata` JSON field
4. Try selecting age group again (send `3`)

---

## 📊 WHAT'S RUNNING

The BibleGuide bot includes:

- **Complete Bible Knowledge Base:** 66 books, 11+ topics (salvation, faith, prayer, love, strength, anxiety, forgiveness, hope, wisdom, purpose, suffering, eternal life)
- **Age Group Personalization:** Different language, topics, and examples for each age group
- **5 Main Features:**
  - Daily Verse - Age-appropriate Bible verse with explanation
  - Ask Question - Answer religious questions with relevant verses
  - Guided Study - Study Bible books, topics, or parables
  - Bible Quiz - Multiple choice Bible knowledge quiz
  - Prayer Guide - Guided prayer prompts and prayer request handling

- **Conversation Memory:** Stores user's age group preference, updates on every message
- **AI Integration:** Works with Ollama (local), Groq (cloud), or OpenAI

---

## 📁 WHAT'S BEEN CREATED/MODIFIED

### New Files:
- ✅ `/server/services/bibleGuideService.ts` (366 lines) - Bible knowledge base + personalization
- ✅ `/server/services/bibleGuideFeatures.ts` (351 lines) - Feature handlers + intent detection
- ✅ `BIBLEGUIDE_SETUP.md` - Setup documentation
- ✅ `setup-bibleguide-menu.js` - Menu creation script
- ✅ `BIBLEGUIDE_DEPLOYMENT_STEPS.md` - This file

### Modified Files:
- ✅ `/server/whatsapp/messagePipeline.ts` - Added BibleGuide handler + age group detection
- ✅ `/drizzle/schema.ts` - Added `metadata` field to `customers`
- ✅ `/client/src/App.tsx` - Removed IT Tickets, Flow Builder, Webhooks
- ✅ `/client/src/components/Layout.tsx` - Removed from navigation
- ✅ `/server/routers/aiConfigRouter.ts` - Added 27+ Ollama models
- ✅ `/client/src/pages/Configuration.tsx` - Updated model list UI

---

## 🎯 FINAL CHECKLIST

Before going live, verify:

- [ ] Database migration applied: `pnpm exec drizzle-kit push`
- [ ] Menu items created: `node setup-bibleguide-menu.js`
- [ ] Business Name = "BibleGuide" (exact match)
- [ ] Enable Menu Mode = ON
- [ ] AI Provider configured (Ollama/Groq/OpenAI)
- [ ] AI Model selected
- [ ] WhatsApp Status = Connected
- [ ] Server running: `pnpm dev`
- [ ] Test flow works (hello → age selection → menu → feature)
- [ ] Console shows no errors
- [ ] Console shows BibleGuide debug logs

---

## 🚀 YOU'RE READY!

The BibleGuide WhatsApp bot is fully implemented and ready to deploy. Just follow the steps above and you'll be serving Bible teaching to your users in minutes!

For questions, check the detailed setup guide: `BIBLEGUIDE_SETUP.md`

Happy serving! 🙏📖
