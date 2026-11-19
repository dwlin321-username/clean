'use strict';
/* =========================================================
 * 打掃小幫手 — 主程式
 * 資料全部存在瀏覽器的 localStorage（關掉網頁也會保留）
 * ========================================================= */

const STORAGE_KEY = 'cleanHabit.v1';
const APP_VERSION = '1.0.0';

/* ---------- 小工具 ---------- */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = arr => arr.reduce((a, b) => a + (Number(b) || 0), 0);
const clampInt = (v, min, max, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };

/* ---------- 日期（一律使用本地時間的 YYYY-MM-DD 字串） ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => ymd(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5); // b - a
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const fmtDate = s => { const d = parse(s); return `${d.getMonth() + 1}月${d.getDate()}日（週${WD[d.getDay()]}）`; };
const fmtShort = s => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const fmtMin = m => { m = Math.round(m || 0); if (m < 60) return `${m} 分鐘`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} 小時 ${r} 分` : `${h} 小時`; };
const relDays = s => { const n = diffDays(s, todayStr()); return n === 0 ? '今天' : n === 1 ? '昨天' : n < 0 ? fmtShort(s) : `${n} 天前`; };
const weekOrder = () => Array.from({ length: 7 }, (_, i) => (i + state.settings.weekStart) % 7);
const weekStartOf = s => { const d = parse(s); const back = (d.getDay() - state.settings.weekStart + 7) % 7; return addDays(s, -back); };

/* =========================================================
 * 預設資料（第一次打開時使用，之後都可以自由編輯）
 * ========================================================= */
const SUPPLY_PRESETS = [
  ['抹布', '🧻'], ['吸塵器', '🌀'], ['拖把', '🧹'], ['掃把', '🧹'], ['除塵撢', '🪶'],
  ['多用途清潔劑', '🧴'], ['玻璃清潔劑', '🪟'], ['浴廁清潔劑', '🫧'], ['馬桶刷', '🪠'],
  ['菜瓜布', '🧽'], ['刷子', '🪥'], ['去油清潔劑', '🍋'], ['洗衣槽清潔劑', '🌊'],
  ['橡膠手套', '🧤'], ['垃圾袋', '🗑️']
];

// 區域範本：[項目名稱, 預估分鐘, 建議每幾天, [清潔用品]]
const AREA_TEMPLATES = {
  '客廳': { icon: '🛋️', items: [
    ['電視櫃', 10, 7, ['除塵撢', '抹布']], ['書櫃', 15, 14, ['除塵撢', '抹布']], ['沙發', 15, 14, ['吸塵器']],
    ['餐桌', 5, 3, ['抹布', '多用途清潔劑']], ['茶几', 5, 7, ['抹布', '多用途清潔劑']],
    ['地板', 20, 7, ['吸塵器', '拖把']], ['窗戶', 20, 30, ['玻璃清潔劑', '抹布']]] },
  '廚房': { icon: '🍳', items: [
    ['流理台', 10, 3, ['抹布', '多用途清潔劑']], ['瓦斯爐', 10, 7, ['去油清潔劑', '菜瓜布']],
    ['抽油煙機', 30, 30, ['去油清潔劑', '橡膠手套', '抹布']], ['水槽', 10, 7, ['菜瓜布', '多用途清潔劑']],
    ['冰箱', 20, 30, ['抹布', '多用途清潔劑']], ['地板', 15, 7, ['拖把']]] },
  '廁所': { icon: '🚽', items: [
    ['馬桶', 10, 7, ['馬桶刷', '浴廁清潔劑', '橡膠手套']], ['洗手台', 5, 7, ['浴廁清潔劑', '抹布']],
    ['鏡子', 5, 14, ['玻璃清潔劑', '抹布']], ['淋浴間', 15, 7, ['浴廁清潔劑', '刷子']],
    ['地板', 10, 7, ['浴廁清潔劑', '刷子']]] },
  '臥室': { icon: '🛏️', items: [
    ['換洗床單', 15, 14, []], ['書桌', 5, 7, ['抹布']], ['衣櫃', 15, 30, ['抹布', '除塵撢']],
    ['床底', 10, 30, ['吸塵器']], ['地板', 15, 7, ['吸塵器', '拖把']]] },
  '陽台': { icon: '🪴', items: [
    ['地板', 10, 14, ['掃把', '刷子']], ['洗衣機', 20, 30, ['洗衣槽清潔劑']], ['紗窗', 20, 60, ['刷子', '抹布']]] }
};
const TEMPLATE_ALIASES = { '浴室': '廁所', '衛浴': '廁所', '洗手間': '廁所', '房間': '臥室', '主臥': '臥室', '次臥': '臥室', '客房': '臥室', '餐廳': '客廳' };

// 依項目名稱自動建議清潔用品（關鍵字 → 用品）
const SUPPLY_KEYWORDS = [
  [/地板|地面|地毯/, ['吸塵器', '拖把']],
  [/窗|鏡|玻璃/, ['玻璃清潔劑', '抹布']],
  [/馬桶/, ['馬桶刷', '浴廁清潔劑', '橡膠手套']],
  [/浴|淋浴|洗手台|面盆|浴缸|磁磚/, ['浴廁清潔劑', '刷子']],
  [/爐|油煙|抽油|烤箱|微波/, ['去油清潔劑', '菜瓜布']],
  [/水槽|流理|水龍頭/, ['菜瓜布', '多用途清潔劑']],
  [/櫃|架|燈|電視|電腦|螢幕/, ['除塵撢', '抹布']],
  [/桌|台|冰箱|門|把手|開關/, ['抹布', '多用途清潔劑']],
  [/沙發|床|窗簾|床墊/, ['吸塵器']],
  [/洗衣機/, ['洗衣槽清潔劑']],
  [/垃圾/, ['垃圾袋']],
  [/陽台|紗窗/, ['刷子']]
];

function buildArea(name, tpl, supplies) {
  const S = n => supplies.find(s => s.name === n)?.id;
  return {
    id: uid(), name, icon: tpl?.icon || '🏠',
    items: (tpl?.items || []).map(([n, minutes, freqDays, sup]) => ({
      id: uid(), name: n, minutes, freqDays, supplies: sup.map(S).filter(Boolean), note: ''
    }))
  };
}

function defaultData() {
  const supplies = SUPPLY_PRESETS.map(([name, icon]) => ({ id: uid(), name, icon }));
  const areas = ['客廳', '廚房', '廁所', '臥室', '陽台'].map(n => buildArea(n, AREA_TEMPLATES[n], supplies));
  return {
    version: 1,
    areas,
    supplies,
    members: [{ id: uid(), name: '我', color: '#5AA9E6' }],
    schedules: [
      // 範例排程：可以在「排程」頁刪除或修改
      { id: uid(), type: 'weekly', weekdays: [6], date: null, areaId: areas[0].id, itemIds: null, memberId: null },
      { id: uid(), type: 'weekly', weekdays: [0], date: null, areaId: areas[2].id, itemIds: null, memberId: null },
      { id: uid(), type: 'daily', weekdays: [], date: null, areaId: areas[1].id, itemIds: [areas[1].items[0].id], memberId: null }
    ],
    logs: [],
    settings: { weekStart: 1, lastBackup: null }
  };
}

/* =========================================================
 * 資料讀寫
 * ========================================================= */
function normalize(d) {
  if (!d || !Array.isArray(d.areas) || !Array.isArray(d.logs)) throw new Error('資料格式不正確');
  d.version = d.version || 1;
  d.supplies = Array.isArray(d.supplies) ? d.supplies : [];
  d.members = Array.isArray(d.members) && d.members.length ? d.members : [{ id: uid(), name: '我', color: '#5AA9E6' }];
  d.schedules = Array.isArray(d.schedules) ? d.schedules : [];
  d.settings = Object.assign({ weekStart: 1, lastBackup: null }, d.settings || {});
  d.areas.forEach(a => { a.items = Array.isArray(a.items) ? a.items : []; a.items.forEach(i => { i.supplies = i.supplies || []; i.minutes = i.minutes || 10; i.freqDays = i.freqDays || 7; }); });
  d.schedules.forEach(s => { s.weekdays = s.weekdays || []; if (s.itemIds !== null && !Array.isArray(s.itemIds)) s.itemIds = null; });
  return d;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.warn('讀取資料失敗，改用預設資料', e); }
  return defaultData();
}

let state = load();

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { toast('⚠️ 儲存失敗，請先匯出備份'); }
}

// 請求瀏覽器「持久保存」資料，降低被系統自動清除的機會
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- 查詢 ---------- */
const areaById = id => state.areas.find(a => a.id === id);
const supplyById = id => state.supplies.find(s => s.id === id);
const memberById = id => state.members.find(m => m.id === id);
function findItem(itemId) {
  for (const area of state.areas) { const item = area.items.find(i => i.id === itemId); if (item) return { area, item }; }
  return null;
}
function lastMap() {
  const m = {};
  for (const l of state.logs) if (!m[l.itemId] || l.date > m[l.itemId]) m[l.itemId] = l.date;
  return m;
}
function itemStatus(item, last) {
  if (!last) return { level: 'none', days: null, ratio: Infinity, text: '尚未紀錄' };
  const days = diffDays(last, todayStr());
  const ratio = days / (item.freqDays || 7);
  return { level: ratio < 0.7 ? 'ok' : ratio < 1 ? 'soon' : 'over', days, ratio, text: relDays(last) };
}

/* ---------- 排程 → 某天的任務 ---------- */
function rulesOn(date) {
  const wd = parse(date).getDay();
  return state.schedules.filter(r =>
    r.type === 'daily' || (r.type === 'weekly' && r.weekdays.includes(wd)) || (r.type === 'once' && r.date === date));
}
function ruleItems(r) {
  const area = areaById(r.areaId);
  if (!area) return [];
  return r.itemIds ? area.items.filter(i => r.itemIds.includes(i.id)) : area.items;
}
function tasksFor(date) {
  const seen = new Map();
  for (const r of rulesOn(date)) {
    const area = areaById(r.areaId);
    if (!area) continue;
    for (const item of ruleItems(r)) if (!seen.has(item.id)) seen.set(item.id, { area, item, memberId: r.memberId || null });
  }
  const logsOn = state.logs.filter(l => l.date === date);
  const tasks = [...seen.values()].map(t => ({ ...t, log: logsOn.find(l => l.itemId === t.item.id) || null }));
  const extra = logsOn.filter(l => !seen.has(l.itemId));
  return { tasks, extra };
}

function suppliesFor(items) {
  const c = new Map();
  for (const it of items) for (const sid of it.supplies || []) c.set(sid, (c.get(sid) || 0) + 1);
  return [...c].map(([id, n]) => ({ s: supplyById(id), n })).filter(x => x.s).sort((a, b) => b.n - a.n);
}
function suggestSupplies(name) {
  const names = new Set();
  for (const [re, list] of SUPPLY_KEYWORDS) if (re.test(name)) list.forEach(n => names.add(n));
  return [...names].map(n => state.supplies.find(s => s.name === n)?.id).filter(Boolean);
}

/* ---------- 打掃紀錄 ---------- */
function complete(itemId, date, note = '', memberId = null) {
  const f = findItem(itemId);
  if (!f) return;
  state.logs.push({ id: uid(), itemId, areaId: f.area.id, itemName: f.item.name, areaName: f.area.name, areaIcon: f.area.icon, date, ts: Date.now(), note, memberId });
  save();
}
function uncomplete(itemId, date) {
  state.logs = state.logs.filter(l => !(l.itemId === itemId && l.date === date));
  save();
}

/* =========================================================
 * 畫面狀態與繪製
 * ========================================================= */
const ui = { tab: 'today', areaId: null, selDate: todayStr(), lastToday: todayStr(), historyLimit: 40, showAllAttention: false };
const view = $('#view');

function render(scrollTop = false) {
  const html = {
    today: viewToday,
    schedule: viewSchedule,
    areas: () => ui.areaId && areaById(ui.areaId) ? viewAreaDetail(areaById(ui.areaId)) : viewAreas(),
    records: viewRecords,
    settings: viewSettings
  }[ui.tab]();
  view.innerHTML = html;
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  if (scrollTop) window.scrollTo(0, 0);
}

function memberBadge(id) {
  if (state.members.length < 2) return '';
  const m = memberById(id);
  return m ? `<span class="badge" style="--c:${esc(m.color)}">${esc(m.name)}</span>` : '';
}
function supplyChips(list, emptyText = '不需要特別的用品') {
  if (!list.length) return `<div class="hint" style="margin:0">${emptyText}</div>`;
  return `<div class="chips">${list.map(({ s, n }) =>
    `<span class="chip static">${esc(s.icon || '')} ${esc(s.name)}${n > 1 ? `<span class="n">×${n}</span>` : ''}</span>`).join('')}</div>`;
}
function ring(done, total) {
  const r = 27, c = 2 * Math.PI * r, p = total ? done / total : 0;
  return `<div class="ring"><svg width="64" height="64" viewBox="0 0 64 64">
    <circle class="bg" cx="32" cy="32" r="${r}" fill="none" stroke-width="7"/>
    <circle class="fg" cx="32" cy="32" r="${r}" fill="none" stroke-width="7" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/>
    </svg><b>${total ? Math.round(p * 100) + '%' : '–'}</b></div>`;
}
function needBackup() {
  if (state.logs.length < 5) return null;
  const lb = state.settings.lastBackup;
  if (!lb) return '還沒有備份過資料';
  const d = diffDays(lb, todayStr());
  return d >= 30 ? `已經 ${d} 天沒有備份了` : null;
}

/* ---------- 今天 ---------- */
function viewToday() {
  const d = ui.selDate, t = todayStr();
  const diff = diffDays(t, d);
  const title = diff === 0 ? '今天' : diff === 1 ? '明天' : diff === -1 ? '昨天' : fmtShort(d);
  const { tasks, extra } = tasksFor(d);
  const done = tasks.filter(x => x.log).length;
  const totalMin = sum(tasks.map(x => x.item.minutes));
  const leftMin = sum(tasks.filter(x => !x.log).map(x => x.item.minutes));
  const lm = lastMap();

  // 週列
  const ws = weekStartOf(d);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map(day => {
    const tf = tasksFor(day);
    const has = tf.tasks.length > 0, all = has && tf.tasks.every(x => x.log);
    return `<button class="day ${day === t ? 'today' : ''} ${day === d ? 'sel' : ''}" data-act="pickDate" data-date="${day}">
      <span class="w">${WD[parse(day).getDay()]}</span><span class="n">${parse(day).getDate()}</span>
      <span class="marks">${has ? `<i class="${all ? 'full' : ''}"></i>` : ''}</span></button>`;
  }).join('');

  let html = `<div class="head"><div><h1>${title}</h1><div class="sub">${fmtDate(d)}</div></div>
    ${d !== t ? `<button class="today-link" data-act="pickDate" data-date="${t}">回到今天</button>` : ''}</div>
    <div class="week"><button class="arrow" data-act="weekShift" data-n="-7" aria-label="上一週">‹</button>${days}<button class="arrow" data-act="weekShift" data-n="7" aria-label="下一週">›</button></div>`;

  const nb = needBackup();
  if (nb && d === t) html += `<div class="banner"><span class="emoji">💾</span><span>${nb}，建議匯出一份</span><button data-act="goBackup">去備份</button></div>`;

  if (!tasks.length) {
    html += `<div class="card"><div class="empty"><div class="ill">🌤️</div><h3>${diff === 0 ? '今天沒有排定打掃' : '這天沒有排定打掃'}</h3>
      <p>好好休息，或是幫這天安排一個小區域吧</p>
      <button class="btn" data-act="addSchedule" data-date="${d}">＋ 安排這天的打掃</button></div></div>`;
  } else {
    const allDone = done === tasks.length;
    html += `<div class="card summary">${ring(done, tasks.length)}<div>
      <div class="big">${allDone ? '全部完成 🎉' : `還剩 ${tasks.length - done} 項`}</div>
      <div class="small">預估 ${fmtMin(totalMin)}${!allDone && done ? ` · 剩約 ${fmtMin(leftMin)}` : ''}</div></div></div>`;

    // 依區域分組
    const groups = new Map();
    for (const tk of tasks) { if (!groups.has(tk.area.id)) groups.set(tk.area.id, { area: tk.area, list: [] }); groups.get(tk.area.id).list.push(tk); }
    html += `<div class="section-title">打掃項目</div>`;
    for (const { area, list } of groups.values()) {
      html += `<div class="card"><div class="group-head"><span class="emoji">${esc(area.icon)}</span>${esc(area.name)}
        <span class="r">⏱ ${fmtMin(sum(list.map(x => x.item.minutes)))}</span></div>
        ${list.map(tk => taskRow(tk, d, lm)).join('')}</div>`;
    }

    // 所需清潔用品
    const pending = tasks.filter(x => !x.log).map(x => x.item);
    html += `<div class="section-title">${pending.length ? '需要準備的清潔用品' : '今天用到的清潔用品'}</div>
      <div class="card pad">${supplyChips(suppliesFor(pending.length ? pending : tasks.map(x => x.item)))}</div>`;
  }

  if (extra.length) {
    html += `<div class="section-title">其他完成的項目</div><div class="card">${extra.map(l => `
      <div class="row task done"><button class="check on" data-act="toggle" data-item="${l.itemId}" data-date="${d}" aria-label="取消完成"></button>
      <div class="row-main" data-act="item" data-item="${l.itemId}" data-date="${d}"><div class="row-title">${esc(l.areaIcon || '')} ${esc(l.itemName)}</div>
      ${l.note ? `<div class="row-sub">📝 ${esc(l.note)}</div>` : ''}</div></div>`).join('')}</div>`;
  }

  if (tasks.length) html += `<div class="btns"><button class="btn soft block" data-act="addSchedule" data-date="${d}">＋ 再安排這天的打掃</button></div>`;
  return html;
}

function taskRow(tk, date, lm) {
  const { item, log } = tk;
  const meta = [`⏱ ${item.minutes} 分`];
  if (log) meta.push(log.note ? `📝 ${esc(log.note)}` : '已完成');
  else {
    const st = itemStatus(item, lm[item.id]);
    meta.push(st.level === 'none' ? '尚未紀錄' : `<span class="${st.level === 'over' ? 't-over' : st.level === 'soon' ? 't-soon' : ''}">上次 ${st.text}</span>`);
  }
  const mb = memberBadge(log?.memberId || tk.memberId);
  if (mb) meta.push(mb);
  return `<div class="row task ${log ? 'done' : ''}">
    <button class="check ${log ? 'on' : ''}" data-act="toggle" data-item="${item.id}" data-date="${date}" data-member="${tk.memberId || ''}" aria-label="完成"></button>
    <div class="row-main" data-act="item" data-item="${item.id}" data-date="${date}">
      <div class="row-title">${esc(item.name)}</div><div class="row-sub">${meta.join('<span>·</span>')}</div></div>
    <span class="chev" data-act="item" data-item="${item.id}" data-date="${date}"></span></div>`;
}

/* ---------- 排程 ---------- */
function ruleLabel(r) {
  const area = areaById(r.areaId);
  const items = ruleItems(r);
  const what = r.itemIds ? items.map(i => i.name).join('、') || '（項目已刪除）' : '全部項目';
  return { area, items, what };
}
function viewSchedule() {
  const t = todayStr();
  const ws = weekStartOf(t);
  let html = `<div class="head"><div><h1>排程</h1><div class="sub">自訂每天、每週或某一天要打掃的區域</div></div>
    <button class="head-btn" data-act="addSchedule" aria-label="新增排程">＋</button></div>`;

  // 本週總覽
  html += `<div class="section-title">本週總覽</div><div class="card week-plan">` + Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map(day => {
    const { tasks } = tasksFor(day);
    const byArea = new Map();
    tasks.forEach(tk => { const g = byArea.get(tk.area.id) || { area: tk.area, n: 0, min: 0, done: 0 }; g.n++; g.min += tk.item.minutes; if (tk.log) g.done++; byArea.set(tk.area.id, g); });
    const chips = [...byArea.values()].map(g => `<span class="chip static ${g.done === g.n ? '' : 'on'}">${esc(g.area.icon)} ${esc(g.area.name)}<span class="n">${g.done === g.n ? '✓' : g.n + ' 項'}</span></span>`).join('');
    return `<button class="row" data-act="gotoDay" data-date="${day}">
      <div class="wd ${day === t ? 'today' : ''}">週${WD[parse(day).getDay()]}<small>${fmtShort(day)}</small></div>
      <div class="plan">${chips || '<span class="none">休息日</span>'}</div>
      <div class="row-right">${tasks.length ? fmtMin(sum(tasks.map(x => x.item.minutes))) : ''}</div></button>`;
  }).join('') + `</div>`;

  const ruleRow = (r, label) => {
    const { area, items, what } = ruleLabel(r);
    if (!area) return '';
    return `<button class="row indent" data-act="editSchedule" data-id="${r.id}"><span class="emoji">${esc(area.icon)}</span>
      <div class="row-main"><div class="row-title">${label ? `<b>${label}</b>　` : ''}${esc(area.name)}</div>
      <div class="row-sub"><span>${esc(what)}</span><span>· ⏱ ${fmtMin(sum(items.map(i => i.minutes)))}</span>${memberBadge(r.memberId)}</div></div><span class="chev"></span></button>`;
  };

  const daily = state.schedules.filter(r => r.type === 'daily');
  const weekly = state.schedules.filter(r => r.type === 'weekly')
    .sort((a, b) => Math.min(...a.weekdays.map(w => weekOrder().indexOf(w))) - Math.min(...b.weekdays.map(w => weekOrder().indexOf(w))));
  const once = state.schedules.filter(r => r.type === 'once');
  const upcoming = once.filter(r => r.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const past = once.filter(r => r.date < t);

  const block = (title, list, fn) => list.length ? `<div class="section-title">${title}</div><div class="card">${list.map(fn).join('')}</div>` : '';
  html += block('每日', daily, r => ruleRow(r, '每天'));
  html += block('每週', weekly, r => ruleRow(r, weekOrder().filter(w => r.weekdays.includes(w)).map(w => '週' + WD[w]).join('、')));
  html += block('單次（即將到來）', upcoming, r => ruleRow(r, fmtShort(r.date)));
  if (past.length) html += `<div class="section-title">已過去的單次排程<button class="r" data-act="clearPast">全部清除</button></div>
    <div class="card">${past.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map(r => ruleRow(r, fmtShort(r.date))).join('')}</div>`;

  if (!state.schedules.length) html += `<div class="card" style="margin-top:16px"><div class="empty"><div class="ill">🗓️</div><h3>還沒有任何排程</h3>
    <p>例如「每週六打掃客廳」或「11/30 打掃廚房」</p><button class="btn" data-act="addSchedule">＋ 新增排程</button></div></div>`;
  return html;
}

/* ---------- 區域列表 ---------- */
function areaHealth(area, lm) {
  const sts = area.items.map(i => ({ i, st: itemStatus(i, lm[i.id]) }));
  const over = sts.filter(x => x.st.level === 'over').length;
  const soon = sts.filter(x => x.st.level === 'soon').length;
  const fresh = sts.filter(x => x.st.level === 'ok' || x.st.level === 'soon').length;
  const recorded = sts.filter(x => x.st.days !== null);
  const oldest = recorded.sort((a, b) => b.st.days - a.st.days)[0];
  const never = sts.filter(x => x.st.level === 'none').length;
  return { over, soon, never, fresh, total: area.items.length, oldest };
}
function viewAreas() {
  const lm = lastMap();
  let html = `<div class="head"><div><h1>區域</h1><div class="sub">點選區域查看與編輯項目</div></div>
    <button class="head-btn" data-act="addArea" aria-label="新增區域">＋</button></div>`;
  if (!state.areas.length) return html + `<div class="card"><div class="empty"><div class="ill">🏠</div><h3>還沒有區域</h3><p>先新增「客廳」、「廚房」等區域吧</p><button class="btn" data-act="addArea">＋ 新增區域</button></div></div>`;
  html += state.areas.map(a => {
    const h = areaHealth(a, lm);
    const pct = h.total ? Math.round(h.fresh / h.total * 100) : 0;
    const cls = h.over ? 'over' : h.soon ? 'soon' : '';
    const status = !h.total ? '尚無項目' : h.over ? `<span class="t-over">${h.over} 項該打掃了</span>` : h.never === h.total ? '尚未有打掃紀錄' : h.soon ? `<span class="t-soon">${h.soon} 項快到期</span>` : '狀態良好 ✨';
    return `<div class="card"><button class="area-card" data-act="openArea" data-id="${a.id}">
      <div class="area-top"><span class="emoji">${esc(a.icon)}</span><div style="flex:1;min-width:0"><div class="name">${esc(a.name)}</div>
      <div class="meta">${h.total} 個項目 · 約 ${fmtMin(sum(a.items.map(i => i.minutes)))}</div></div><span class="chev"></span></div>
      <div class="bar ${cls}"><i style="width:${pct}%"></i></div>
      <div class="area-foot"><span>${status}</span><span>${h.oldest ? `最久：${esc(h.oldest.i.name)}（${h.oldest.st.text}）` : ''}</span></div>
    </button></div>`;
  }).join('');
  html += `<div class="legend"><span>清潔度＝在建議頻率內完成的項目比例</span></div>`;
  return html;
}

/* ---------- 區域詳細 ---------- */
function viewAreaDetail(area) {
  const lm = lastMap(), t = todayStr();
  const doneToday = new Set(state.logs.filter(l => l.date === t).map(l => l.itemId));
  let html = `<button class="back" data-act="backAreas">區域</button>
    <div class="hero"><span class="emoji">${esc(area.icon)}</span><div><h1>${esc(area.name)}</h1>
    <div class="sub">${area.items.length} 個項目 · 約 ${fmtMin(sum(area.items.map(i => i.minutes)))}</div></div>
    <button class="head-btn" data-act="editArea" data-id="${area.id}">編輯</button></div>`;

  html += `<div class="section-title">項目<span class="r" style="color:var(--text-2)">點圓圈＝今天完成</span></div><div class="card">`;
  html += area.items.map(item => {
    const st = itemStatus(item, lm[item.id]);
    const on = doneToday.has(item.id);
    const supNames = item.supplies.map(id => supplyById(id)).filter(Boolean).map(s => s.icon).join(' ');
    return `<div class="row task ${on ? 'done' : ''}">
      <button class="check ${on ? 'on' : ''}" data-act="toggle" data-item="${item.id}" data-date="${t}" aria-label="今天完成"></button>
      <div class="row-main" data-act="item" data-item="${item.id}" data-date="${t}">
        <div class="row-title">${esc(item.name)}</div>
        <div class="row-sub"><span class="dot ${st.level}"></span><span class="${st.level === 'over' ? 't-over' : st.level === 'soon' ? 't-soon' : ''}">${st.text}</span>
        <span>· 每 ${item.freqDays} 天</span><span>· ⏱ ${item.minutes} 分</span>${supNames ? `<span>· ${supNames}</span>` : ''}</div></div>
      <span class="chev" data-act="item" data-item="${item.id}" data-date="${t}"></span></div>`;
  }).join('');
  html += `<button class="row link-row" data-act="addItem" data-id="${area.id}">＋ 新增項目</button></div>
    <div class="legend"><span><i class="dot ok"></i>還很乾淨</span><span><i class="dot soon"></i>快到期</span><span><i class="dot over"></i>該打掃了</span><span><i class="dot none"></i>尚未紀錄</span></div>`;

  html += `<div class="section-title">這個區域需要的清潔用品</div><div class="card pad">${supplyChips(suppliesFor(area.items))}</div>`;

  const rules = state.schedules.filter(r => r.areaId === area.id);
  html += `<div class="section-title">相關排程</div><div class="card">${rules.map(r => {
    const when = r.type === 'daily' ? '每天' : r.type === 'weekly' ? weekOrder().filter(w => r.weekdays.includes(w)).map(w => '週' + WD[w]).join('、') : fmtDate(r.date);
    return `<button class="row" data-act="editSchedule" data-id="${r.id}"><div class="row-main"><div class="row-title">${when}</div>
      <div class="row-sub">${esc(ruleLabel(r).what)}${memberBadge(r.memberId)}</div></div><span class="chev"></span></button>`;
  }).join('')}<button class="row link-row" data-act="addSchedule" data-area="${area.id}">＋ 為這個區域新增排程</button></div>`;
  return html;
}

/* ---------- 紀錄 ---------- */
function streak() {
  const set = new Set(state.logs.map(l => l.date));
  let d = todayStr(), n = 0;
  if (!set.has(d)) d = addDays(d, -1);
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
function heatmap() {
  const t = todayStr(), weeks = 17;
  const start = addDays(weekStartOf(t), -(weeks - 1) * 7);
  const counts = {};
  for (const l of state.logs) counts[l.date] = (counts[l.date] || 0) + 1;
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    if (d > t) { cells += '<i class="hc fut"></i>'; continue; }
    const c = counts[d] || 0;
    const lv = c === 0 ? 0 : c <= 2 ? 1 : c <= 4 ? 2 : c <= 7 ? 3 : 4;
    cells += `<i class="hc l${lv} ${d === t ? 'td' : ''}" data-act="gotoDay" data-date="${d}" title="${d}：${c} 項"></i>`;
  }
  const labels = weekOrder().map((w, i) => `<span>${i % 2 === 0 ? WD[w] : ''}</span>`).join('');
  return `<div class="heat-wrap"><div class="heat-days">${labels}</div><div class="heat">${cells}</div></div>
    <div class="heat-legend">少 <i class="hc"></i><i class="hc l1"></i><i class="hc l2"></i><i class="hc l3"></i><i class="hc l4"></i> 多</div>`;
}
function viewRecords() {
  const t = todayStr(), month = t.slice(0, 7), lm = lastMap();
  const monthLogs = state.logs.filter(l => l.date.startsWith(month));
  const monthMin = sum(monthLogs.map(l => findItem(l.itemId)?.item.minutes || 0));
  let html = `<div class="head"><div><h1>紀錄</h1><div class="sub">看看自己的打掃成果</div></div></div>
    <div class="stats"><div class="stat"><b>${monthLogs.length}</b><span>本月完成項目</span></div>
    <div class="stat"><b>${monthMin >= 60 ? (monthMin / 60).toFixed(1) + 'h' : monthMin + 'm'}</b><span>本月打掃時間</span></div>
    <div class="stat"><b>${streak()}</b><span>連續打掃天數</span></div></div>
    <div class="section-title">近四個月打掃熱度</div><div class="card pad">${heatmap()}</div>`;

  // 需要關注的項目
  const att = [];
  state.areas.forEach(area => area.items.forEach(item => { const st = itemStatus(item, lm[item.id]); if (st.level === 'over' || st.level === 'none') att.push({ area, item, st }); }));
  att.sort((a, b) => (a.st.level === 'none') - (b.st.level === 'none') || b.st.ratio - a.st.ratio);
  const shown = ui.showAllAttention ? att : att.slice(0, 6);
  html += `<div class="section-title">尚未打掃 / 該打掃了<span class="r" style="color:var(--text-2)">${att.length} 項</span></div><div class="card">`;
  html += att.length ? shown.map(({ area, item, st }) => `<button class="row indent" data-act="item" data-item="${item.id}" data-date="${t}">
      <span class="emoji">${esc(area.icon)}</span><div class="row-main"><div class="row-title">${esc(item.name)}<span style="color:var(--text-2);font-size:14px"> · ${esc(area.name)}</span></div>
      <div class="row-sub"><span class="dot ${st.level}"></span>${st.level === 'none' ? '還沒有打掃紀錄' : `<span class="t-over">${st.days} 天沒打掃</span><span>（建議每 ${item.freqDays} 天）</span>`}</div></div><span class="chev"></span></button>`).join('')
    : `<div class="empty" style="padding:22px"><div class="ill">✨</div><h3>全部都在建議頻率內！</h3></div>`;
  if (att.length > 6) html += `<button class="row link-row" data-act="toggleAttention">${ui.showAllAttention ? '收合' : `顯示全部 ${att.length} 項`}</button>`;
  html += `</div>`;

  // 本月各區域
  const byArea = state.areas.map(a => ({ a, n: monthLogs.filter(l => l.areaId === a.id).length }));
  const max = Math.max(1, ...byArea.map(x => x.n));
  html += `<div class="section-title">本月各區域打掃次數</div><div class="card pad">${byArea.map(({ a, n }) =>
    `<div class="hbar"><span class="l">${esc(a.icon)} ${esc(a.name)}</span><span class="track"><i style="width:${n / max * 100}%"></i></span><span class="v">${n}</span></div>`).join('')}</div>`;

  // 成員分工統計（2 位以上成員才顯示）
  if (state.members.length > 1) {
    const byM = state.members.map(m => ({ m, n: monthLogs.filter(l => l.memberId === m.id).length }));
    const mm = Math.max(1, ...byM.map(x => x.n));
    html += `<div class="section-title">本月成員分工</div><div class="card pad">${byM.map(({ m, n }) =>
      `<div class="hbar"><span class="l">${esc(m.name)}</span><span class="track"><i style="width:${n / mm * 100}%;background:${esc(m.color)}"></i></span><span class="v">${n}</span></div>`).join('')}</div>`;
  }

  // 歷史紀錄
  const logs = [...state.logs].sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  const list = logs.slice(0, ui.historyLimit);
  html += `<div class="section-title">歷史紀錄</div><div class="card">`;
  if (!logs.length) html += `<div class="empty" style="padding:22px"><div class="ill">📒</div><h3>還沒有紀錄</h3><p>完成打掃後會出現在這裡</p></div>`;
  let cur = '';
  for (const l of list) {
    if (l.date !== cur) { cur = l.date; html += `<div class="date-head">${fmtDate(l.date)} · ${relDays(l.date)}</div>`; }
    const f = findItem(l.itemId);
    html += `<div class="row indent"><span class="emoji">${esc(f?.area.icon || l.areaIcon || '🧹')}</span>
      <div class="row-main" ${f ? `data-act="item" data-item="${l.itemId}" data-date="${l.date}"` : ''}><div class="row-title">${esc(f?.item.name || l.itemName)}<span style="color:var(--text-2);font-size:14px"> · ${esc(f?.area.name || l.areaName)}</span></div>
      ${memberBadge(l.memberId) ? `<div class="row-sub">${memberBadge(l.memberId)}</div>` : ''}${l.note ? `<div class="note">${esc(l.note)}</div>` : ''}</div>
      <button class="del" data-act="delLog" data-id="${l.id}" aria-label="刪除紀錄">×</button></div>`;
  }
  if (logs.length > list.length) html += `<button class="row link-row" data-act="moreHistory">顯示更多（還有 ${logs.length - list.length} 筆）</button>`;
  return html + `</div>`;
}

/* ---------- 設定 ---------- */
function viewSettings() {
  const lb = state.settings.lastBackup;
  return `<div class="head"><div><h1>設定</h1></div></div>
    <div class="section-title">家庭成員</div><div class="card">
      ${state.members.map(m => `<button class="row" data-act="editMember" data-id="${m.id}"><span class="color-dot" style="background:${esc(m.color)}">${esc(m.name.slice(0, 1))}</span>
        <div class="row-main"><div class="row-title">${esc(m.name)}</div></div><span class="chev"></span></button>`).join('')}
      <button class="row link-row" data-act="addMember">＋ 新增成員</button></div>
    <div class="hint">新增 2 位以上成員後，排程可以指定負責人，紀錄頁也會顯示分工統計。</div>

    <div class="section-title">清潔用品庫</div><div class="card">
      ${state.supplies.map(s => `<button class="row" data-act="editSupply" data-id="${s.id}"><span class="emoji">${esc(s.icon || '🧴')}</span>
        <div class="row-main"><div class="row-title">${esc(s.name)}</div></div>
        <span class="row-right">${state.areas.reduce((n, a) => n + a.items.filter(i => i.supplies.includes(s.id)).length, 0)} 個項目</span><span class="chev"></span></button>`).join('')}
      <button class="row link-row" data-act="addSupply">＋ 新增清潔用品</button></div>

    <div class="section-title">一般</div><div class="card">
      <div class="row"><div class="row-main"><div class="row-title">一週開始於</div></div>
        <div class="seg" style="width:150px"><button class="${state.settings.weekStart === 1 ? 'on' : ''}" data-act="weekStart" data-v="1">週一</button><button class="${state.settings.weekStart === 0 ? 'on' : ''}" data-act="weekStart" data-v="0">週日</button></div></div>
      <button class="row" data-act="installHelp"><div class="row-main"><div class="row-title">如何加入 iPhone 主畫面</div></div><span class="chev"></span></button></div>

    <div class="section-title" id="backup">資料備份</div><div class="card">
      <button class="row" data-act="export"><span class="emoji">📤</span><div class="row-main"><div class="row-title">匯出備份檔</div>
        <div class="row-sub">${lb ? `上次備份：${fmtDate(lb)}（${relDays(lb)}）` : '尚未備份過'}</div></div><span class="chev"></span></button>
      <button class="row" data-act="import"><span class="emoji">📥</span><div class="row-main"><div class="row-title">從備份檔還原</div><div class="row-sub">會覆蓋目前的所有資料</div></div><span class="chev"></span></button></div>
    <div class="hint">資料只存在這支手機的瀏覽器裡。建議每個月匯出一次，存到「檔案」App 或 iCloud。</div>

    <div class="section-title">其他</div><div class="card">
      <button class="row danger" data-act="reset">清除所有資料並恢復預設</button></div>
    <div class="foot">打掃小幫手 v${APP_VERSION}<br>共 ${state.areas.length} 個區域 · ${sum(state.areas.map(a => a.items.length))} 個項目 · ${state.logs.length} 筆紀錄</div>`;
}

/* =========================================================
 * 底部彈出視窗（Sheet）
 * ========================================================= */
let sheet = null;
const sheetRoot = $('#sheet-root');
function openSheet(o) {
  sheetRoot.classList.remove('open');
  sheetRoot.innerHTML = `<div class="backdrop" data-sa="__close"></div><div class="sheet" role="dialog" aria-modal="true">
    <div class="grab"></div><div class="sheet-head"><button class="link" data-sa="__close">${o.cancelLabel || '取消'}</button>
    <div class="sheet-title">${esc(o.title)}</div>${o.saveLabel ? `<button class="link strong" data-sa="__save">${o.saveLabel}</button>` : '<span></span>'}</div>
    <div class="sheet-body"></div></div>`;
  sheet = { ...o, body: sheetRoot.querySelector('.sheet-body') };
  sheet.rerender = () => { const top = sheet.body.scrollTop; sheet.body.innerHTML = o.render(); o.mount && o.mount(sheet.body); sheet.body.scrollTop = top; };
  sheet.rerender();
  void sheetRoot.offsetHeight;
  sheetRoot.classList.add('open');
  document.body.classList.add('lock');
}
function closeSheet() {
  if (!sheet) return;
  sheet = null;
  sheetRoot.classList.remove('open');
  document.body.classList.remove('lock');
  setTimeout(() => { if (!sheet) sheetRoot.innerHTML = ''; }, 300);
}
sheetRoot.addEventListener('click', e => {
  const el = e.target.closest('[data-sa]');
  if (!el || !sheet) return;
  const a = el.dataset.sa;
  if (a === '__close') return closeSheet();
  if (a === '__save') return sheet.onSave && sheet.onSave(sheet.body);
  sheet.actions && sheet.actions[a] && sheet.actions[a](el, sheet.body);
});

/* ---------- 項目詳細（完成＋備註） ---------- */
function itemSheet(itemId, date = todayStr()) {
  const f = findItem(itemId);
  if (!f) return;
  const { area, item } = f;
  const t = todayStr();
  const future = date > t;
  const render = () => {
    const log = state.logs.find(l => l.itemId === itemId && l.date === date);
    const last = lastMap()[itemId];
    const st = itemStatus(item, last);
    const hist = state.logs.filter(l => l.itemId === itemId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    const sups = item.supplies.map(id => supplyById(id)).filter(Boolean).map(s => ({ s, n: 1 }));
    const task = tasksFor(date).tasks.find(x => x.item.id === itemId);
    const memberId = log?.memberId || task?.memberId || null;
    return `<div class="hero" style="margin-bottom:12px"><span class="emoji">${esc(area.icon)}</span><div><div class="sub">${esc(area.name)}</div><h1 style="font-size:24px">${esc(item.name)}</h1></div></div>
      <div class="card info-grid"><div><b>${item.minutes} 分</b><span>預估時間</span></div><div><b>每 ${item.freqDays} 天</b><span>建議頻率</span></div>
      <div><b class="${st.level === 'over' ? 't-over' : ''}">${st.days === null ? '—' : st.text}</b><span>上次打掃</span></div></div>
      <div class="section-title">所需清潔用品</div><div class="card pad">${supplyChips(sups)}</div>
      ${item.note ? `<div class="section-title">步驟／說明</div><div class="card pad" style="white-space:pre-wrap">${esc(item.note)}</div>` : ''}
      ${future ? `<div class="hint" style="margin-top:18px">這天（${fmtDate(date)}）還沒到，到時候再來打勾吧！</div>` : `
      <div class="section-title">${date === t ? '這次的備註（選填）' : `${fmtDate(date)} 的備註（選填）`}</div>
      <div class="card"><textarea class="input" id="lognote" placeholder="例如：抽油煙機很油，下次用強力去油劑">${esc(log?.note || '')}</textarea></div>
      ${state.members.length > 1 ? `<div class="section-title">誰打掃的</div><div class="chips" id="who">${state.members.map(m => `<button class="chip ${m.id === (memberId || state.members[0].id) ? 'on' : ''}" data-sa="who" data-v="${m.id}">${esc(m.name)}</button>`).join('')}</div>` : ''}
      <div class="btns">${log ? `<button class="btn block" data-sa="saveNote">儲存備註</button><button class="btn danger-soft block" data-sa="undo">取消完成</button>`
        : `<button class="btn block" data-sa="done">✓ 完成打掃</button>`}</div>`}
      <div class="btns"><button class="btn soft block" data-sa="edit">編輯這個項目</button></div>
      ${hist.length ? `<div class="section-title">最近紀錄</div><div class="card">${hist.map(l => `<div class="row"><div class="row-main"><div class="row-title" style="font-size:15px">${fmtDate(l.date)} <span style="color:var(--text-2)">· ${relDays(l.date)}</span> ${memberBadge(l.memberId)}</div>
        ${l.note ? `<div class="note">${esc(l.note)}</div>` : ''}</div></div>`).join('')}</div>` : ''}`;
  };
  const who = b => b.querySelector('#who .chip.on')?.dataset.v || state.members[0]?.id || null;
  openSheet({
    title: date === t ? '打掃項目' : fmtShort(date) + ' 的打掃', cancelLabel: '關閉', render,
    actions: {
      who(el, b) { b.querySelectorAll('#who .chip').forEach(c => c.classList.toggle('on', c === el)); },
      done(_, b) { complete(itemId, date, b.querySelector('#lognote').value.trim(), who(b)); closeSheet(); render0(); celebrate(date); },
      saveNote(_, b) {
        const log = state.logs.find(l => l.itemId === itemId && l.date === date);
        if (log) { log.note = b.querySelector('#lognote').value.trim(); if (state.members.length > 1) log.memberId = who(b); save(); }
        closeSheet(); render0(); toast('已儲存備註');
      },
      undo() { uncomplete(itemId, date); closeSheet(); render0(); toast('已取消完成'); },
      edit() { itemEditSheet(area.id, itemId); }
    }
  });
}

/* ---------- 編輯項目 ---------- */
function itemEditSheet(areaId, itemId) {
  const area = areaById(areaId);
  if (!area) return;
  const item = itemId ? area.items.find(i => i.id === itemId) : null;
  const st = item ? { ...item, supplies: [...item.supplies] } : { name: '', minutes: 10, freqDays: 7, supplies: [], note: '' };
  let touched = !!item;
  openSheet({
    title: item ? '編輯項目' : `新增項目到「${area.name}」`, saveLabel: item ? '儲存' : '新增',
    render: () => `<div class="section-title">基本資料</div><div class="card">
        <div class="field"><label>名稱</label><input class="input" id="f-name" value="${esc(st.name)}" placeholder="例如：電視櫃" maxlength="30"></div>
        <div class="field"><label>預估時間</label><input class="input" id="f-min" type="number" inputmode="numeric" min="1" max="600" value="${st.minutes}"><span class="unit">分鐘</span></div>
        <div class="presets">${[5, 10, 15, 20, 30, 45, 60].map(n => `<button class="chip" data-sa="min" data-v="${n}">${n} 分</button>`).join('')}</div>
        <div class="field"><label>建議頻率</label><span class="unit">每</span><input class="input" id="f-freq" type="number" inputmode="numeric" min="1" max="365" value="${st.freqDays}"><span class="unit">天一次</span></div>
        <div class="presets">${[[1, '每天'], [3, '3 天'], [7, '每週'], [14, '兩週'], [30, '每月'], [90, '每季'], [180, '半年']].map(([n, l]) => `<button class="chip" data-sa="freq" data-v="${n}">${l}</button>`).join('')}</div></div>
      <div class="hint">建議頻率用來判斷「該打掃了」的提醒顏色。</div>
      <div class="section-title">所需清潔用品<button class="r" data-sa="suggest">✨ 依名稱自動建議</button></div>
      <div class="card pad"><div class="chips" id="f-sup">${state.supplies.map(s => `<button class="chip ${st.supplies.includes(s.id) ? 'on' : ''}" data-sa="sup" data-v="${s.id}">${esc(s.icon || '')} ${esc(s.name)}</button>`).join('')}</div></div>
      <div class="hint">清潔用品可以在「設定 → 清潔用品庫」新增。</div>
      <div class="section-title">步驟／說明（選填）</div>
      <div class="card"><textarea class="input" id="f-note" placeholder="例如：先噴清潔劑靜置 5 分鐘再擦">${esc(st.note)}</textarea></div>
      ${item ? `<div class="btns"><button class="btn danger-soft block" data-sa="del">刪除這個項目</button></div>` : ''}`,
    mount(b) {
      const sync = () => { st.name = b.querySelector('#f-name').value; st.minutes = b.querySelector('#f-min').value; st.freqDays = b.querySelector('#f-freq').value; st.note = b.querySelector('#f-note').value; };
      b.querySelectorAll('input,textarea').forEach(el => el.addEventListener('input', sync));
      // 新項目：輸入名稱後自動帶入建議用品（使用者還沒手動選過時）
      b.querySelector('#f-name').addEventListener('blur', () => {
        if (!sheet || touched || !st.name.trim()) return;
        const sug = suggestSupplies(st.name);
        if (sug.length) { st.supplies = sug; sheet.rerender(); }
      });
      if (!item) setTimeout(() => b.querySelector('#f-name')?.focus(), 350);
    },
    actions: {
      min(el, b) { b.querySelector('#f-min').value = st.minutes = el.dataset.v; },
      freq(el, b) { b.querySelector('#f-freq').value = st.freqDays = el.dataset.v; },
      sup(el) { touched = true; const id = el.dataset.v; st.supplies = st.supplies.includes(id) ? st.supplies.filter(x => x !== id) : [...st.supplies, id]; el.classList.toggle('on'); },
      suggest() { const sug = suggestSupplies(st.name); touched = true; if (!sug.length) return toast('找不到建議，請手動選擇'); st.supplies = [...new Set([...st.supplies, ...sug])]; sheet.rerender(); toast('已加入建議的用品'); },
      del() {
        if (!confirm(`確定刪除「${item.name}」？（歷史紀錄會保留）`)) return;
        area.items = area.items.filter(i => i.id !== item.id);
        cleanupSchedules();
        save(); closeSheet(); render0(); toast('已刪除');
      }
    },
    onSave() {
      const name = st.name.trim();
      if (!name) return toast('請輸入項目名稱');
      const data = { name, minutes: clampInt(st.minutes, 1, 600, 10), freqDays: clampInt(st.freqDays, 1, 365, 7), supplies: st.supplies, note: st.note.trim() };
      if (item) Object.assign(item, data); else area.items.push({ id: uid(), ...data });
      save(); closeSheet(); render0(); toast(item ? '已儲存' : '已新增項目');
    }
  });
}

// 刪除項目/區域後，同步清理排程
function cleanupSchedules() {
  state.schedules = state.schedules.filter(r => {
    const area = areaById(r.areaId);
    if (!area) return false;
    if (r.itemIds) { r.itemIds = r.itemIds.filter(id => area.items.some(i => i.id === id)); if (!r.itemIds.length) return false; }
    return true;
  });
}

/* ---------- 編輯區域 ---------- */
const AREA_ICONS = ['🛋️', '🍳', '🚽', '🛁', '🛏️', '🧸', '📚', '🖥️', '🪴', '🧺', '🍽️', '🚪', '👕', '🪞', '🚗', '🐾', '🏠', '🧹', '🪟', '🗄️', '🎮', '🧒', '🏢', '✨'];
function templateFor(name) {
  const n = name.trim();
  const key = AREA_TEMPLATES[n] ? n : TEMPLATE_ALIASES[n] || Object.keys(AREA_TEMPLATES).find(k => n.includes(k));
  return key ? { key, tpl: AREA_TEMPLATES[key] } : null;
}
function areaEditSheet(areaId) {
  const area = areaId ? areaById(areaId) : null;
  const st = { name: area?.name || '', icon: area?.icon || '🏠', useTpl: true, iconTouched: !!area };
  openSheet({
    title: area ? '編輯區域' : '新增區域', saveLabel: area ? '儲存' : '新增',
    render: () => {
      const tf = !area && templateFor(st.name);
      return `<div class="section-title">名稱</div><div class="card"><div class="field"><input class="input" id="a-name" value="${esc(st.name)}" placeholder="例如：客廳、主臥、浴室" maxlength="20"></div></div>
      <div id="tpl-hint">${tf ? `<div class="card" style="margin-top:12px"><button class="row" data-sa="tpl"><div class="row-main"><div class="row-title">自動加入常見項目</div>
        <div class="row-sub">${tf.tpl.items.map(i => i[0]).join('、')}</div></div><span class="switch ${st.useTpl ? 'on' : ''}"></span></button></div>` : ''}</div>
      <div class="section-title">圖示</div><div class="card"><div class="emoji-grid">${AREA_ICONS.map(ic => `<button class="${ic === st.icon ? 'on' : ''}" data-sa="icon" data-v="${ic}">${ic}</button>`).join('')}</div></div>
      ${area ? `<div class="btns"><button class="btn danger-soft block" data-sa="del">刪除這個區域</button></div>` : ''}`;
    },
    mount(b) {
      const inp = b.querySelector('#a-name');
      inp.addEventListener('input', () => {
        st.name = inp.value;
        if (area) return;
        const tf = templateFor(st.name);
        if (tf && !st.iconTouched) st.icon = tf.tpl.icon;
        // 只更新提示區與圖示，避免輸入框失焦
        const hint = b.querySelector('#tpl-hint');
        hint.innerHTML = tf ? `<div class="card" style="margin-top:12px"><button class="row" data-sa="tpl"><div class="row-main"><div class="row-title">自動加入常見項目</div>
          <div class="row-sub">${tf.tpl.items.map(i => i[0]).join('、')}</div></div><span class="switch ${st.useTpl ? 'on' : ''}"></span></button></div>` : '';
        b.querySelectorAll('.emoji-grid button').forEach(x => x.classList.toggle('on', x.dataset.v === st.icon));
      });
      if (!area) setTimeout(() => inp.focus(), 350);
    },
    actions: {
      icon(el, b) { st.icon = el.dataset.v; st.iconTouched = true; b.querySelectorAll('.emoji-grid button').forEach(x => x.classList.toggle('on', x === el)); },
      tpl(el) { st.useTpl = !st.useTpl; el.querySelector('.switch').classList.toggle('on', st.useTpl); },
      del() {
        if (!confirm(`確定刪除「${area.name}」和裡面的所有項目？（歷史紀錄會保留）`)) return;
        state.areas = state.areas.filter(a => a.id !== area.id);
        cleanupSchedules(); save(); closeSheet(); ui.areaId = null; render0(); toast('已刪除區域');
      }
    },
    onSave() {
      const name = st.name.trim();
      if (!name) return toast('請輸入區域名稱');
      if (area) { area.name = name; area.icon = st.icon; save(); closeSheet(); render0(); return toast('已儲存'); }
      const tf = templateFor(name);
      const a = buildArea(name, st.useTpl && tf ? tf.tpl : null, state.supplies);
      a.icon = st.icon;
      state.areas.push(a); save(); closeSheet();
      ui.tab = 'areas'; ui.areaId = a.id; render(true);
      toast(a.items.length ? `已新增區域，並加入 ${a.items.length} 個常見項目` : '已新增區域，接著新增項目吧');
    }
  });
}

/* ---------- 新增 / 編輯排程 ---------- */
function scheduleSheet(rule, preset = {}) {
  if (!state.areas.length) return toast('請先到「區域」新增區域');
  const st = rule ? JSON.parse(JSON.stringify(rule)) : {
    id: uid(), type: preset.date ? 'once' : 'weekly', date: preset.date || todayStr(),
    weekdays: [parse(preset.date || todayStr()).getDay()], areaId: preset.areaId || state.areas[0].id, itemIds: null, memberId: null
  };
  if (!st.date) st.date = todayStr();
  if (!st.weekdays.length && st.type !== 'weekly') st.weekdays = [parse(st.date).getDay()];
  openSheet({
    title: rule ? '編輯排程' : '新增排程', saveLabel: '儲存',
    render: () => {
      const area = areaById(st.areaId) || state.areas[0];
      const items = st.itemIds ? area.items.filter(i => st.itemIds.includes(i.id)) : area.items;
      return `<div class="section-title">什麼時候</div>
      <div class="seg">${[['once', '指定日期'], ['weekly', '每週'], ['daily', '每天']].map(([v, l]) => `<button class="${st.type === v ? 'on' : ''}" data-sa="type" data-v="${v}">${l}</button>`).join('')}</div>
      <div style="margin-top:10px">${st.type === 'once' ? `<div class="card"><div class="field"><label>日期</label><input class="input" type="date" id="s-date" value="${st.date}"></div></div>`
        : st.type === 'weekly' ? `<div class="chips">${weekOrder().map(w => `<button class="chip ${st.weekdays.includes(w) ? 'on' : ''}" data-sa="wd" data-v="${w}">週${WD[w]}</button>`).join('')}</div><div class="hint" style="margin-left:2px">可以選多天</div>`
        : `<div class="hint" style="margin-left:2px">每天都會出現在「今天」清單，適合每天要做的小事</div>`}</div>
      <div class="section-title">打掃哪個區域</div>
      <div class="area-pick">${state.areas.map(a => `<button class="pick ${a.id === area.id ? 'on' : ''}" data-sa="area" data-v="${a.id}"><span class="emoji">${esc(a.icon)}</span>${esc(a.name)}</button>`).join('')}</div>
      <div class="section-title">哪些項目</div><div class="card">
        <button class="row" data-sa="all"><div class="row-main"><div class="row-title">整個區域（全部項目）</div></div><span class="switch ${st.itemIds ? '' : 'on'}"></span></button>
        ${st.itemIds ? area.items.map(i => `<button class="row" data-sa="itm" data-v="${i.id}"><span class="check ${st.itemIds.includes(i.id) ? 'on' : ''}" style="width:24px;height:24px"></span>
          <div class="row-main"><div class="row-title">${esc(i.name)}</div></div><span class="row-right">${i.minutes} 分</span></button>`).join('') || '<div class="row"><span class="hint" style="margin:0">這個區域還沒有項目</span></div>' : ''}
      </div>
      ${state.members.length > 1 ? `<div class="section-title">負責人</div><div class="chips">
        <button class="chip ${!st.memberId ? 'on' : ''}" data-sa="mem" data-v="">不指定</button>
        ${state.members.map(m => `<button class="chip ${st.memberId === m.id ? 'on' : ''}" data-sa="mem" data-v="${m.id}">${esc(m.name)}</button>`).join('')}</div>` : ''}
      <div class="card pad" style="margin-top:18px;display:flex;justify-content:space-between"><span>預估時間</span><b>${items.length} 項 · ${fmtMin(sum(items.map(i => i.minutes)))}</b></div>
      ${rule ? `<div class="btns"><button class="btn danger-soft block" data-sa="del">刪除這個排程</button></div>` : ''}`;
    },
    mount(b) { b.querySelector('#s-date')?.addEventListener('change', e => { st.date = e.target.value; }); },
    actions: {
      type(el) { st.type = el.dataset.v; if (st.type === 'weekly' && !st.weekdays.length) st.weekdays = [parse(st.date).getDay()]; sheet.rerender(); },
      wd(el) { const w = +el.dataset.v; st.weekdays = st.weekdays.includes(w) ? st.weekdays.filter(x => x !== w) : [...st.weekdays, w]; el.classList.toggle('on'); },
      area(el) { st.areaId = el.dataset.v; st.itemIds = null; sheet.rerender(); },
      all() { st.itemIds = st.itemIds ? null : []; sheet.rerender(); },
      itm(el) { const id = el.dataset.v; st.itemIds = st.itemIds.includes(id) ? st.itemIds.filter(x => x !== id) : [...st.itemIds, id]; sheet.rerender(); },
      mem(el, b) { st.memberId = el.dataset.v || null; el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); },
      del() { if (!confirm('確定刪除這個排程？')) return; state.schedules = state.schedules.filter(r => r.id !== st.id); save(); closeSheet(); render0(); toast('已刪除排程'); }
    },
    onSave() {
      if (st.type === 'once' && !st.date) return toast('請選擇日期');
      if (st.type === 'weekly' && !st.weekdays.length) return toast('請至少選一天');
      if (st.itemIds && !st.itemIds.length) return toast('請至少選一個項目');
      const area = areaById(st.areaId);
      if (!area.items.length) return toast('這個區域還沒有項目，請先新增項目');
      const clean = { id: st.id, type: st.type, date: st.type === 'once' ? st.date : null, weekdays: st.type === 'weekly' ? st.weekdays : [], areaId: st.areaId, itemIds: st.itemIds, memberId: st.memberId };
      const i = state.schedules.findIndex(r => r.id === st.id);
      if (i >= 0) state.schedules[i] = clean; else state.schedules.push(clean);
      save(); closeSheet(); render0(); toast(rule ? '已更新排程' : '已新增排程');
    }
  });
}

/* ---------- 成員 / 用品 ---------- */
const MEMBER_COLORS = ['#5AA9E6', '#FF8A80', '#7BC67E', '#F5B84B', '#B39DDB', '#4DB6AC', '#F48FB1', '#90A4AE'];
function memberSheet(id) {
  const m = id ? memberById(id) : null;
  const st = { name: m?.name || '', color: m?.color || MEMBER_COLORS[state.members.length % MEMBER_COLORS.length] };
  openSheet({
    title: m ? '編輯成員' : '新增成員', saveLabel: '儲存',
    render: () => `<div class="section-title">名稱</div><div class="card"><div class="field"><input class="input" id="m-name" value="${esc(st.name)}" placeholder="例如：媽媽、小明" maxlength="12"></div></div>
      <div class="section-title">代表色</div><div class="card pad"><div class="chips">${MEMBER_COLORS.map(c => `<button class="color-dot" style="background:${c};width:34px;height:34px;${c === st.color ? 'outline:3px solid var(--text-3);outline-offset:2px' : ''}" data-sa="color" data-v="${c}"></button>`).join('')}</div></div>
      ${m && state.members.length > 1 ? `<div class="btns"><button class="btn danger-soft block" data-sa="del">刪除這位成員</button></div>` : ''}`,
    mount(b) { b.querySelector('#m-name').addEventListener('input', e => st.name = e.target.value); },
    actions: {
      color(el) { st.color = el.dataset.v; sheet.rerender(); },
      del() {
        if (!confirm(`確定刪除「${m.name}」？`)) return;
        state.members = state.members.filter(x => x.id !== m.id);
        state.schedules.forEach(r => { if (r.memberId === m.id) r.memberId = null; });
        save(); closeSheet(); render0();
      }
    },
    onSave() {
      const name = st.name.trim(); if (!name) return toast('請輸入名稱');
      if (m) Object.assign(m, { name, color: st.color }); else state.members.push({ id: uid(), name, color: st.color });
      save(); closeSheet(); render0();
    }
  });
}
const SUPPLY_ICONS = ['🧴', '🧽', '🧻', '🧹', '🪣', '🫧', '🧤', '🪥', '🪠', '🌀', '🪶', '🪟', '🍋', '🌊', '🗑️', '🧯', '🧂', '🫙', '🛒', '✨'];
function supplySheet(id) {
  const s = id ? supplyById(id) : null;
  const st = { name: s?.name || '', icon: s?.icon || '🧴' };
  openSheet({
    title: s ? '編輯清潔用品' : '新增清潔用品', saveLabel: '儲存',
    render: () => `<div class="section-title">名稱</div><div class="card"><div class="field"><input class="input" id="u-name" value="${esc(st.name)}" placeholder="例如：小蘇打粉" maxlength="20"></div></div>
      <div class="section-title">圖示</div><div class="card"><div class="emoji-grid">${SUPPLY_ICONS.map(ic => `<button class="${ic === st.icon ? 'on' : ''}" data-sa="icon" data-v="${ic}">${ic}</button>`).join('')}</div></div>
      ${s ? `<div class="btns"><button class="btn danger-soft block" data-sa="del">刪除這個用品</button></div>` : ''}`,
    mount(b) { b.querySelector('#u-name').addEventListener('input', e => st.name = e.target.value); },
    actions: {
      icon(el, b) { st.icon = el.dataset.v; b.querySelectorAll('.emoji-grid button').forEach(x => x.classList.toggle('on', x === el)); },
      del() {
        if (!confirm(`確定刪除「${s.name}」？會從所有項目中移除。`)) return;
        state.supplies = state.supplies.filter(x => x.id !== s.id);
        state.areas.forEach(a => a.items.forEach(i => { i.supplies = i.supplies.filter(x => x !== s.id); }));
        save(); closeSheet(); render0();
      }
    },
    onSave() {
      const name = st.name.trim(); if (!name) return toast('請輸入名稱');
      if (s) Object.assign(s, { name, icon: st.icon }); else state.supplies.push({ id: uid(), name, icon: st.icon });
      save(); closeSheet(); render0();
    }
  });
}

function installSheet() {
  openSheet({
    title: '加入主畫面', cancelLabel: '關閉',
    render: () => `<div class="card"><ol class="steps">
      <li>用 <b>Safari</b> 打開這個網頁</li>
      <li>點下方的 <b>分享按鈕</b>（方框加向上箭頭）</li>
      <li>往下滑，選 <b>「加入主畫面」</b></li>
      <li>按右上角 <b>「新增」</b></li></ol></div>
      <div class="hint">之後從主畫面圖示打開，就會像 App 一樣全螢幕顯示，沒有網路也能使用。<br><br>
      ⚠️ 注意：主畫面版本和 Safari 裡的資料是分開存的。建議固定從主畫面打開；如果要搬資料，可以用「匯出備份 → 還原」。</div>`
  });
}

/* =========================================================
 * 備份 / 還原
 * ========================================================= */
async function exportData() {
  const json = JSON.stringify(state, null, 2);
  const name = `打掃小幫手備份-${todayStr()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const mark = () => { state.settings.lastBackup = todayStr(); save(); render0(); toast('備份完成 ✓'); };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: '打掃小幫手備份' }); return mark(); }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  mark();
}
$('#import-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = normalize(JSON.parse(await f.text()));
    if (!confirm(`備份內含 ${data.areas.length} 個區域、${data.logs.length} 筆紀錄。\n確定要用它覆蓋目前的資料嗎？`)) return;
    state = data; save(); ui.areaId = null; render(true); toast('已還原備份 ✓');
  } catch (err) { alert('無法讀取這個檔案：' + err.message); }
});

/* =========================================================
 * 互動事件
 * ========================================================= */
function render0() { render(false); }
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}
function celebrate(date) {
  const { tasks } = tasksFor(date);
  const left = tasks.filter(x => !x.log).length;
  toast(!tasks.length ? '完成！✨' : left ? `完成！✨ 還剩 ${left} 項` : '全部完成，太棒了 🎉');
}

const A = {
  pickDate: el => { ui.selDate = el.dataset.date; render0(); },
  weekShift: el => { ui.selDate = addDays(ui.selDate, +el.dataset.n); render0(); },
  gotoDay: el => { ui.selDate = el.dataset.date; ui.tab = 'today'; render(true); },
  toggle: el => {
    const { item, date } = el.dataset;
    if (date > todayStr()) return toast('這天還沒到喔');
    if (state.logs.some(l => l.itemId === item && l.date === date)) { uncomplete(item, date); render0(); toast('已取消完成'); return; }
    complete(item, date, '', el.dataset.member || state.members[0]?.id || null);
    render0();
    const btn = view.querySelector(`.check[data-item="${item}"][data-date="${date}"]`);
    btn && btn.classList.add('pop');
    celebrate(date);
  },
  item: el => itemSheet(el.dataset.item, el.dataset.date),
  addSchedule: el => scheduleSheet(null, { date: el.dataset.date, areaId: el.dataset.area }),
  editSchedule: el => scheduleSheet(state.schedules.find(r => r.id === el.dataset.id)),
  clearPast: () => { if (!confirm('清除所有已過去的單次排程？（打掃紀錄不受影響）')) return; const t = todayStr(); state.schedules = state.schedules.filter(r => !(r.type === 'once' && r.date < t)); save(); render0(); },
  openArea: el => { ui.areaId = el.dataset.id; render(true); },
  backAreas: () => { ui.areaId = null; render(true); },
  addArea: () => areaEditSheet(null),
  editArea: el => areaEditSheet(el.dataset.id),
  addItem: el => itemEditSheet(el.dataset.id, null),
  toggleAttention: () => { ui.showAllAttention = !ui.showAllAttention; render0(); },
  moreHistory: () => { ui.historyLimit += 40; render0(); },
  delLog: el => { if (!confirm('刪除這筆打掃紀錄？')) return; state.logs = state.logs.filter(l => l.id !== el.dataset.id); save(); render0(); },
  addMember: () => memberSheet(null),
  editMember: el => memberSheet(el.dataset.id),
  addSupply: () => supplySheet(null),
  editSupply: el => supplySheet(el.dataset.id),
  weekStart: el => { state.settings.weekStart = +el.dataset.v; save(); render0(); },
  installHelp: () => installSheet(),
  export: () => exportData(),
  import: () => $('#import-file').click(),
  goBackup: () => { ui.tab = 'settings'; render(); $('#backup')?.scrollIntoView({ behavior: 'smooth' }); },
  reset: () => {
    if (!confirm('確定要清除所有資料嗎？區域、排程、紀錄都會刪除，無法復原。\n（建議先匯出備份）')) return;
    if (!confirm('真的確定嗎？')) return;
    state = defaultData(); save(); ui.areaId = null; ui.tab = 'today'; ui.selDate = todayStr(); render(true); toast('已恢復預設');
  }
};
view.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && A[el.dataset.act]) A[el.dataset.act](el, e);
});
$('#tabbar').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  const tab = b.dataset.tab;
  if (tab === ui.tab && tab === 'areas') ui.areaId = null;      // 再點一次「區域」回到列表
  if (tab === ui.tab && tab === 'today') ui.selDate = todayStr(); // 再點一次「今天」回到今天
  ui.tab = tab;
  render(true);
});

// 從背景回到 App 時，如果已經換日，自動切到新的一天
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const t = todayStr();
  if (t !== ui.lastToday) { if (ui.selDate === ui.lastToday) ui.selDate = t; ui.lastToday = t; render0(); }
});

render(true);

// 註冊 Service Worker（讓網頁可以離線使用、加入主畫面像 App）
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
