/**
 * userFeaturesService.ts
 * File-backed state for: streaks, memory verses, fasting companion,
 * user preferences, prayer wall, and post-session check-ins.
 */

import fs from "fs";
import path from "path";

// ── Helpers ───────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(process.cwd(), "data");

function loadJson<T>(file: string): Record<string, T> {
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return {}; }
}

function saveJson(file: string, data: Record<string, any>): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) { console.warn("⚠️  Could not save:", file, e); }
}

const uk = (tenantId: number, phone: string) => `${tenantId}:${phone}`;

// ── FILE PATHS ─────────────────────────────────────────────────────────────────
const STREAKS_FILE        = path.join(DATA_DIR, "streaks.json");
const MEMORY_FILE         = path.join(DATA_DIR, "memory_verses.json");
const FASTING_FILE        = path.join(DATA_DIR, "fasting.json");
const PREFS_FILE          = path.join(DATA_DIR, "user_prefs.json");
const PRAYER_WALL_FILE    = path.join(DATA_DIR, "prayer_wall.json");
const CHECKINS_FILE       = path.join(DATA_DIR, "post_checkins.json");

// ── STREAKS ───────────────────────────────────────────────────────────────────
export interface StreakState {
  count: number;
  lastActiveDate: string; // "YYYY-MM-DD"
}

export function getStreak(tenantId: number, phone: string): StreakState {
  const data = loadJson<StreakState>(STREAKS_FILE);
  return data[uk(tenantId, phone)] ?? { count: 0, lastActiveDate: "" };
}

/** Call on every meaningful Bible interaction. Returns updated info. */
export function updateStreak(tenantId: number, phone: string): {
  streak: number;
  isNewDay: boolean;
  milestone: boolean;
} {
  const data = loadJson<StreakState>(STREAKS_FILE);
  const k = uk(tenantId, phone);
  const today = new Date().toISOString().slice(0, 10);
  const existing = data[k] ?? { count: 0, lastActiveDate: "" };

  if (existing.lastActiveDate === today) {
    return { streak: existing.count, isNewDay: false, milestone: false };
  }

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const consecutive = existing.lastActiveDate === yesterday;
  const newCount = consecutive ? existing.count + 1 : 1;
  data[k] = { count: newCount, lastActiveDate: today };
  saveJson(STREAKS_FILE, data);

  const milestone = [3, 7, 14, 21, 30, 60, 90, 100, 365].includes(newCount);
  return { streak: newCount, isNewDay: true, milestone };
}

/** WhatsApp-formatted streak milestone message. Returns "" if not a milestone. */
export function streakMilestoneMessage(streak: number): string {
  const messages: Record<number, string> = {
    3:   `🔥 *3-Day Streak!* You're building a beautiful habit. Keep going!`,
    7:   `🔥 *7-Day Streak!* One full week of seeking God's Word — amazing!`,
    14:  `🔥 *14-Day Streak!* Two weeks strong! God is doing something in you. 💪`,
    21:  `🏆 *21-Day Streak!* They say it takes 21 days to form a habit — you've done it!`,
    30:  `🏆 *30-Day Streak!* A whole month of daily faith! You are an inspiration. 🙌`,
    60:  `🏆 *60-Day Streak!* 60 days of seeking God's face. This is real devotion!`,
    90:  `🏅 *90-Day Streak!* Three months of consistent time in the Word. Incredible!`,
    100: `🥇 *100-Day Streak!* 100 days! You are a true champion of faith! 🎉`,
    365: `👑 *365-Day Streak!* ONE FULL YEAR! God is so proud of your dedication. 🙏✨`,
  };
  return messages[streak] ?? "";
}

// ── MEMORY VERSE TRACKER ──────────────────────────────────────────────────────
export interface MemoryVerseState {
  reference: string;    // e.g. "John 3:16"
  text: string;         // full verse text
  startedAt: string;    // ISO
  lastTestedAt: string; // ISO ("" if never)
  testCount: number;
  mastered: boolean;
}

export function getMemoryVerse(tenantId: number, phone: string): MemoryVerseState | undefined {
  const data = loadJson<MemoryVerseState>(MEMORY_FILE);
  return data[uk(tenantId, phone)];
}

export function setMemoryVerse(
  tenantId: number,
  phone: string,
  reference: string,
  text: string,
): void {
  const data = loadJson<MemoryVerseState>(MEMORY_FILE);
  data[uk(tenantId, phone)] = {
    reference, text,
    startedAt: new Date().toISOString(),
    lastTestedAt: "",
    testCount: 0,
    mastered: false,
  };
  saveJson(MEMORY_FILE, data);
}

export function markMemoryVerseTested(tenantId: number, phone: string, mastered: boolean): void {
  const data = loadJson<MemoryVerseState>(MEMORY_FILE);
  const k = uk(tenantId, phone);
  if (!data[k]) return;
  data[k].lastTestedAt = new Date().toISOString();
  data[k].testCount += 1;
  if (mastered) data[k].mastered = true;
  saveJson(MEMORY_FILE, data);
}

export function clearMemoryVerse(tenantId: number, phone: string): void {
  const data = loadJson<MemoryVerseState>(MEMORY_FILE);
  delete data[uk(tenantId, phone)];
  saveJson(MEMORY_FILE, data);
}

export function getAllMemoryVerses(): Record<string, MemoryVerseState> {
  return loadJson<MemoryVerseState>(MEMORY_FILE);
}

// ── FASTING COMPANION ─────────────────────────────────────────────────────────
export interface FastingState {
  intention: string;       // what they're fasting for
  startedAt: string;       // ISO
  endsAt: string;          // ISO
  lastCheckInAt: string;   // ISO ("" if none yet)
  completed: boolean;
}

export function getFasting(tenantId: number, phone: string): FastingState | undefined {
  const data = loadJson<FastingState>(FASTING_FILE);
  const s = data[uk(tenantId, phone)];
  if (!s) return undefined;
  if (new Date() >= new Date(s.endsAt)) { s.completed = true; }
  return s;
}

export function startFast(
  tenantId: number,
  phone: string,
  intention: string,
  durationHours: number,
): FastingState {
  const data = loadJson<FastingState>(FASTING_FILE);
  const now = new Date();
  const state: FastingState = {
    intention,
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + durationHours * 3_600_000).toISOString(),
    lastCheckInAt: "",
    completed: false,
  };
  data[uk(tenantId, phone)] = state;
  saveJson(FASTING_FILE, data);
  return state;
}

export function updateFastingCheckIn(tenantId: number, phone: string): void {
  const data = loadJson<FastingState>(FASTING_FILE);
  const k = uk(tenantId, phone);
  if (!data[k]) return;
  data[k].lastCheckInAt = new Date().toISOString();
  saveJson(FASTING_FILE, data);
}

export function endFast(tenantId: number, phone: string): void {
  const data = loadJson<FastingState>(FASTING_FILE);
  delete data[uk(tenantId, phone)];
  saveJson(FASTING_FILE, data);
}

export function getAllActiveFasts(): Array<{ tenantId: number; phone: string; state: FastingState }> {
  const data = loadJson<FastingState>(FASTING_FILE);
  const now = new Date();
  return Object.entries(data)
    .filter(([, s]) => !s.completed && new Date(s.endsAt) > now)
    .map(([k, state]) => {
      const [tid, phone] = k.split(":");
      return { tenantId: parseInt(tid), phone, state };
    });
}

// ── USER PREFERENCES ──────────────────────────────────────────────────────────
export interface UserPrefs {
  translation: "NIV" | "KJV" | "ESV" | "NLT" | "NKJV";
  dailyVerseTime: string;   // "HH:MM" local 24h
  topics: string[];          // preferred themes for daily verse
  optedInDailyVerse: boolean;
}

const DEFAULT_PREFS: UserPrefs = {
  translation: "NIV",
  dailyVerseTime: "07:00",
  topics: [],
  optedInDailyVerse: true,
};

export function getUserPrefs(tenantId: number, phone: string): UserPrefs {
  const data = loadJson<UserPrefs>(PREFS_FILE);
  return { ...DEFAULT_PREFS, ...(data[uk(tenantId, phone)] ?? {}) };
}

export function setUserPrefs(tenantId: number, phone: string, prefs: Partial<UserPrefs>): void {
  const data = loadJson<UserPrefs>(PREFS_FILE);
  const k = uk(tenantId, phone);
  data[k] = { ...DEFAULT_PREFS, ...(data[k] ?? {}), ...prefs };
  saveJson(PREFS_FILE, data);
}

export function getAllUserPrefs(): Record<string, UserPrefs> {
  return loadJson<UserPrefs>(PREFS_FILE);
}

// ── PRAYER WALL ───────────────────────────────────────────────────────────────
export interface PrayerRequest {
  id: string;
  phoneNumber: string;
  name: string | null;
  request: string;
  submittedAt: string; // ISO
  prayerCount: number; // how many users tapped "I prayed"
  anonymous: boolean;
}

export function getPrayerWall(tenantId: number): PrayerRequest[] {
  const data = loadJson<PrayerRequest[]>(PRAYER_WALL_FILE);
  const list = (data[String(tenantId)] ?? []) as PrayerRequest[];
  // Keep only last 7 days
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  return list.filter(r => r.submittedAt >= cutoff);
}

export function addPrayerRequest(
  tenantId: number,
  phoneNumber: string,
  name: string | null,
  request: string,
  anonymous = false,
): PrayerRequest {
  const data = loadJson<PrayerRequest[]>(PRAYER_WALL_FILE);
  const k = String(tenantId);
  const list = (data[k] ?? []) as PrayerRequest[];
  const newReq: PrayerRequest = {
    id: Date.now().toString(36),
    phoneNumber,
    name: anonymous ? null : name,
    request: request.slice(0, 300),
    submittedAt: new Date().toISOString(),
    prayerCount: 0,
    anonymous,
  };
  list.push(newReq);
  data[k] = list.slice(-100) as any; // keep last 100
  saveJson(PRAYER_WALL_FILE, data);
  return newReq;
}

export function incrementPrayerCount(tenantId: number, id: string): void {
  const data = loadJson<PrayerRequest[]>(PRAYER_WALL_FILE);
  const k = String(tenantId);
  const list = (data[k] ?? []) as PrayerRequest[];
  const req = list.find(r => r.id === id);
  if (req) {
    req.prayerCount += 1;
    data[k] = list as any;
    saveJson(PRAYER_WALL_FILE, data);
  }
}

export function formatPrayerWall(requests: PrayerRequest[]): string {
  if (requests.length === 0) {
    return `🙏 *Prayer Wall*\n\nNo requests yet. Be the first to share — type *add to prayer wall* followed by your request.`;
  }
  const lines = requests.slice(-10).map((r, i) => {
    const who = r.anonymous ? "Anonymous" : (r.name ?? "A brother/sister");
    const prayed = r.prayerCount > 0 ? ` · 🙏 ${r.prayerCount} prayed` : "";
    return `${i + 1}. *${who}*${prayed}\n   _"${r.request}"_`;
  });
  return [
    `🙏 *Community Prayer Wall*`,
    `_Showing ${requests.length > 10 ? "latest 10" : requests.length} request(s) from the past 7 days_`,
    ``,
    lines.join("\n\n"),
    ``,
    `Type *I prayed* to let the community know you prayed for them.`,
    `Type *add to prayer wall* + your request to add yours.`,
  ].join("\n");
}

// ── POST-SESSION CHECK-IN ─────────────────────────────────────────────────────
export interface CheckInState {
  sessionEndedAt: string;  // ISO
  mode: "encouragement" | "prayer";
  checkInSentAt: string;   // ISO ("" if not yet sent)
}

export function schedulePostCheckIn(
  tenantId: number,
  phone: string,
  mode: "encouragement" | "prayer",
): void {
  const data = loadJson<CheckInState>(CHECKINS_FILE);
  data[uk(tenantId, phone)] = {
    sessionEndedAt: new Date().toISOString(),
    mode,
    checkInSentAt: "",
  };
  saveJson(CHECKINS_FILE, data);
}

export function getPendingCheckIns(): Array<{
  tenantId: number;
  phone: string;
  state: CheckInState;
}> {
  const data = loadJson<CheckInState>(CHECKINS_FILE);
  const now = Date.now();
  return Object.entries(data)
    .filter(([, s]) => {
      if (s.checkInSentAt) return false;
      const hoursSince = (now - new Date(s.sessionEndedAt).getTime()) / 3_600_000;
      return hoursSince >= 20 && hoursSince <= 36; // send 20-36h after session
    })
    .map(([k, state]) => {
      const [tid, phone] = k.split(":");
      return { tenantId: parseInt(tid), phone, state };
    });
}

export function markCheckInSent(tenantId: number, phone: string): void {
  const data = loadJson<CheckInState>(CHECKINS_FILE);
  const k = uk(tenantId, phone);
  if (!data[k]) return;
  data[k].checkInSentAt = new Date().toISOString();
  saveJson(CHECKINS_FILE, data);
}
