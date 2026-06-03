"use strict";

const STORE_KEY = "habits.v1";
const EMOJIS = ["💧", "🏃", "📚", "🧘", "💪", "🛌", "🥗", "✍️", "🎯", "🧹", "☀️", "🚭"];
const COLORS = ["#6366f1", "#ec4899", "#22c55e", "#f59e0b", "#06b6d4", "#a855f7", "#ef4444", "#14b8a6"];
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

/** @typedef {{id:string,name:string,emoji:string,color:string,createdAt:number,history:Record<string,boolean>}} Habit */

// ---- storage ----
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function save(habits) {
  localStorage.setItem(STORE_KEY, JSON.stringify(habits));
}

/** @type {Habit[]} */
let habits = load();

// ---- date helpers ----
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
const TODAY = new Date();
const TODAY_KEY = dateKey(TODAY);

// current consecutive streak ending today (or yesterday if today not yet done)
function streakOf(habit) {
  let count = 0;
  let cursor = new Date(TODAY);
  if (!habit.history[dateKey(cursor)]) cursor = addDays(cursor, -1); // allow streak to hold until end of day
  while (habit.history[dateKey(cursor)]) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

// ---- rendering ----
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const todayLabel = document.getElementById("todayLabel");
const progressRing = document.getElementById("progressRing");
const progressText = document.getElementById("progressText");

function render() {
  todayLabel.textContent = `${TODAY.getMonth() + 1}월 ${TODAY.getDate()}일 (${DAY_NAMES[TODAY.getDay()]})`;
  listEl.innerHTML = "";
  emptyEl.hidden = habits.length > 0;

  let doneToday = 0;
  for (const habit of habits) {
    if (habit.history[TODAY_KEY]) doneToday++;
    listEl.appendChild(renderHabit(habit));
  }

  const total = habits.length;
  progressText.textContent = `${doneToday}/${total}`;
  const pct = total ? Math.round((doneToday / total) * 100) : 0;
  progressRing.style.setProperty("--pct", pct + "%");
}

function renderHabit(habit) {
  const card = document.createElement("div");
  card.className = "habit";
  card.style.setProperty("--habit-color", habit.color);

  // top row
  const top = document.createElement("div");
  top.className = "habit-top";

  const emoji = document.createElement("div");
  emoji.className = "habit-emoji";
  emoji.textContent = habit.emoji;
  emoji.title = "편집";
  emoji.addEventListener("click", () => openSheet(habit));

  const info = document.createElement("div");
  info.className = "habit-info";
  const name = document.createElement("div");
  name.className = "habit-name";
  name.textContent = habit.name;
  const streak = document.createElement("div");
  streak.className = "habit-streak";
  const s = streakOf(habit);
  streak.textContent = s > 0 ? `🔥 ${s}일 연속` : "오늘 시작해 볼까요?";
  info.append(name, streak);
  info.addEventListener("click", () => openSheet(habit));

  const check = document.createElement("button");
  check.className = "check" + (habit.history[TODAY_KEY] ? " done" : "");
  check.textContent = "✓";
  check.setAttribute("aria-label", "오늘 완료 토글");
  check.addEventListener("click", () => toggle(habit, TODAY_KEY));

  top.append(emoji, info, check);

  // last 7 days
  const week = document.createElement("div");
  week.className = "week";
  for (let i = 6; i >= 0; i--) {
    const d = addDays(TODAY, -i);
    const key = dateKey(d);
    const day = document.createElement("button");
    day.className = "day" + (key === TODAY_KEY ? " today" : "");
    const dot = document.createElement("span");
    dot.className = "dot" + (habit.history[key] ? " done" : "");
    dot.textContent = habit.history[key] ? "✓" : "";
    const lbl = document.createElement("span");
    lbl.textContent = DAY_NAMES[d.getDay()];
    day.append(dot, lbl);
    day.addEventListener("click", () => toggle(habit, key));
    week.appendChild(day);
  }

  card.append(top, week);
  return card;
}

function toggle(habit, key) {
  if (habit.history[key]) {
    delete habit.history[key];
  } else {
    habit.history[key] = true;
    if (navigator.vibrate) navigator.vibrate(10);
  }
  save(habits);
  render();
}

// ---- add / edit sheet ----
const sheet = document.getElementById("sheet");
const sheetTitle = document.getElementById("sheetTitle");
const nameInput = document.getElementById("nameInput");
const emojiRow = document.getElementById("emojiRow");
const colorRow = document.getElementById("colorRow");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");
const deleteBtn = document.getElementById("deleteBtn");

let editingId = null;
let pickedEmoji = EMOJIS[0];
let pickedColor = COLORS[0];

function buildPickers() {
  emojiRow.innerHTML = "";
  EMOJIS.forEach((e) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "emoji-opt";
    b.textContent = e;
    b.addEventListener("click", () => {
      pickedEmoji = e;
      syncPickers();
    });
    emojiRow.appendChild(b);
  });
  colorRow.innerHTML = "";
  COLORS.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "color-opt";
    b.style.background = c;
    b.addEventListener("click", () => {
      pickedColor = c;
      syncPickers();
    });
    colorRow.appendChild(b);
  });
}
function syncPickers() {
  [...emojiRow.children].forEach((b, i) => b.classList.toggle("sel", EMOJIS[i] === pickedEmoji));
  [...colorRow.children].forEach((b, i) => b.classList.toggle("sel", COLORS[i] === pickedColor));
}

function openSheet(habit) {
  editingId = habit ? habit.id : null;
  sheetTitle.textContent = habit ? "습관 편집" : "습관 추가";
  nameInput.value = habit ? habit.name : "";
  pickedEmoji = habit ? habit.emoji : EMOJIS[0];
  pickedColor = habit ? habit.color : COLORS[Math.floor(Math.random() * COLORS.length)];
  deleteBtn.hidden = !habit;
  syncPickers();
  sheet.hidden = false;
  if (!habit) setTimeout(() => nameInput.focus(), 250);
}
function closeSheet() {
  sheet.hidden = true;
  editingId = null;
}

saveBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }
  if (editingId) {
    const h = habits.find((x) => x.id === editingId);
    if (h) {
      h.name = name;
      h.emoji = pickedEmoji;
      h.color = pickedColor;
    }
  } else {
    habits.push({
      id: "h" + Date.now().toString(36),
      name,
      emoji: pickedEmoji,
      color: pickedColor,
      createdAt: Date.now(),
      history: {},
    });
  }
  save(habits);
  render();
  closeSheet();
});

deleteBtn.addEventListener("click", () => {
  if (!editingId) return;
  if (confirm("이 습관과 기록을 모두 삭제할까요?")) {
    habits = habits.filter((x) => x.id !== editingId);
    save(habits);
    render();
    closeSheet();
  }
});

cancelBtn.addEventListener("click", closeSheet);
sheet.addEventListener("click", (e) => {
  if (e.target === sheet) closeSheet();
});
document.getElementById("addBtn").addEventListener("click", () => openSheet(null));

// ---- init ----
buildPickers();
render();

// service worker (offline support)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
