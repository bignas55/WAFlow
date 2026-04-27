/**
 * itKnowledgeBase.ts
 * Structured decision-tree flows and knowledge base for the IT Support Assistant.
 * Each category has:
 *  - A list of sequential diagnostic questions
 *  - A knowledge base of known causes + fix steps used to seed the AI prompt
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ITCategory = "internet" | "device" | "login" | "other";

export interface ITStep {
  key: string;       // answer is stored under this key in session.answers
  question: string;  // WhatsApp-formatted question text
}

export interface KBEntry {
  condition: (answers: Record<string, string>) => boolean;
  causes: string[];
  fixSteps: string[];
  priority: "low" | "medium" | "high";
}

// ── Decision-tree questions per category ──────────────────────────────────────

export const IT_FLOWS: Record<ITCategory, ITStep[]> = {

  internet: [
    {
      key: "connection_type",
      question:
        `🌐 *Internet Troubleshooting — Step 1 of 5*\n\n` +
        `Are you connected via *WiFi* or a *cable (LAN)*?\n\n` +
        `Reply: *WiFi* or *Cable*`,
    },
    {
      key: "other_devices",
      question:
        `📱 *Step 2 of 5*\n\n` +
        `Are other devices on the same network also having issues?\n\n` +
        `Reply: *Yes* or *No*`,
    },
    {
      key: "router_lights",
      question:
        `💡 *Step 3 of 5*\n\n` +
        `Look at your router/modem. What do the lights look like?\n\n` +
        `*A* — All green ✅\n` +
        `*B* — Some red or orange ❌\n` +
        `*C* — Lights are off 🔴\n` +
        `*D* — Flashing irregularly ⚠️`,
    },
    {
      key: "restarted_router",
      question:
        `🔄 *Step 4 of 5*\n\n` +
        `Have you tried unplugging the router, waiting 30 seconds, and plugging it back in?\n\n` +
        `Reply: *Yes* or *No*`,
    },
    {
      key: "internet_state",
      question:
        `📶 *Step 5 of 5*\n\n` +
        `Is the internet completely down or just very slow/intermittent?\n\n` +
        `Reply: *Completely down* or *Slow / Dropping*`,
    },
  ],

  device: [
    {
      key: "device_type",
      question:
        `💻 *Device Troubleshooting — Step 1 of 5*\n\n` +
        `What type of device is having the problem?\n\n` +
        `*A* — Windows PC / Laptop\n` +
        `*B* — Mac / MacBook\n` +
        `*C* — iPhone / iPad\n` +
        `*D* — Android phone / tablet\n` +
        `*E* — Printer / Scanner`,
    },
    {
      key: "issue_type",
      question:
        `🔧 *Step 2 of 5*\n\n` +
        `What is the main problem?\n\n` +
        `*A* — Won't turn on at all\n` +
        `*B* — Running very slowly\n` +
        `*C* — Keeps crashing or freezing\n` +
        `*D* — Screen issue (blank, flickering)\n` +
        `*E* — Other`,
    },
    {
      key: "when_started",
      question:
        `⏱️ *Step 3 of 5*\n\n` +
        `When did this problem start?\n\n` +
        `*A* — Just now (first time)\n` +
        `*B* — Earlier today\n` +
        `*C* — A few days ago\n` +
        `*D* — A week or more ago`,
    },
    {
      key: "recent_changes",
      question:
        `🔄 *Step 4 of 5*\n\n` +
        `Did anything change just before the problem started?\n\n` +
        `*A* — Software or system update\n` +
        `*B* — New app or program installed\n` +
        `*C* — Device was dropped or got wet\n` +
        `*D* — Power outage / power surge\n` +
        `*E* — Nothing changed that I know of`,
    },
    {
      key: "restarted_device",
      question:
        `🔄 *Step 5 of 5*\n\n` +
        `Have you tried restarting the device?\n\n` +
        `Reply: *Yes* or *No*`,
    },
  ],

  login: [
    {
      key: "system",
      question:
        `🔐 *Login Troubleshooting — Step 1 of 4*\n\n` +
        `Which system or app are you unable to access?\n\n` +
        `*A* — Company email\n` +
        `*B* — Microsoft 365 / Office\n` +
        `*C* — VPN\n` +
        `*D* — Company system or internal app\n` +
        `*E* — Other`,
    },
    {
      key: "error_type",
      question:
        `⚠️ *Step 2 of 4*\n\n` +
        `What happens when you try to log in?\n\n` +
        `*A* — Incorrect password error\n` +
        `*B* — Account is locked\n` +
        `*C* — Not receiving OTP / verification code\n` +
        `*D* — Page or app won't load\n` +
        `*E* — Other`,
    },
    {
      key: "tried_reset",
      question:
        `🔁 *Step 3 of 4*\n\n` +
        `Have you tried resetting your password?\n\n` +
        `Reply: *Yes* or *No*`,
    },
    {
      key: "all_devices",
      question:
        `📱 *Step 4 of 4*\n\n` +
        `Is this happening on just one device or on all your devices?\n\n` +
        `Reply: *One device* or *All devices*`,
    },
  ],

  other: [
    {
      key: "description",
      question:
        `📝 *IT Support — Step 1 of 3*\n\n` +
        `Please describe your issue in a few words:`,
    },
    {
      key: "duration",
      question:
        `⏱️ *Step 2 of 3*\n\n` +
        `How long has this been happening?\n\n` +
        `*A* — Just started\n` +
        `*B* — A few hours\n` +
        `*C* — A few days\n` +
        `*D* — A week or more`,
    },
    {
      key: "work_impact",
      question:
        `💼 *Step 3 of 3*\n\n` +
        `Is this preventing you from doing your work?\n\n` +
        `Reply: *Yes* or *No*`,
    },
  ],
};

// ── Knowledge base — used to help the AI identify likely causes ───────────────

export const IT_KNOWLEDGE_BASE = {

  internet: [
    {
      condition: (a) => a.router_lights === "C" || a.router_lights?.toLowerCase().includes("off"),
      causes: ["Router is not powered on", "Power outage", "Loose power cable"],
      fixSteps: [
        "Check that the router power cable is securely plugged in.",
        "Check the power outlet — try a different one.",
        "Press the power button on the router if it has one.",
        "Wait 2 minutes after powering on before testing the connection.",
      ],
      priority: "high" as const,
    },
    {
      condition: (a) => a.router_lights === "B" || a.router_lights?.toLowerCase().includes("red"),
      causes: ["ISP (Internet Service Provider) outage", "Router firmware issue", "WAN port failure"],
      fixSteps: [
        "Unplug the router power for 30 seconds, then plug it back in.",
        "Wait 2–3 minutes for it to fully restart.",
        "If red lights persist, contact your ISP — there may be an outage in your area.",
        "Check your ISP's website or app for outage reports.",
      ],
      priority: "high" as const,
    },
    {
      condition: (a) => a.other_devices === "No" && a.connection_type?.toLowerCase() === "wifi",
      causes: ["WiFi adapter issue on this device", "Device not properly connected to WiFi", "IP address conflict"],
      fixSteps: [
        "Turn WiFi off and back on on your device.",
        "Forget the WiFi network and reconnect — re-enter the password.",
        "Try connecting on a different WiFi network (e.g. mobile hotspot) to see if the device works.",
        "Update your device's network drivers (Windows: Device Manager → Network Adapters).",
      ],
      priority: "medium" as const,
    },
    {
      condition: (a) => a.internet_state?.toLowerCase().includes("slow"),
      causes: ["Network congestion", "ISP throttling", "Too many devices on the network", "Router overheating"],
      fixSteps: [
        "Restart your router (unplug for 30 seconds).",
        "Disconnect unused devices from the WiFi network.",
        "Move closer to the router or use a cable for better speed.",
        "Run a speed test at fast.com to confirm the speed issue.",
        "Contact your ISP if speeds are consistently below your plan speed.",
      ],
      priority: "medium" as const,
    },
  ] as KBEntry[],

  device: [
    {
      condition: (a) => a.issue_type === "A",
      causes: ["Dead battery (laptops)", "Failed power supply", "Hardware failure", "Corrupted boot files"],
      fixSteps: [
        "For laptops: plug in the charger and wait 5 minutes before trying to power on.",
        "For desktops: check that the power cable is securely connected.",
        "Hold the power button for 10 seconds to force reset.",
        "Try a different power outlet.",
        "If still not turning on, this may need hardware repair — escalate.",
      ],
      priority: "high" as const,
    },
    {
      condition: (a) => a.issue_type === "B",
      causes: ["Low storage space", "Too many startup programs", "Malware or virus", "Outdated drivers", "Overheating"],
      fixSteps: [
        "Restart the device first.",
        "Check storage — delete files or apps you don't need.",
        "Run a virus/malware scan (Windows Defender or Malwarebytes free version).",
        "Close unnecessary background apps and browser tabs.",
        "Check if a system update is pending — install and restart.",
      ],
      priority: "medium" as const,
    },
    {
      condition: (a) => a.issue_type === "C",
      causes: ["RAM or storage issues", "Driver conflicts", "Overheating", "Corrupt system files"],
      fixSteps: [
        "Restart the device.",
        "Check for and install system updates.",
        "Run Windows Memory Diagnostic (search in Start menu).",
        "Check the device's ventilation — make sure it's not overheating.",
        "If crashing with a specific app, try reinstalling that app.",
      ],
      priority: "medium" as const,
    },
    {
      condition: (a) => a.recent_changes === "C",
      causes: ["Physical damage from drop or liquid", "Internal hardware damage"],
      fixSteps: [
        "Do not attempt to charge a wet device.",
        "If dropped: restart and check for obvious damage.",
        "Back up your data immediately if the device still works.",
        "This likely requires physical repair — escalate.",
      ],
      priority: "high" as const,
    },
  ] as KBEntry[],

  login: [
    {
      condition: (a) => a.error_type === "B",
      causes: ["Too many failed login attempts", "IT policy auto-lock", "Suspicious activity detected"],
      fixSteps: [
        "Wait 15–30 minutes and try again — some systems auto-unlock.",
        "Use the 'Forgot Password' or 'Unlock Account' link.",
        "Contact IT admin to manually unlock your account.",
        "Do not keep attempting to log in — this extends the lockout.",
      ],
      priority: "high" as const,
    },
    {
      condition: (a) => a.error_type === "C",
      causes: ["OTP going to spam", "Wrong phone number on file", "SMS delivery issue", "Authenticator app not synced"],
      fixSteps: [
        "Check your spam/junk email folder.",
        "Make sure your registered phone number is correct.",
        "If using an authenticator app, check that the time is synced on your phone.",
        "Try using a backup code if available.",
        "Contact IT to verify your registered contact details.",
      ],
      priority: "medium" as const,
    },
    {
      condition: (a) => a.error_type === "A" && a.tried_reset === "No",
      causes: ["Forgotten password", "Caps lock on", "Saved incorrect password in browser"],
      fixSteps: [
        "Check that Caps Lock is turned off.",
        "Try the 'Forgot Password' link to reset your password.",
        "Clear your browser's saved passwords for this site and try manually.",
        "Use an incognito/private browser window to rule out browser issues.",
      ],
      priority: "low" as const,
    },
    {
      condition: (a) => a.all_devices === "All devices",
      causes: ["Account suspended or deactivated", "IT policy change", "License expired"],
      fixSteps: [
        "This suggests the issue is account-level, not device-level.",
        "Contact IT admin immediately — your account may need to be reactivated.",
        "Check if you received any email about your account status.",
      ],
      priority: "high" as const,
    },
  ] as KBEntry[],

  other: [
    {
      condition: (a) => a.work_impact === "Yes",
      causes: ["Unknown — requires further investigation"],
      fixSteps: [
        "Document exactly what is happening (screenshots if possible).",
        "Note when it started and any error messages you see.",
        "Restart the affected device/application.",
        "An IT technician will be in touch shortly.",
      ],
      priority: "high" as const,
    },
    {
      condition: (a) => a.work_impact === "No",
      causes: ["Minor issue — requires investigation"],
      fixSteps: [
        "Document exactly what is happening.",
        "Note any error messages you see.",
        "An IT technician will review and follow up.",
      ],
      priority: "low" as const,
    },
  ] as KBEntry[],
};
