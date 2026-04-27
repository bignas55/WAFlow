# 🚀 BibleGuide Bot - 3-Minute Quick Fix

## TL;DR - Do This Now

### 🎯 Fastest Way (Node.js):
```bash
cd /path/to/v2
node fix-bibleguide-bot.js
npm restart  # or your bot restart command
```

Done! Your bot now shows the BibleGuide age group greeting.

---

## What Was Wrong?

Your bot showed:
```
👋 Hi! I'm here for you. How can I help today?
1️⃣ Request a Prayer
2️⃣ Talk / Chat
...
```

Should show:
```
👋 Welcome to *BibleGuide* 📖🙏
I'm here to help you grow in God's Word every day!

Please choose your age group so I can teach in a way that fits you:

1️⃣ 👶 Kids (6–12)
2️⃣ 👨‍🦱 Teens (13–17)
...
```

---

## What The Script Does:
1. ✅ Updates bot config (enables menu mode, sets greeting)
2. ✅ Deletes old menu items
3. ✅ Adds 5 age group options (Kids, Teens, Young Adults, Adults, Seniors)
4. ✅ Updates system prompt for personalized responses

---

## Alternative: SQL Direct Update

If Node.js doesn't work:
1. Open `BIBLEGUIDE_FIX.sql`
2. Replace `YOUR_TENANT_ID` with `1` (or your tenant ID)
3. Run it in your database tool
4. Restart bot

---

## Test It:
1. Send "hello" to bot on WhatsApp
2. See age group menu ✅
3. Select age group (1-5)
4. Get personalized responses ✅

---

## 🆘 If It Still Doesn't Work:
- Check logs: `npm run check-db`
- Verify changes were saved: `SELECT * FROM botMenuOptions WHERE tenantId = 1;`
- Restart bot properly
- See full guide: `BIBLEGUIDE_SETUP.md`

That's it! 🎉
