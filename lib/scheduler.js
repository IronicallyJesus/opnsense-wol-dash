const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json');

// ── Ensure data directory and file exist ──
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SCHEDULES_FILE)) {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

// ── Load all schedules from disk ──
function loadSchedules() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(SCHEDULES_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ── Save schedules to disk ──
function saveSchedules(schedules) {
  ensureDataDir();
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2), 'utf-8');
}

// ── Create a schedule ──
function createSchedule({ hostUuid, hostLabel, time, days, label, enabled }) {
  const schedules = loadSchedules();
  const schedule = {
    id: crypto.randomUUID(),
    hostUuid: hostUuid || '',
    hostLabel: hostLabel || '',
    time: time || '09:00',
    days: days || [],          // [] = every day, [1,2,3,4,5] = weekdays
    label: label || '',
    enabled: enabled !== false,
    lastFired: null,
    createdAt: new Date().toISOString()
  };
  schedules.push(schedule);
  saveSchedules(schedules);
  return schedule;
}

// ── Update a schedule by id ──
function updateSchedule(id, updates) {
  const schedules = loadSchedules();
  const idx = schedules.findIndex(s => s.id === id);
  if (idx === -1) return null;
  // Only allow updating specific fields
  const allowed = ['hostUuid', 'hostLabel', 'time', 'days', 'label', 'enabled'];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      schedules[idx][key] = updates[key];
    }
  }
  saveSchedules(schedules);
  return schedules[idx];
}

// ── Delete a schedule by id ──
function deleteSchedule(id) {
  const schedules = loadSchedules();
  const idx = schedules.findIndex(s => s.id === id);
  if (idx === -1) return false;
  schedules.splice(idx, 1);
  saveSchedules(schedules);
  return true;
}

// ── Get all schedules ──
function getSchedules() {
  return loadSchedules();
}

// ── Get schedules for a specific host ──
function getSchedulesForHost(hostUuid) {
  return loadSchedules().filter(s => s.hostUuid === hostUuid);
}

// ── Tick: check each enabled schedule and fire if due ──
//    Returns an array of fired schedule IDs (empty if none).
//    Requires a wakeFn(uuid) callback that returns a Promise.
async function tick(wakeFn) {
  const now = new Date();
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const currentDow = now.getDay();  // 0=Sun, 1=Mon, ..., 6=Sat
  const currentMinute = Math.floor(now.getTime() / 60000);  // minute-of-epoch for dedup

  const schedules = loadSchedules();
  // Track which schedule was checked this minute (in-memory dedup reset each minute)
  const fired = [];

  for (const s of schedules) {
    if (!s.enabled) continue;

    // Check time match (exact HH:MM)
    if (s.time !== currentHHMM) continue;

    // Check day-of-week match
    if (s.days && s.days.length > 0 && !s.days.includes(currentDow)) continue;

    // Avoid double-fire within the same minute
    const lastMinute = s._lastFiredMinute || 0;
    if (lastMinute === currentMinute) continue;

    // Fire!
    try {
      const result = await wakeFn(s.hostUuid);
      s.lastFired = new Date().toISOString();
      s._lastFiredMinute = currentMinute;
      fired.push({ id: s.id, hostUuid: s.hostUuid, hostLabel: s.hostLabel, ok: true });
    } catch (err) {
      fired.push({ id: s.id, hostUuid: s.hostUuid, hostLabel: s.hostLabel, ok: false, error: err.message });
    }
  }

  if (fired.length > 0) {
    saveSchedules(schedules);
  }

  return fired;
}

module.exports = {
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getSchedules,
  getSchedulesForHost,
  tick
};
