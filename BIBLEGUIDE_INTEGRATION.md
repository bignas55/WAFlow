# BibleGuide Bot - Complete Integration Guide

## Overview
BibleGuide is a comprehensive WhatsApp Bible teaching assistant with age-appropriate personalization (Kids, Teens, Young Adults, Adults, Seniors). It includes:
- Daily Verse & Devotionals
- Bible Question Answering (with verse citations)
- Guided Study (books, topics, parables)
- Bible Quiz
- Prayer Guide
- Full Bible Knowledge Base (66 books, doctrines, parables, miracles, Ten Commandments)

---

## Files Created / Modified

### New Files
1. **`/server/services/bibleGuideService.ts`**
   - Complete Bible Knowledge Base with verses organized by topic
   - Age group detection, storage, and personalization
   - System prompts customized per age group
   - Utility functions for welcome messages, main menu, daily verse

2. **`/server/services/bibleGuideFeatures.ts`**
   - Feature handlers: Daily Verse, Ask Question, Study, Quiz, Prayer
   - Age group retrieval from customer memory
   - Intent detection for routing user input
   - Enhanced system prompt generation

### Modified Files
None - The messagePipeline.ts already has basic BibleGuide menu handling. The new services are ready to integrate with minimal changes.

---

## Integration into Message Pipeline

The messagePipeline.ts will call the new services when a BibleGuide bot receives customer messages. Here's how:

### Step 1: Import the new services
Add to `messagePipeline.ts` (after existing imports):
```typescript
import {
  isBibleGuideBusiness,
  handleBibleGuideFeature,
  getCustomerAgeGroup,
  getBibleGuideEnhancedPrompt,
} from "../services/bibleGuideFeatures.js";
```

### Step 2: Add BibleGuide feature detection in the AI pipeline
In the main `processWhatsAppWebhook` function (around line 400-450, in the AI response section):

```typescript
// ── BibleGuide Feature Handler ────────────────────────────────────────
if (isBibleGuideBusiness(config.businessName)) {
  const bibleGuideResponse = await handleBibleGuideFeature(msg.phoneNumber, msg.messageText);
  
  if (bibleGuideResponse) {
    // Feature handled - send response directly
    await sendMessage(msg.tenantId, msg.phoneNumber, bibleGuideResponse, false, msg.chatId);
    await db.insert(conversations).values({
      tenantId: msg.tenantId,
      phoneNumber: msg.phoneNumber,
      contactName: msg.contactName,
      message: msg.messageText,
      response: bibleGuideResponse,
      source: "bibleguide",
    });
    return; // Stop here - feature handled completely
  }
}
// ──────────────────────────────────────────────────────────────────────
```

### Step 3: Enhance AI system prompt for BibleGuide
When building the system prompt (search for `getSystemPrompt` or similar in messagePipeline):

```typescript
let systemPrompt = config.systemPrompt || "You are a helpful assistant.";

if (isBibleGuideBusiness(config.businessName)) {
  const ageGroup = await getCustomerAgeGroup(msg.phoneNumber);
  systemPrompt = getBibleGuideEnhancedPrompt(systemPrompt, ageGroup);
}
```

---

## Database Configuration

The bot configuration needs to be set in the `bot_config` table:

```sql
UPDATE bot_config
SET
  business_name = 'BibleGuide',
  enable_menu_mode = 1,
  menu_trigger = 'menu',
  menu_greeting = '👋 Welcome to *BibleGuide* 📖🙏\nI\'m here to help you grow in God\'s Word every day!\n\nPlease choose your age group so I can teach in a way that fits you:',
  system_prompt = 'You are BibleGuide, a warm and knowledgeable WhatsApp Bible teaching assistant...'
WHERE tenant_id = 2;
```

The age group menu items should already be configured via the fix scripts.

---

## Age Group System

### Age Groups
1. **Kids (6-12)** - 👶
   - Very simple words, short sentences, lots of emojis
   - Relates to school, friends, family, animals
   - Responses under 100 words
   - Ends with: "Your challenge today: [action]"

2. **Teens (13-17)** - 👨‍🦱
   - Modern, relatable language
   - Connects to identity, pressure, social media, friendships
   - Responses under 150 words
   - Ends with: "Think about this: [question]"

3. **Young Adults (18-30)** - 🎓
   - Mature, thoughtful language
   - Covers career, relationships, purpose, faith doubts
   - Responses under 200 words
   - Ends with: "Apply this today: [action]"

4. **Adults (31-59)** - 👔
   - Theological depth and wisdom
   - Covers family, marriage, parenting, work, community
   - Responses under 250 words
   - Ends with: "Reflect & Pray: [prompt]"

5. **Seniors (60+)** - 👴
   - Warm, reverent, dignified language
   - Focuses on legacy, gratitude, eternal hope, comfort
   - Responses under 200 words
   - Ends with: "A blessing for you: [blessing]"

---

## Features Overview

### 1. Daily Verse & Devotional
- Provides a random verse from the knowledge base
- Includes full reference (e.g., "John 3:16 NIV")
- Age-appropriate explanation
- Personalized ending prompt

**User Input:** "verse", "devotional", "daily"
**Response Type:** Verse with context and application

### 2. Ask a Bible Question
- Detects question intent from keywords
- Maps to relevant topics (Salvation, Faith, Prayer, Love, Strength, etc.)
- Provides 4-5 key verses on that topic with explanations

**User Input:** "How do I...", "Why does...", "What about..."
**Response Type:** Verses with explanations

### 3. Guided Study
- Options to study by book, topic, parable, or commandment
- Shows all 66 Bible books
- Explores biblical themes in depth
- Includes parable summaries with lessons

**User Input:** "study", "Genesis", "parable", "commands"
**Response Type:** Book summaries, topic deep-dives, or parable lessons

### 4. Bible Quiz
- Tests knowledge with multiple-choice questions
- Questions from the knowledge base
- Covers Bible facts, parables, characters, doctrines

**User Input:** "quiz", "test", "knowledge"
**Response Type:** Question with options

### 5. Prayer Guide
- Guides users through prayer experiences
- Prayer topics: intercession, suffering, thanksgiving, peace, strength
- Can also store prayer requests and build prayer wall

**User Input:** "pray", "prayer", "pray for"
**Response Type:** Prayer guide options or prayer prompt

---

## Testing Checklist

After deployment, test these flows:

- [ ] **Greeting & Age Selection**
  - Send "hello" → see BibleGuide welcome
  - Send "1" → see Kids selection confirmation
  - Send "4" → see Adults selection confirmation

- [ ] **Daily Verse**
  - Send "verse" → receive verse with reference
  - Verify age-appropriate language and length
  - Verify ending prompt matches age group

- [ ] **Ask Question**
  - Send "How do I have faith?" → receive verses on Faith
  - Send "What about prayer?" → receive verses on Prayer
  - Verify verse references are correct (e.g., "John 3:16 NIV")

- [ ] **Bible Quiz**
  - Send "quiz" → receive multiple choice question
  - Verify questions are appropriate for age group

- [ ] **Prayer Guide**
  - Send "prayer" → see prayer guide options

- [ ] **Guided Study**
  - Send "study" → see study options
  - Send "Matthew" → receive Matthew summary

- [ ] **Age Group Switching**
  - Send "0" or "change age group" → go back to age selection
  - Select different age group → verify new age group is stored

---

## Deployment Steps

1. **Copy the new service files:**
   - `bibleGuideService.ts` to `/server/services/`
   - `bibleGuideFeatures.ts` to `/server/services/`

2. **Update messagePipeline.ts** with imports and feature detection

3. **Ensure database is configured:**
   - Bot config table has `business_name = 'BibleGuide'`
   - Menu items are set up for age group selection

4. **Restart the bot:**
   ```bash
   npm run dev
   ```

5. **Test the bot:**
   - Send "hello" to trigger age selection
   - Select an age group
   - Test all features (daily verse, quiz, prayer, etc.)

---

## Knowledge Base Contents

The service includes:

- **All 66 Bible Books:** Summaries and key themes (OT + NT)
- **Key Verses by Topic:** 60+ verses organized by life topics
  - Salvation, Faith, Prayer, Love, Strength, Anxiety, Forgiveness, Hope, Wisdom, Purpose, Suffering, Eternal Life
- **Major Doctrines:** Trinity, Deity of Christ, Salvation, Resurrection, Holy Spirit
- **Parables:** 15+ parables with lessons
- **Miracles:** 40+ miracles categorized (healing, nature, deliverance, resurrection)
- **Bible Characters:** 15+ key figures (Adam, Noah, Abraham, Moses, David, Jesus, Paul, etc.)
- **The Sermon on the Mount:** Beatitudes + 15 key teachings
- **Fruit of the Spirit & Armor of God:** Complete lists with definitions
- **The Ten Commandments:** All 10 with explanations
- **Messianic Prophecies:** 15+ OT prophecies fulfilled by Jesus
- **Bible Timeline:** Creation to Second Coming
- **The "I AM" Statements:** Jesus' 7 divine declarations
- **Glossary:** 30+ theological terms

---

## Next Steps

1. ✅ **bibleGuideService.ts** - Created with complete knowledge base
2. ✅ **bibleGuideFeatures.ts** - Created with all feature handlers
3. ⏳ **Integrate into messagePipeline.ts** - Use imports & feature detection above
4. ⏳ **Test bot thoroughly** - Run through testing checklist
5. ⏳ **Deploy to production** - npm run build && restart bot

---

## Support

If you encounter issues:

1. Check that `business_name` is set to "BibleGuide" in bot_config
2. Verify menu items exist (run diagnose-bot-issue.js)
3. Check logs for import errors in messagePipeline.ts
4. Ensure age group is stored in customer metadata

---

**BibleGuide Bot** is now ready to transform lives through Scripture! 📖✨
