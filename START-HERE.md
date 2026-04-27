# 🚀 WAFlow Complete Setup - Start Here

**Everything is automated. Just follow these 3 simple steps.**

---

## Step 1: Run the Setup Script

Open Terminal and run this ONE command:

```bash
cd ~/Documents/v2
chmod +x setup-everything.sh
./setup-everything.sh
```

That's it! The script will:
- ✅ Check everything is installed
- ✅ Install Cloudflare CLI
- ✅ Create free public domain
- ✅ Set up auto-start
- ✅ Configure everything

---

## Step 2: Create Free Cloudflare Account (Browser Opens Automatically)

When prompted:
1. A browser window opens to Cloudflare
2. Click "Create account" (it's FREE)
3. Enter email & password
4. Click "Authorize"
5. Come back to Terminal

Done! ✓

---

## Step 3: Access Your Server

After setup completes, you'll see:

```
Your Public URL:
   https://waflow-abc123.cfargotunnel.com
```

That's your 24/7 public server! 🎉

Access from:
- Your phone
- Another computer
- Any device, anywhere in the world

---

## What Got Set Up?

✅ **Free Public Domain** - Accessible worldwide via HTTPS  
✅ **Auto-Start** - Runs automatically when Mac boots  
✅ **Auto-Restart** - If service crashes, it restarts automatically  
✅ **Background Service** - Runs 24/7 even if you close Terminal  
✅ **Logging** - All logs saved to `/var/log/waflow.log`  

---

## After Setup - Start the Services

Two terminals needed:

**Terminal 1 - Start Docker Services:**
```bash
cd ~/Documents/v2
./start-local.sh
```

**Terminal 2 - Start Tunnel:**
```bash
cloudflared tunnel run waflow
```

Then access: **Your public URL from above**

---

## Useful Commands

```bash
# View logs
tail -f /var/log/waflow.log

# Check status
./check-status.sh

# Stop everything
./stop-local.sh

# Stop just the tunnel
# Press Ctrl+C in Terminal 2
```

---

## Done! 

Your WAFlow platform is now:
- ✅ Running 24/7
- ✅ Publicly accessible
- ✅ Auto-starting on Mac boot
- ✅ Auto-restarting if crashes

Login: `admin@waflow.com` / `admin123`
(Change password immediately in Settings → Profile)

---

**Need help?** See full documentation in:
- `24-7-SETUP-GUIDE.md` - Complete guide
- `PRODUCTION_SETUP.md` - Detailed instructions
- `LOCAL_SETUP.md` - Local development

