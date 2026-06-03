"use strict";

const STORE_KEY = "habits.v1";
const EMOJIS = ["💧", "🏃", "📚", "🧘", "💪", "🛌", "🥗", "✍️", "🎯", "🧹", "☀️", "🚭"];
const COLORS = ["#6366f1", "#ec4899", "#22c55e", "#f59e0b", "#06b6d4", "#a855f7", "#ef4444", "#14b8a6"];
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * @typedef {{
 *   id:string, name:string, emoji:string, color:string, createdAt:number,
 *   history:Record<string,boolean>, reminder?:string|null, lastNotified?:string
 * }} Habit
 */

// ---- storage ----
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function save() {
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
function today() {
  return new Date();
}
const TODAY_KEY = dateKey(today());

// current consecutive streak ending today (or yesterday if today not yet done)
function streakOf(habit) {
  let count = 0;
  let cursor = today();
  if (!habit.history[dateKey(cursor)]) cursor = addDays(cursor, -1);
  while (habit.history[dateKey(cursor)]) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

function bestStreakOf(habit) {
  const keys = Object.keys(habit.history).filter((k) => habit.history[k]).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of keys) {
    const d = new Date(k + "T00:00:00");
    if (prev && (d - prev) === 86400000) run++;
    else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// completion rate (%) for a given year/month; denominator counts only days up to today
function monthRate(habit, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const t = today();
  let done = 0;
  let total = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    if (d > t) break;
    total++;
    if (habit.history[dateKey(d)]) done++;
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function last7Done(habit) {
  let n = 0;
  for (let i = 0; i < 7; i++) if (habit.history[dateKey(addDays(today(), -i))]) n++;
  return n;
}

// ---- elements ----
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const reorderHint = document.getElementById("reorderHint");
const todayLabel = document.getElementById("todayLabel");
const progressRing = document.getElementById("progressRing");
const progressText = document.getElementById("progressText");
const screenTitle = document.getElementById("screenTitle");
const todayView = document.getElementById("todayView");
const statsView = document.getElementById("statsView");
const tabs = document.getElementById("tabs");

let activeTab = "today";

// ---- top bar ----
function renderTopbar() {
  const t = today();
  todayLabel.textContent = `${t.getMonth() + 1}월 ${t.getDate()}일 (${DAY_NAMES[t.getDay()]})`;
  let done = 0;
  for (const h of habits) if (h.history[TODAY_KEY]) done++;
  const total = habits.length;
  progressText.textContent = `${done}/${total}`;
  progressRing.style.setProperty("--pct", (total ? Math.round((done / total) * 100) : 0) + "%");
}

// ---- today view ----
function renderToday() {
  listEl.innerHTML = "";
  emptyEl.hidden = habits.length > 0;
  reorderHint.hidden = habits.length < 2;
  habits.forEach((habit) => listEl.appendChild(renderCard(habit)));
}

function renderCard(habit) {
  const card = document.createElement("div");
  card.className = "habit";
  card.style.setProperty("--habit-color", habit.color);
  card.dataset.id = habit.id;
  card.draggable = true;

  const top = document.createElement("div");
  top.className = "habit-top";

  const emoji = document.createElement("div");
  emoji.className = "habit-emoji";
  emoji.textContent = habit.emoji;

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

  const openDetail = () => showDetail(habit.id);
  emoji.addEventListener("click", openDetail);
  info.addEventListener("click", openDetail);

  const check = document.createElement("button");
  check.className = "check" + (habit.history[TODAY_KEY] ? " done" : "");
  check.textContent = "✓";
  check.setAttribute("aria-label", "오늘 완료 토글");
  check.addEventListener("click", () => toggle(habit, TODAY_KEY));

  top.append(emoji, info, check);

  const week = document.createElement("div");
  week.className = "week";
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today(), -i);
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
  attachDrag(card);
  return card;
}

function toggle(habit, key) {
  if (habit.history[key]) delete habit.history[key];
  else {
    habit.history[key] = true;
    if (navigator.vibrate) navigator.vibrate(10);
  }
  save();
  rerender();
}

// ---- drag to reorder ----
let dragId = null;
function attachDrag(card) {
  card.addEventListener("dragstart", () => {
    dragId = card.dataset.id;
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    document.querySelectorAll(".drag-over").forEach((c) => c.classList.remove("drag-over"));
  });
  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    card.classList.add("drag-over");
  });
  card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    card.classList.remove("drag-over");
    reorder(dragId, card.dataset.id);
  });
}
function reorder(fromId, toId) {
  if (!fromId || fromId === toId) return;
  const from = habits.findIndex((h) => h.id === fromId);
  const to = habits.findIndex((h) => h.id === toId);
  if (from < 0 || to < 0) return;
  const [moved] = habits.splice(from, 1);
  habits.splice(to, 0, moved);
  save();
  rerender();
}

// ---- stats view ----
function renderStats() {
  const t = today();
  if (!habits.length) {
    statsView.innerHTML = `<p class="empty">습관을 추가하면 통계가 표시돼요.</p>`;
    return;
  }
  const todayDone = habits.filter((h) => h.history[TODAY_KEY]).length;
  const bestStreakAll = Math.max(0, ...habits.map(streakOf));
  const monthDoneTotal = habits.reduce((acc, h) => acc + monthRate(h, t.getFullYear(), t.getMonth()).done, 0);

  let html = `
    <div class="stat-grid">
      <div class="stat-card"><div class="big">${todayDone}/${habits.length}</div><div class="lbl">오늘 완료</div></div>
      <div class="stat-card"><div class="big">🔥 ${bestStreakAll}</div><div class="lbl">최고 진행 연속</div></div>
      <div class="stat-card"><div class="big">${habits.length}</div><div class="lbl">전체 습관</div></div>
      <div class="stat-card"><div class="big">${monthDoneTotal}</div><div class="lbl">이번 달 체크 수</div></div>
    </div>
    <div class="stat-section-title">이번 달 달성률</div>
  `;
  for (const h of habits) {
    const r = monthRate(h, t.getFullYear(), t.getMonth());
    html += `
      <div class="bar-row">
        <div class="bar-emoji">${h.emoji}</div>
        <div class="bar-main">
          <div class="bar-name"><span>${escapeHtml(h.name)}</span><span class="muted">${r.pct}%</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${r.pct}%;background:${h.color}"></div></div>
        </div>
      </div>`;
  }
  statsView.innerHTML = html;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---- tabs ----
function setTab(tab) {
  activeTab = tab;
  [...tabs.children].forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const isToday = tab === "today";
  todayView.hidden = !isToday;
  statsView.hidden = isToday;
  screenTitle.textContent = isToday ? "오늘의 습관" : "통계";
  rerender();
}
tabs.addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (b) setTab(b.dataset.tab);
});

function rerender() {
  renderTopbar();
  if (activeTab === "today") renderToday();
  else renderStats();
}

// ---- detail view (calendar + stats + reminder + reorder) ----
const detailEl = document.getElementById("detail");
let detailId = null;
let calYear, calMonth;

function showDetail(id) {
  detailId = id;
  const t = today();
  calYear = t.getFullYear();
  calMonth = t.getMonth();
  renderDetail();
  detailEl.hidden = false;
}
function closeDetail() {
  detailEl.hidden = true;
  detailId = null;
  rerender();
}

function renderDetail() {
  const habit = habits.find((h) => h.id === detailId);
  if (!habit) return closeDetail();
  const t = today();
  const cur = streakOf(habit);
  const best = bestStreakOf(habit);
  const rate = monthRate(habit, t.getFullYear(), t.getMonth());
  const week = last7Done(habit);
  const idx = habits.findIndex((h) => h.id === habit.id);

  detailEl.style.setProperty("--habit-color", habit.color);
  detailEl.innerHTML = `
    <div class="detail-head">
      <button class="back-btn" id="d_back" aria-label="뒤로">‹</button>
      <div class="detail-title">${habit.emoji} ${escapeHtml(habit.name)}</div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="big">🔥 ${cur}</div><div class="lbl">현재 연속</div></div>
      <div class="stat-card"><div class="big">🏆 ${best}</div><div class="lbl">최고 연속</div></div>
      <div class="stat-card"><div class="big">${rate.pct}%</div><div class="lbl">이번 달 달성률</div></div>
      <div class="stat-card"><div class="big">${week}/7</div><div class="lbl">최근 7일</div></div>
    </div>

    <div class="detail-section">
      <div class="cal-nav">
        <button id="d_prev" aria-label="이전 달">‹</button>
        <span class="cal-month" id="d_month"></span>
        <button id="d_next" aria-label="다음 달">›</button>
      </div>
      <div class="cal-grid" id="d_cal"></div>
    </div>

    <div class="detail-section">
      <div class="stat-section-title">리마인더</div>
      <div class="reminder-row">
        <span>매일 알림</span>
        <input type="time" id="d_reminder" value="${habit.reminder || ""}" />
      </div>
      <p class="note">
        아이폰은 <b>홈 화면에 추가</b>한 뒤 알림을 허용해야 하며, 정해진 시각 알림은
        <b>앱이 열려 있을 때</b> 동작합니다(iOS 웹앱 제약).
      </p>
    </div>

    <div class="detail-section">
      <div class="stat-section-title">순서</div>
      <div class="detail-actions">
        <button class="btn ghost" id="d_up" ${idx === 0 ? "disabled" : ""}>▲ 위로</button>
        <button class="btn ghost" id="d_down" ${idx === habits.length - 1 ? "disabled" : ""}>▼ 아래로</button>
      </div>
    </div>

    <div class="detail-actions">
      <button class="btn ghost" id="d_edit">편집</button>
      <button class="btn danger" id="d_delete">삭제</button>
    </div>
  `;

  renderCalendar(habit);

  detailEl.querySelector("#d_back").onclick = closeDetail;
  detailEl.querySelector("#d_prev").onclick = () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar(habit);
  };
  detailEl.querySelector("#d_next").onclick = () => {
    // do not allow navigating past the current month
    if (calYear === t.getFullYear() && calMonth === t.getMonth()) return;
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar(habit);
  };
  detailEl.querySelector("#d_reminder").onchange = (e) => {
    habit.reminder = e.target.value || null;
    habit.lastNotified = "";
    save();
    if (habit.reminder) requestNotifyPermission();
  };
  detailEl.querySelector("#d_up").onclick = () => { moveBy(habit.id, -1); };
  detailEl.querySelector("#d_down").onclick = () => { moveBy(habit.id, 1); };
  detailEl.querySelector("#d_edit").onclick = () => openSheet(habit);
  detailEl.querySelector("#d_delete").onclick = () => {
    if (confirm("이 습관과 모든 기록을 삭제할까요?")) {
      habits = habits.filter((h) => h.id !== habit.id);
      save();
      closeDetail();
    }
  };
}

function moveBy(id, delta) {
  const i = habits.findIndex((h) => h.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= habits.length) return;
  [habits[i], habits[j]] = [habits[j], habits[i]];
  save();
  renderDetail();
}

function renderCalendar(habit) {
  const t = today();
  const monthEl = detailEl.querySelector("#d_month");
  const grid = detailEl.querySelector("#d_cal");
  const nextBtn = detailEl.querySelector("#d_next");
  monthEl.textContent = `${calYear}년 ${calMonth + 1}월`;
  nextBtn.disabled = calYear === t.getFullYear() && calMonth === t.getMonth();

  grid.innerHTML = "";
  for (const d of DAY_NAMES) {
    const h = document.createElement("div");
    h.className = "cal-head";
    h.textContent = d;
    grid.appendChild(h);
  }
  const first = new Date(calYear, calMonth, 1).getDay();
  const days = new Date(calYear, calMonth + 1, 0).getDate();
  for (let i = 0; i < first; i++) {
    const blank = document.createElement("div");
    blank.className = "cal-cell blank";
    grid.appendChild(blank);
  }
  for (let day = 1; day <= days; day++) {
    const d = new Date(calYear, calMonth, day);
    const key = dateKey(d);
    const cell = document.createElement("button");
    const isFuture = d > t;
    const isToday = key === TODAY_KEY;
    cell.className = "cal-cell" + (habit.history[key] ? " done" : "") + (isToday ? " today" : "") + (isFuture ? " future" : "");
    cell.textContent = String(day);
    if (!isFuture) {
      cell.onclick = () => {
        if (habit.history[key]) delete habit.history[key];
        else habit.history[key] = true;
        save();
        renderDetail();
      };
    }
    grid.appendChild(cell);
  }
}

// ---- add / edit sheet ----
const sheet = document.getElementById("sheet");
const sheetTitle = document.getElementById("sheetTitle");
const nameInput = document.getElementById("nameInput");
const emojiRow = document.getElementById("emojiRow");
const colorRow = document.getElementById("colorRow");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");

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
    b.addEventListener("click", () => { pickedEmoji = e; syncPickers(); });
    emojiRow.appendChild(b);
  });
  colorRow.innerHTML = "";
  COLORS.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "color-opt";
    b.style.background = c;
    b.addEventListener("click", () => { pickedColor = c; syncPickers(); });
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
  if (!name) { nameInput.focus(); return; }
  if (editingId) {
    const h = habits.find((x) => x.id === editingId);
    if (h) { h.name = name; h.emoji = pickedEmoji; h.color = pickedColor; }
  } else {
    habits.push({
      id: "h" + Date.now().toString(36),
      name, emoji: pickedEmoji, color: pickedColor,
      createdAt: Date.now(), history: {}, reminder: null,
    });
  }
  save();
  closeSheet();
  if (detailId) renderDetail();
  rerender();
});

cancelBtn.addEventListener("click", closeSheet);
sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });
document.getElementById("addBtn").addEventListener("click", () => openSheet(null));

// ---- reminders (best-effort, while app is open) ----
function requestNotifyPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") Notification.requestPermission();
}
function checkReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const key = dateKey(now);
  for (const h of habits) {
    if (!h.reminder) continue;
    if (h.history[key]) continue;          // already done today
    if (h.lastNotified === key) continue;  // already nudged today
    if (hhmm >= h.reminder) {
      notify(`${h.emoji} ${h.name}`, "아직 오늘 체크하지 않았어요. 지금 해볼까요?");
      h.lastNotified = key;
      save();
    }
  }
}
function notify(title, body) {
  const opts = { body, icon: "./icons/icon-192.png", badge: "./icons/icon-192.png" };
  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(() => {
      try { new Notification(title, opts); } catch {}
    });
  } else {
    try { new Notification(title, opts); } catch {}
  }
}

// ---- init ----
buildPickers();
setTab("today");
checkReminders();
setInterval(checkReminders, 30000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
