/* ══════════════════════════════════════════════════════════
   考研工作台 · 逻辑层
   数据全部存于 LocalStorage: ky_workbench_v1
   ══════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* ── 常量 ─────────────────────────────────────────────── */
var STORE_KEY = 'ky_workbench_v1';

var SUBJECTS = [
  { key: 'politics', name: '政治',   short: '政',  color: '#E07B00', max: 100 },
  { key: 'english',  name: '英语二', short: '英',  color: '#0A7CFF', max: 100 },
  { key: 'math',     name: '数学二', short: '数',  color: '#9B4BE0', max: 150 },
  // key 沿用 cs408 以兼容历史成绩数据，显示名按专业课展示
  { key: 'cs408',    name: '专业课', short: '专',  color: '#1FA84A', max: 150 }
];
var SUBJECT_MAP = {};
SUBJECTS.forEach(function (s) { SUBJECT_MAP[s.key] = s; });

var DEFAULT_SETTINGS = {
  school: '武汉理工大学',
  major: '数二英二',
  salaryGoal: '20w',
  examDate: '2026-12-19',
  // 每日每科目标学习时长（分钟）
  dailySubjectMin: { politics: 45, english: 60, math: 120, cs408: 90 },
  targets: { politics: 65, english: 65, math: 120, cs408: 105 }
};
var MAX_TODOS = 5; // 每天最多事项数
/* 备考阶段：按「距考试天数」划分，改考试日期也自洽 */
var PHASES = [
  { name: '模考阶段', color: '#E5484D', to: 21 },
  { name: '冲刺阶段', color: '#E07B00', to: 70 },
  { name: '强化阶段', color: '#0A7CFF', to: 160 },
  { name: '基础阶段', color: '#1FA84A', to: null }
];

/* ── 日期工具 ─────────────────────────────────────────── */
function pad(n) { return (n < 10 ? '0' : '') + n; }
function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function today() { return keyOf(new Date()); }
function parseKey(k) {
  var p = String(k).split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function dayDiff(a, b) { // b - a 的整天数
  var x = parseKey(a), y = parseKey(b);
  x.setHours(0, 0, 0, 0); y.setHours(0, 0, 0, 0);
  return Math.round((y - x) / 86400000);
}
var WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function fmtMD(k) { var d = parseKey(k); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
function fmtMDW(k) { var d = parseKey(k); return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WD[d.getDay()]; }
function fmtShort(k) { var d = parseKey(k); return (d.getMonth() + 1) + '/' + d.getDate(); }

function hoursText(min) {
  min = Math.max(0, Math.round(min));
  var h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return m + ' 分钟';
  if (m === 0) return h + ' 小时';
  return h + ' 小时 ' + m + ' 分';
}
function hoursShort(min) {
  min = Math.max(0, Math.round(min));
  var h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return m + 'm';
  return h + 'h' + (m ? pad(m) : '');
}
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  if (!isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}
/* 有效成绩：必须是数字，且在 0 ~ 该科满分之间；越界/负数视为无效，不参与统计 */
function scoreOf(key, v) {
  var n = num(v);
  if (n === null || !SUBJECT_MAP[key]) return null;
  return n >= 0 && n <= SUBJECT_MAP[key].max ? n : null;
}
function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ── 示例数据（仅首次打开时写入，可在设置里清空） ──────── */
function seed() {
  var t = new Date();
  function back(n) { return keyOf(addDays(t, -n)); }
  var st = {
    v: STATE_VERSION,
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    records: [
      { id: uid(), date: back(100), type: 'single', subject: 'math', score: 88 },
      { id: uid(), date: back(88),  type: 'full', politics: 55, english: 55, math: 96, cs408: 90 },
      { id: uid(), date: back(72),  type: 'single', subject: 'english', score: 58 },
      { id: uid(), date: back(58),  type: 'single', subject: 'cs408', score: 86 },
      { id: uid(), date: back(51),  type: 'full', politics: 58, english: 60, math: 106, cs408: 98, year: 2024, note: '第一次完整模考' },
      { id: uid(), date: back(37),  type: 'single', subject: 'politics', score: 57 },
      { id: uid(), date: back(30),  type: 'single', subject: 'math', score: 112 },
      { id: uid(), date: back(23),  type: 'single', subject: 'english', score: 61 },
      { id: uid(), date: back(16),  type: 'full', politics: 62, english: 63, math: 112, cs408: 101, year: 2025, note: '数学概率大题全错，时间不够' },
      { id: uid(), date: back(7),   type: 'single', subject: 'cs408', score: 104, year: 2024 },
      { id: uid(), date: back(3),   type: 'single', subject: 'politics', score: 64 }
    ],
    study: {},
    checks: {},
    todos: {}
  };
  st.todos[today()] = [
    { id: uid(), text: '数学 2019 真题第二遍 + 专业课第 5 章', done: false },
    { id: uid(), text: '英语二 2016 阅读精读 + 背 1 个 unit', done: false },
    { id: uid(), text: '政治马原第 4 章选择题 30 道', done: false }
  ];
  st.todos[keyOf(addDays(t, 1))] = [
    { id: uid(), text: '专业课计算机网络第 3 章 + 数学级数错题复盘', done: false }
  ];
  st.todos[back(1)] = [{ id: uid(), text: '数学错题复盘：级数与微分方程', done: true }];
  st.todos[back(2)] = [
    { id: uid(), text: '专业课操作系统第二章', done: true },
    { id: uid(), text: '政治马原第 3 章 + 英语长难句 20 句', done: true }
  ];
  st.todos[keyOf(addDays(t, 3))] = [{ id: uid(), text: '阶段模考：数学 + 专业课全真模拟', done: false }];
  st.todos['2026-12-19'] = [{ id: uid(), text: '考研初试 · 上午 8:30 政治 / 下午 2:00 英语', done: false }];
  return st;
}

/* 事项归一化：兼容旧的单条对象结构，每个日期最多 5 条 */
function normTodos(t) {
  var out = {};
  Object.keys(t || {}).forEach(function (k) {
    var v = t[k], arr = [];
    if (Array.isArray(v)) arr = v;
    else if (v && typeof v === 'object' && v.text) arr = [v];
    arr = arr
      .filter(function (x) { return x && typeof x.text === 'string' && x.text.trim(); })
      .slice(0, MAX_TODOS)
      .map(function (x) { return { id: x.id || uid(), text: x.text.trim(), done: !!x.done }; });
    if (arr.length) out[k] = arr;
  });
  return out;
}

/* ── 持久化 ───────────────────────────────────────────── */
var state = null;
var STATE_VERSION = 2;

/* 一次性数据迁移：老存档自动跟上院校/考试科目的变更 */
function migrate(d) {
  var v = d.v || 1;
  if (v < 2) {
    var st = d.settings || {};
    // 仅在仍是旧默认值时才替换，避免覆盖用户自己改过的院校
    if (st.school === '杭州电子科技大学') st.school = '武汉理工大学';
    if (st.major === '11408') st.major = '数二英二';
    d.v = 2;
  }
  return d;
}

function load() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return seed();
    var d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return seed();
    d = migrate(d);
    d.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
    d.settings.targets = Object.assign({}, DEFAULT_SETTINGS.targets, (d.settings && d.settings.targets) || {});
    d.settings.dailySubjectMin = Object.assign({}, DEFAULT_SETTINGS.dailySubjectMin,
      (d.settings && d.settings.dailySubjectMin) || {});
    // 旧版本字段已废弃
    delete d.settings.startDate;
    delete d.settings.targetTotal;
    delete d.settings.dailyGoalMin;
    if (!Array.isArray(d.records)) d.records = [];
    if (!d.study || typeof d.study !== 'object') d.study = {};
    if (!d.checks || typeof d.checks !== 'object') d.checks = {};
    d.todos = normTodos(d.todos);
    return d;
  } catch (e) {
    return seed();
  }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('本机存储写入失败'); }
}

/* ── 派生数据 ─────────────────────────────────────────── */
/* 目标总分 = 四科目标之和 */
function targetSum() {
  var t = state.settings.targets, sum = 0;
  SUBJECTS.forEach(function (s) { sum += num(t[s.key]) || 0; });
  return Math.round(sum * 10) / 10;
}
/* 顶栏副标题里的目标文案：没设目标时不要写成「目标 0 分」 */
function goalSubText() {
  var tg = targetSum();
  return (tg > 0 ? '目标 ' + tg + ' 分' : '未设置目标') + ' · 每日 ' + hoursShort(dailyTotalMin());
}
/* 每日目标总时长 = 各科之和 */
function dailyTotalMin() {
  var m = state.settings.dailySubjectMin, sum = 0;
  SUBJECTS.forEach(function (s) { sum += num(m[s.key]) || 0; });
  return Math.round(sum);
}
function todosOf(dk) {
  return Array.isArray(state.todos[dk]) ? state.todos[dk] : [];
}
function todoCount() {
  return Object.keys(state.todos).reduce(function (a, k) { return a + state.todos[k].length; }, 0);
}
/* 每日每科完成打勾 */
function checksOf(dk) { return state.checks[dk] || {}; }
function toggleCheck(dk, key) {
  var c = state.checks[dk] || (state.checks[dk] = {});
  if (c[key]) delete c[key]; else c[key] = true;
  if (!Object.keys(c).length) delete state.checks[dk];
  save();
}
/* 当前备考阶段 */
function currentPhase() {
  var s = state.settings;
  var left = dayDiff(today(), s.examDate);
  if (left < 0) return { over: true, left: left, name: '已完成考试', color: '#E5484D', pct: 100 };
  for (var i = 0; i < PHASES.length; i++) {
    var p = PHASES[i];
    if (p.to === null || left <= p.to) {
      var prevTo = i > 0 ? PHASES[i - 1].to : null;
      var next = i > 0 ? PHASES[i - 1] : null;
      var span = p.to === null ? null : p.to - (prevTo || 0);
      var into = p.to === null ? null : p.to - left;
      return {
        name: p.name, color: p.color, left: left, span: span, into: into,
        pct: span ? clamp(into / span * 100, 0, 100) : 0,
        next: next, daysToNext: next ? left - next.to : null
      };
    }
  }
}
/* 最该补的一科：按「分数缺口 ÷ 该科满分」排序 */
function weakestSubject() {
  var worst = null;
  SUBJECTS.forEach(function (sj) {
    var l = latestSubject(sj.key);
    var tg = num(state.settings.targets[sj.key]) || 0;
    if (!l || tg <= 0) return;
    var gap = Math.round((tg - l.value) * 10) / 10;
    if (gap <= 0) return;
    var ratio = gap / sj.max;
    if (!worst || ratio > worst.ratio) {
      worst = { key: sj.key, name: sj.name, color: sj.color, gap: gap, ratio: ratio };
    }
  });
  return worst;
}

function sortedRecords() {
  return state.records.slice().sort(function (a, b) {
    return a.date === b.date ? 0 : (a.date < b.date ? -1 : 1);
  });
}
function fullTests() {
  return sortedRecords().filter(function (r) { return r.type === 'full'; });
}
/* 某科目：单科记录 + 完整测试中的该科成绩（越界分数按无效处理） */
function subjectSeries(key) {
  return sortedRecords().filter(function (r) {
    return r.type === 'full' || r.subject === key;
  }).map(function (r) {
    return {
      date: r.date,
      value: scoreOf(key, r.type === 'full' ? r[key] : r.score),
      full: r.type === 'full',
      year: r.year || null,
      id: r.id
    };
  }).filter(function (p) { return p.value !== null; });
}
/* ── 单科统计 / 已记录科目 ─────────────────────────────── */
function round1(v) { return Math.round(v * 10) / 10; }
function latestOf(series) { return series.length ? series[series.length - 1] : null; }
function latestSubject(key) { return latestOf(subjectSeries(key)); }

/* 已记录科目 = 至少有一条有效成绩（单科记录，或完整测试中的该科分数）的科目数 */
function recordedCount() {
  var n = 0;
  SUBJECTS.forEach(function (sj) { if (latestSubject(sj.key)) n++; });
  return n;
}
/* 单科目标：未填 / 填 0 / 非法都视为「未设置」，不参与差距计算 */
function subjectTarget(key) {
  var t = num(state.settings.targets[key]);
  return t === null || t <= 0 ? null : t;
}
/* 单科：最近成绩、该科目标、差距、完成度 */
function subjectStat(key) {
  var sj = SUBJECT_MAP[key];
  var l = latestSubject(key);
  var tg = subjectTarget(key);
  var st = { key: key, sj: sj, has: !!l, score: null, date: null, target: tg, gap: null, pct: 0 };
  if (!l) return st;
  st.score = l.value;
  st.date = l.date;
  if (tg !== null) {
    st.gap = round1(tg - l.value);
    st.pct = clamp(l.value / tg * 100, 0, 100);
  } else {
    st.pct = clamp(l.value / sj.max * 100, 0, 100);
  }
  return st;
}
/* 最近一次成绩所属科目：单科取该科；完整测试取距目标缺口最大的一科（最需要关注） */
function latestScoredSubject() {
  var recs = sortedRecords();
  for (var i = recs.length - 1; i >= 0; i--) {
    var r = recs[i];
    if (r.type === 'single') {
      var v = scoreOf(r.subject, r.score);
      if (v !== null) return { key: r.subject, value: v, date: r.date, id: r.id };
    } else {
      var pick = null;
      SUBJECTS.forEach(function (sj) {
        var sv = scoreOf(sj.key, r[sj.key]);
        if (sv === null) return;
        var tg = subjectTarget(sj.key);
        var gap = tg === null ? -1e9 : tg - sv;
        if (!pick || gap > pick.gap) pick = { key: sj.key, value: sv, date: r.date, id: r.id, gap: gap };
      });
      if (pick) return pick;
    }
  }
  return null;
}
/* 单科差距文案：英语二最近成绩 62/100，距离该科目标还差 18 分 */
function subjectGapSentence(key) {
  var st = subjectStat(key);
  if (!st.has) return st.sj.name + '还没有成绩记录';
  var head = st.sj.name + '最近成绩 ' + st.score + '/' + st.sj.max;
  if (st.target === null) return head + '，该科还未设置目标';
  if (st.gap > 0) return head + '，距离该科目标还差 ' + st.gap + ' 分';
  if (st.gap < 0) return head + '，已超过该科目标 ' + Math.abs(st.gap) + ' 分';
  return head + '，已达到该科目标';
}
/* 页头 / 成绩页副标题：已记录科目 k/4，以及当前最该看的那一科或总分 */
function scoreSummaryText() {
  var n = recordedCount();
  var head = '已记录科目 ' + n + '/' + SUBJECTS.length;
  if (!n) return head + '，还没有成绩记录，先记录一科试试';
  var lt = latestTotal();
  var target = targetSum();
  if (lt) {
    if (target > 0) {
      var g = round1(target - lt.value);
      return head + '，最近总分 ' + lt.value + '/500，' +
        (g > 0 ? '距离目标总分还差 ' + g + ' 分' : (g < 0 ? '已超过目标总分 ' + Math.abs(g) + ' 分' : '已达到目标总分'));
    }
    return head + '，最近总分 ' + lt.value + '/500 · 未设置目标总分';
  }
  var raw = latestScoredSubject();
  return raw ? head + '，' + subjectGapSentence(raw.key) : head;
}

/* 总分轨迹：
   · 完整测试（四科齐全）→ 真实总分点
   · 四科都有成绩之后的每次更新 → 四科最近成绩合计（估算点）
   四科不满时没有任何总分点，避免拿单科成绩去比 500 分总分目标 */
function totalSeries() {
  if (recordedCount() < SUBJECTS.length) return [];
  var recs = sortedRecords();
  var latest = {}, known = 0, out = [];
  function addPoint(p) {
    var last = out[out.length - 1];
    if (last && last.date === p.date && Math.abs(last.value - p.value) < 0.05) {
      if (p.full) out[out.length - 1] = p;   // 同一天的真实总分优先于合计
      return;
    }
    out.push(p);
  }
  recs.forEach(function (r) {
    if (r.type === 'full') {
      var sum = 0, ok = true;
      SUBJECTS.forEach(function (s) {
        var v = scoreOf(s.key, r[s.key]);
        if (v === null) ok = false; else sum += v;
      });
      SUBJECTS.forEach(function (s) {
        var v = scoreOf(s.key, r[s.key]);
        if (v !== null) { if (latest[s.key] === undefined) known++; latest[s.key] = v; }
      });
      if (ok) {
        addPoint({ date: r.date, value: round1(sum), full: true, estimated: false, id: r.id, year: r.year || null });
        return;
      }
    } else {
      var sv = scoreOf(r.subject, r.score);
      if (sv === null) return;
      if (latest[r.subject] === undefined) known++;
      latest[r.subject] = sv;
    }
    if (known === SUBJECTS.length) {
      var total = 0;
      SUBJECTS.forEach(function (s) { total += latest[s.key]; });
      addPoint({ date: r.date, value: round1(total), full: false, estimated: true, id: r.id });
    }
  });
  return out;
}
/* 最近总分：只有四科都有成绩才返回，否则 null（不拿残缺数据比总分目标） */
function latestTotal() {
  var ts = totalSeries();
  if (!ts.length) return null;
  var last = ts[ts.length - 1];
  return { value: last.value, date: last.date, estimated: !!last.estimated, full: !!last.full };
}

/* ── 图表：折线（SVG） ────────────────────────────────── */
function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return 'M' + pts[0][0] + ',' + pts[0][1];
  var d = 'M' + pts[0][0] + ',' + pts[0][1];
  for (var i = 0; i < pts.length - 1; i++) {
    var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    var k = 0.2;
    var c1x = p1[0] + (p2[0] - p0[0]) * k, c1y = p1[1] + (p2[1] - p0[1]) * k;
    var c2x = p2[0] - (p3[0] - p1[0]) * k, c2y = p2[1] - (p3[1] - p1[1]) * k;
    d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) +
         ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
  }
  return d;
}

function lineChart(points, opt) {
  opt = opt || {};
  var W = 320, H = 168, pl = 34, pr = 12, pt = 22, pb = 26;
  var color = opt.color || '#0A7CFF';
  var goal = opt.goal;
  var gid = 'g' + Math.random().toString(36).slice(2, 7);

  if (!points.length) {
    return '<div class="empty-box">' + (opt.empty || '还没有数据<br>点下方按钮记录第一次成绩') + '</div>';
  }

  var values = points.map(function (p) { return p.value; });
  var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
  if (goal !== undefined && goal !== null) { lo = Math.min(lo, goal); hi = Math.max(hi, goal); }
  if (hi === lo) { hi = lo + 20; lo = Math.max(0, lo - 20); }
  var pad = (hi - lo) * 0.18;
  lo = Math.max(0, lo - pad); hi = hi + pad;

  var n = points.length;
  function X(i) { return n === 1 ? (pl + (W - pl - pr) / 2) : pl + (W - pl - pr) * (i / (n - 1)); }
  function Y(v) { return pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo)); }

  var xy = points.map(function (p, i) { return [X(i), Y(p.value)]; });
  var line = smoothPath(xy);
  var area = line + ' L' + xy[n - 1][0].toFixed(1) + ',' + (H - pb) + ' L' + xy[0][0].toFixed(1) + ',' + (H - pb) + ' Z';

  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img">';
  svg += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
         '<stop offset="0%" stop-color="' + color + '" stop-opacity=".34"/>' +
         '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient>' +
         '<filter id="f' + gid + '" x="-60%" y="-60%" width="220%" height="220%">' +
         '<feGaussianBlur stdDeviation="3.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
         '</defs>';

  // 网格与 Y 轴刻度
  var dec = (hi - lo) < 6 ? 1 : 0;
  for (var g = 0; g <= 2; g++) {
    var v = lo + (hi - lo) * (g / 2);
    var y = Y(v);
    svg += '<line x1="' + pl + '" y1="' + y.toFixed(1) + '" x2="' + (W - pr) + '" y2="' + y.toFixed(1) +
           '" stroke="rgba(43,42,51,.08)" stroke-width="1"/>';
    svg += '<text x="' + (pl - 5) + '" y="' + (y + 3.4).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="rgba(43,42,51,.42)">' +
           (Math.round(v * 10) / 10).toFixed(dec) + '</text>';
  }
  // 目标线
  if (goal !== undefined && goal !== null) {
    var gy = Y(goal);
    svg += '<line x1="' + pl + '" y1="' + gy.toFixed(1) + '" x2="' + (W - pr) + '" y2="' + gy.toFixed(1) +
           '" stroke="rgba(224,123,0,.6)" stroke-width="1" stroke-dasharray="4 4"/>';
    svg += '<text x="' + (W - pr) + '" y="' + (gy - 5).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="rgba(224,123,0,.95)">目标 ' + goal + '</text>';
  }

  svg += '<path d="' + area + '" fill="url(#' + gid + ')"/>';
  svg += '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#f' + gid + ')" opacity=".95"/>';

  // 数据点
  var sel = opt.sel;
  points.forEach(function (p, i) {
    var last = i === n - 1;
    var isSel = sel === i;
    if (n > 14 && !last && !isSel) return;
    svg += '<circle cx="' + xy[i][0].toFixed(1) + '" cy="' + xy[i][1].toFixed(1) + '" r="' + (isSel ? 5 : (last ? 4.2 : 2.8)) +
           '" fill="#fff" stroke="' + color + '" stroke-width="2"/>';
  });

  // 选中标记
  if (sel !== undefined && sel !== null && points[sel]) {
    var sx = xy[sel][0], sy = xy[sel][1];
    svg += '<line x1="' + sx.toFixed(1) + '" y1="' + sy.toFixed(1) + '" x2="' + sx.toFixed(1) + '" y2="' + (H - pb) +
           '" stroke="' + color + '" stroke-width="1" stroke-dasharray="3 3" opacity=".55"/>';
    var label = String(points[sel].value) + (opt.unit || '') +
      (points[sel].year ? '  ' + points[sel].year + ' 真题' : '') +
      '  ' + fmtShort(points[sel].date);
    var tw = label.length * 6.1 + 14;
    var tx = clamp(sx - tw / 2, 2, W - tw - 2);
    var ty = Math.max(2, sy - 30);
    svg += '<g><rect x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" width="' + tw.toFixed(1) + '" height="19" rx="9.5" ' +
           'fill="rgba(22,26,40,.94)" stroke="rgba(255,255,255,.22)" stroke-width=".5"/>' +
           '<text x="' + (tx + tw / 2).toFixed(1) + '" y="' + (ty + 13).toFixed(1) + '" text-anchor="middle" font-size="10.5" fill="#fff">' +
           esc(label) + '</text></g>';
  }

  // X 轴标签
  svg += '<text x="' + pl + '" y="' + (H - 8) + '" font-size="9.5" fill="rgba(43,42,51,.42)">' + fmtShort(points[0].date) + '</text>';
  if (n > 1) {
    svg += '<text x="' + (W - pr) + '" y="' + (H - 8) + '" text-anchor="end" font-size="9.5" fill="rgba(43,42,51,.42)">' + fmtShort(points[n - 1].date) + '</text>';
  }
  if (n > 2) {
    svg += '<text x="' + (W / 2 + 10) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9.5" fill="rgba(43,42,51,.3)">' + n + ' 次记录</text>';
  }

  // 点击热区
  for (var i2 = 0; i2 < n; i2++) {
    var x0 = n === 1 ? 0 : (xy[i2][0] - (xy[1][0] - xy[0][0]) / 2);
    var wdt = n === 1 ? W : (xy[1][0] - xy[0][0]);
    svg += '<rect class="hit" data-i="' + i2 + '" x="' + Math.max(0, x0).toFixed(1) + '" y="0" width="' + wdt.toFixed(1) +
           '" height="' + H + '" fill="transparent" style="cursor:pointer"/>';
  }
  svg += '</svg>';
  return '<div class="chart-wrap-inner">' + svg + '</div>';
}

/* ── Toast ────────────────────────────────────────────── */
var toastTimer = null;
function toast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove('on'); }, 1700);
}

/* ── 小组件 ───────────────────────────────────────────── */
function sparkline(points, color) {
  if (points.length < 2) return '';
  var W = 300, H = 54, pl = 3, pr = 3, pt = 10, pb = 8;
  var vs = points.map(function (p) { return p.value; });
  var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
  if (hi === lo) { hi = lo + 10; lo = Math.max(0, lo - 10); }
  var pad = (hi - lo) * .2; lo -= pad; hi += pad;
  function X(i) { return pl + (W - pl - pr) * (i / (points.length - 1)); }
  function Y(v) { return pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo)); }
  var xy = points.map(function (p, i) { return [X(i), Y(p.value)]; });
  var line = smoothPath(xy);
  var gid = 'sp' + Math.random().toString(36).slice(2, 7);
  var area = line + ' L' + xy[xy.length - 1][0].toFixed(1) + ',' + H + ' L' + xy[0][0].toFixed(1) + ',' + H + ' Z';
  var last = xy[xy.length - 1];
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:54px;display:block;overflow:visible">' +
    '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="' + color + '" stop-opacity=".3"/>' +
    '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
    '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" opacity=".9"/>' +
    '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3.6" fill="#fff" stroke="' + color + '" stroke-width="2"/></svg>';
}
function tickSVG() {
  return '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
/* 齿轮图标：8 齿精确轮廓（与标签栏「设置」图标同款） */
var GEAR_PATH = 'M10.50,2.52 L13.50,2.52 L13.68,5.00 L15.76,5.86 L17.64,4.23 L19.77,6.36 L18.14,8.24 ' +
  'L19.00,10.32 L21.48,10.50 L21.48,13.50 L19.00,13.68 L18.14,15.76 L19.77,17.64 L17.64,19.77 L15.76,18.14 ' +
  'L13.68,19.00 L13.50,21.48 L10.50,21.48 L10.32,19.00 L8.24,18.14 L6.36,19.77 L4.23,17.64 L5.86,15.76 ' +
  'L5.00,13.68 L2.52,13.50 L2.52,10.50 L5.00,10.32 L5.86,8.24 L4.23,6.36 L6.36,4.23 L8.24,5.86 L10.32,5.00 Z';
function gearSVG(size) {
  size = size || 16;
  var sw = size <= 18 ? 2 : 1.8;   // 小尺寸略加粗，保持视觉重量
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '">' +
    '<path d="' + GEAR_PATH + '" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linejoin="round"/>' +
    '<circle cx="12" cy="12" r="3.3" fill="none" stroke="currentColor" stroke-width="' + sw + '"/></svg>';
}
function chevSVG() {
  return '<svg class="chev" viewBox="0 0 24 24" width="16" height="16"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

/* ── 头部 ─────────────────────────────────────────────── */
var TAB_TITLE = { today: '今日', scores: '成绩', calendar: '日历', settings: '设置' };
function renderTop() {
  var s = state.settings, t = today();
  var left = dayDiff(t, s.examDate);
  document.getElementById('topMark').textContent = left >= 0 ? left : '0';
  document.getElementById('topTitle').textContent = TAB_TITLE[curTab];
  var sub = s.school + ' · ' + s.major;
  if (curTab === 'today') {
    sub = goalSubText();
  } else if (curTab === 'scores') {
    var n = recordedCount(), lt = latestTotal();
    if (!n) sub = '还没有成绩记录';
    else if (lt) {
      var tg = targetSum();
      sub = '最近总分 ' + lt.value + (tg > 0 ? ' / 目标 ' + tg : ' / 500 · 未设置目标总分');
    } else {
      var raw = latestScoredSubject();
      var st = raw ? subjectStat(raw.key) : null;
      sub = '已记录科目 ' + n + '/' + SUBJECTS.length +
        (st ? ' · ' + st.sj.name + ' ' + st.score + '/' + st.sj.max : '');
    }
  } else if (curTab === 'calendar') {
    sub = fmtMDW(t);
  } else if (curTab === 'settings') {
    sub = goalSubText();
  }
  document.getElementById('topSub').textContent = sub;
}

/* ── 今日页 ───────────────────────────────────────────── */
function renderCountdown() {
  var s = state.settings, t = today();
  var left = dayDiff(t, s.examDate);
  var weeks = Math.floor(left / 7), rest = left % 7;
  var ph = currentPhase();
  var d = parseKey(s.examDate);
  var h = '<div class="card cd" data-act="exam-edit">';
  h += '<div class="cd-top">' +
       '<span class="cd-school">' + esc(s.school) + '</span>' +
       '<span class="cd-date">' + d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' · ' + WD[d.getDay()] + '</span>' +
       '</div>';
  h += '<div class="cd-days"><span class="n num">' + (left >= 0 ? left : 0) + '</span><span class="u">天</span>' +
       '<span class="cd-salary">目标年薪 <b>' + esc(s.salaryGoal) + '</b></span></div>';
  h += '<div class="cd-meta"><span>' +
       (left >= 0
         ? '剩余 <b>' + weeks + '</b> 周 <b>' + rest + '</b> 天'
         : '<b>考试已结束</b>') +
       '</span>' +
       '<span style="color:' + ph.color + '"><b style="color:inherit">' + ph.name + '</b>' +
       (ph.over || ph.daysToNext === null ? '' : ' · 距' + ph.next.name.slice(0, 2) + ' <b style="color:inherit">' + ph.daysToNext + '</b> 天') +
       '</span></div>';
  if (!ph.over && ph.span) {
    h += '<div class="bar stage" title="' + ph.name + '进度"><i style="width:' + ph.pct.toFixed(1) +
         '%;background:linear-gradient(90deg,' + ph.color + ',' + ph.color + 'b3)"></i></div>';
  }
  h += '</div>';
  document.getElementById('countdownCard').innerHTML = h;
}

/* 四科记录进度：科目胶囊，已记录的点亮，点击可跳到该科曲线 */
function subjectProgressHTML() {
  var h = '<div class="subj-progress">';
  SUBJECTS.forEach(function (sj) {
    var st = subjectStat(sj.key);
    h += '<span class="sp-chip' + (st.has ? ' on' : '') + '" data-act="pick-subject" data-key="' + sj.key + '">' +
         '<i style="border-color:' + sj.color + ';background:' + (st.has ? sj.color : 'transparent') + '"></i>' +
         '<span>' + sj.name + '</span></span>';
  });
  h += '</div>';
  return h;
}
/* 单科差距徽标：还差 / 已超出 / 已达成 / 未设目标 */
function gapBadgeHTML(st) {
  var cls = '', k = '目标', v = '<b>未设置</b>';
  if (st.gap !== null) {
    if (st.gap > 0) { k = '还差'; v = st.gap + '<small>分</small>'; }
    else if (st.gap < 0) { k = '已超出'; v = Math.abs(st.gap) + '<small>分</small>'; cls = ' good'; }
    else { k = '已达成'; v = '<b>目标</b>'; cls = ' good'; }
  }
  return '<div class="gap-badge' + cls + '"><div class="k">' + k + '</div><div class="v num">' + v + '</div></div>';
}
/* 四科明细网格 */
function subjectGridHTML() {
  var h = '';
  SUBJECTS.forEach(function (sj) {
    var st = subjectStat(sj.key);
    var gapTxt = !st.has ? '未记录' : (st.gap === null ? '未设目标' :
      (st.gap > 0 ? '差 ' + st.gap : (st.gap < 0 ? '超 ' + Math.abs(st.gap) : '已达')));
    h += '<div class="gap-item" data-act="pick-subject" data-key="' + sj.key + '">';
    h += '<div class="t"><i style="background:' + sj.color + '"></i>' + sj.name + '</div>';
    h += '<div class="l"><span class="s num">' + (st.has ? st.score : '—') + '<em>/' + sj.max + '</em></span>' +
         '<span class="d' + (st.gap !== null && st.gap <= 0 ? ' good' : '') + '">' + gapTxt + '</span></div>';
    h += '<div class="bar"><i style="width:' + st.pct.toFixed(1) + '%;background:linear-gradient(90deg,' +
         sj.color + ',' + sj.color + '99);box-shadow:none"></i></div>';
    h += '</div>';
  });
  return h;
}

function renderGap() {
  var n = recordedCount();
  var lt = latestTotal();
  var target = targetSum();
  var h = '<div class="card">';
  h += '<div class="card-head"><h2 class="card-title">目标差距</h2>' +
       '<span class="card-hint">已记录科目 ' + n + '/' + SUBJECTS.length + '</span></div>';

  if (!n) {
    h += '<div class="empty-box">还没有成绩记录<br>先记录一科，看看离该科目标还差多少</div>' +
         '<div class="btn-row"><button class="btn-ghost" data-act="go-scores">去记录成绩</button></div></div>';
    document.getElementById('gapCard').innerHTML = h;
    return;
  }

  if (lt) {
    /* 四科齐全：显示总分差距 */
    var gap = round1(target - lt.value);
    h += '<div class="gap-hero">';
    h += '<div class="gap-main"><div class="gap-cap">最近总分' +
         (lt.estimated ? ' · 四科最近成绩合计' : ' · 完整测试 ' + fmtShort(lt.date)) + '</div>' +
         '<div class="gap-row"><span class="gap-score num">' + lt.value + '</span>' +
         '<span class="gap-goal">/ ' + (target > 0 ? target + ' 目标' : '500 满分') + '</span></div></div>';
    if (target > 0) {
      h += '<div class="gap-badge' + (gap <= 0 ? ' good' : '') + '"><div class="k">' +
           (gap > 0 ? '还差' : (gap < 0 ? '已超出' : '已达成')) + '</div><div class="v num">' +
           (gap === 0 ? '<b>目标</b>' : Math.abs(gap) + '<small>分</small>') + '</div></div>';
    } else {
      h += '<div class="gap-badge"><div class="k">目标总分</div><div class="v num"><b>未设置</b></div></div>';
    }
    h += '</div>';
    h += sparkline(totalSeries(), '#E07B00');
  } else {
    /* 四科没记全：只显示最近一科与该科目标的差距，不比较总分 */
    var raw = latestScoredSubject();
    var st = raw ? subjectStat(raw.key) : null;
    if (st) {
      h += '<div class="gap-hero">';
      h += '<div class="gap-main"><div class="gap-cap">' + st.sj.name + ' · 最近成绩' +
           (st.date ? ' · ' + fmtShort(st.date) : '') + '</div>' +
           '<div class="gap-row"><span class="gap-score num">' + st.score + '</span>' +
           '<span class="gap-goal">/ ' + st.sj.max + (st.target !== null ? ' · 目标 ' + st.target : '') + '</span></div></div>';
      h += gapBadgeHTML(st);
      h += '</div>';
      h += sparkline(subjectSeries(st.key), st.sj.color);
    }
    h += '<div class="gap-lock"><i class="lk"></i>四科都有成绩后，这里会显示总分差距</div>';
  }

  h += subjectProgressHTML();
  h += '<div class="gap-grid">' + subjectGridHTML() + '</div>';
  var w = weakestSubject();
  if (w && (lt || n > 1)) {
    h += '<div class="gap-tip"><i style="background:' + w.color + '"></i>最该补 <b>' + w.name + '</b> · 还差 ' +
         '<b>' + w.gap + '</b> 分（占该科满分 ' + Math.round(w.ratio * 100) + '%）</div>';
  }
  h += '</div>';
  document.getElementById('gapCard').innerHTML = h;
}

/* 今日计划 = 每日学习目标 + 待办事项（合并为一张卡，把「目标差距」挤上首屏） */
function planTimeText(min) {
  min = Math.max(0, Math.round(min));
  if (min >= 60) return Math.floor(min / 60) + 'h' + (min % 60 ? pad(min % 60) : '');
  return min + '分';
}
function plusSVG(size) {
  size = size || 16;
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size +
    '"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
}
/* 待办分区（首页与日历共用同一套计数：完成数/任务数） */
function todoBlockHTML(dk, opts) {
  opts = opts || {};
  var list = todosOf(dk);
  var doneN = list.filter(function (x) { return x.done; }).length;
  var full = list.length >= MAX_TODOS;
  var h = '<div class="plan-sep">';
  if (opts.showTitle !== false) h += '<span class="ps-title">待办事项</span>';
  h += '<span class="ps-date">' + fmtMD(dk) + (dk === today() ? ' · 今天' : '') + '</span>' +
       '<span class="ps-count">' + doneN + '/' + list.length + ' 完成</span>';
  if (full) {
    h += '<span class="ps-full">已满 ' + MAX_TODOS + '</span>';
  } else {
    h += '<button class="icon-btn sm" data-act="todo-add" data-d="' + dk + '" aria-label="添加事项">' + plusSVG(15) + '</button>';
  }
  h += '</div>';
  if (!list.length) {
    h += '<div class="todo-row empty" data-act="todo-add" data-d="' + dk + '">' +
         (opts.emptyText || '＋ 添加今天的计划') + '</div>';
  } else {
    h += '<div class="todo-list">';
    list.forEach(function (it) {
      h += '<div class="todo-row">' +
        '<button class="tick' + (it.done ? ' on' : '') + '" data-act="todo-toggle" data-d="' + dk + '" data-id="' + it.id +
        '" aria-label="完成">' + tickSVG() + '</button>' +
        '<div class="todo-txt' + (it.done ? ' done' : '') + '" data-act="todo-edit" data-d="' + dk + '" data-id="' + it.id + '">' +
        esc(it.text) + '</div>' +
        '<span data-act="todo-edit" data-d="' + dk + '" data-id="' + it.id + '">' + chevSVG() + '</span>' +
        '</div>';
    });
    h += '</div>';
  }
  return h;
}
function renderPlan() {
  var m = state.settings.dailySubjectMin;
  var t = today(), ck = checksOf(t);
  var sdone = SUBJECTS.filter(function (sj) { return ck[sj.key]; }).length;
  var hint = sdone === SUBJECTS.length ? '今日已全部完成'
    : (sdone === 0 ? '点格子打勾' : sdone + '/' + SUBJECTS.length + ' 完成');
  var h = '<div class="card">';
  h += '<div class="card-head"><h2 class="card-title">今日计划</h2>' +
       '<span class="card-hint">' + hint + '</span>' +
       '<button class="icon-btn sm" data-act="go-settings" aria-label="调整各科时长">' + gearSVG() + '</button></div>';
  h += '<div class="plan-row">';
  SUBJECTS.forEach(function (sj) {
    var done = !!ck[sj.key];
    h += '<div class="plan-col' + (done ? ' done' : '') + '" data-act="plan-toggle" data-key="' + sj.key + '"' +
         (done ? ' style="background:' + sj.color + '1F;border-color:' + sj.color + '52"' : '') + '>' +
         '<div class="pt"><i style="background:' + sj.color + '"></i>' + sj.name + '</div>' +
         '<div class="pv num">' + planTimeText(num(m[sj.key]) || 0) + '</div>' +
         '<span class="pc-tick" style="background:' + sj.color + '">' + tickSVG() + '</span></div>';
  });
  h += '</div>';
  h += todoBlockHTML(t);
  h += '</div>';
  document.getElementById('planCard').innerHTML = h;
}

function renderRecent() {
  var list = sortedRecords().slice(-3).reverse();
  var h = '<div class="card">';
  h += '<div class="card-head"><h2 class="card-title">最近成绩</h2>' +
       '<button class="btn-ghost sm" data-act="go-scores">全部记录</button></div>';
  if (!list.length) {
    h += '<div class="empty-box">还没有成绩记录</div>';
  } else {
    h += '<div style="margin-top:-2px">' + list.map(recordRowHTML).join('') + '</div>';
  }
  h += '</div>';
  document.getElementById('recentCard').innerHTML = h;
}

function recordRowHTML(r) {
  var isFull = r.type === 'full';
  var color = isFull ? '#0A7CFF' : (SUBJECT_MAP[r.subject] ? SUBJECT_MAP[r.subject].color : '#8E8E93');
  var icon = isFull ? '总' : SUBJECT_MAP[r.subject].short;
  var title = isFull ? '完整测试' : SUBJECT_MAP[r.subject].name;
  var score, sub;
  if (isFull) {
    var sum = 0;
    SUBJECTS.forEach(function (s) { sum += num(r[s.key]) || 0; });
    score = Math.round(sum * 10) / 10;
    sub = SUBJECTS.map(function (s) { return s.short + ' ' + (num(r[s.key]) === null ? '-' : r[s.key]); }).join(' · ');
  } else {
    score = r.score;
    sub = '单科成绩 · 满分 ' + (SUBJECT_MAP[r.subject] ? SUBJECT_MAP[r.subject].max : 100);
  }
  return '<div class="rec-row' + (r.id === justAddedId ? ' fresh' : '') + '" data-act="open-record" data-id="' + r.id + '">' +
    '<div class="rec-icon" style="background:linear-gradient(150deg,' + color + ',' + color + 'aa)">' + icon + '</div>' +
    '<div class="rec-main"><div class="rec-t">' + title +
    (isFull ? '<span class="tag full">总分</span>' : '<span class="tag">单科</span>') +
    (r.year ? '<span class="tag year">' + r.year + ' 真题</span>' : '') + '</div>' +
    '<div class="rec-s">' + fmtMDW(r.date).replace(/\s.*/, '') + ' · ' + sub + '</div>' +
    (r.note ? '<div class="rec-note">' + esc(r.note) + '</div>' : '') + '</div>' +
    '<div class="rec-score"><div class="v num">' + score + (isFull ? '<small>/500</small>' : '') + '</div>' +
    '<div class="d">' + fmtShort(r.date) + '</div></div></div>';
}

function renderToday() {
  renderCountdown();
  renderPlan();      /* 含待办分区 */
  renderGap();
  renderRecent();
}

/* ── 成绩页 ───────────────────────────────────────────── */
var trendKey = 'total';
var trendSel = null;
var justAddedId = null;   /* 新增记录的视觉强调 */
var freshTimer = null;
function markFresh(id) {
  justAddedId = id;
  clearTimeout(freshTimer);
  freshTimer = setTimeout(function () { justAddedId = null; }, 1800);
}

function seriesFor(key) {
  return key === 'total' ? totalSeries() : subjectSeries(key);
}
function renderGoalGrid() {
  var s = state.settings;
  var n = recordedCount();
  var goalSum = targetSum();
  var h = '<div class="card">';
  h += '<div class="card-head"><h2 class="card-title">四科目标</h2><span class="card-hint">' +
       (goalSum > 0 ? '目标总分 ' + goalSum : '未设置目标总分') + ' · 已记录 ' + n + '/' + SUBJECTS.length + '</span></div>';
  SUBJECTS.forEach(function (sj) {
    var st = subjectStat(sj.key);
    var gapTxt = !st.has ? '' : (st.gap === null ? '未设置目标' :
      (st.gap > 0 ? '还差 ' + st.gap + ' 分' : (st.gap < 0 ? '已超 ' + Math.abs(st.gap) + ' 分' : '已达成')));
    h += '<div class="gap-item" style="margin-bottom:8px" data-act="pick-subject" data-key="' + sj.key + '">';
    h += '<div class="t"><i style="background:' + sj.color + '"></i>' + sj.name +
         '<span style="margin-left:auto;color:rgba(43,42,51,.42)">最近 ' + (st.has ? st.score + ' 分' : '未记录') +
         (st.has && st.date ? ' · ' + fmtShort(st.date) : '') + '</span></div>';
    h += '<div class="l"><span class="s num">' + (st.has ? st.score : '—') + '<em>/ ' +
         (st.target !== null ? st.target + ' 目标' : sj.max + ' 满分') + '</em></span>' +
         '<span class="d' + (st.gap !== null && st.gap <= 0 ? ' good' : '') + '">' + gapTxt + '</span></div>';
    h += '<div class="bar"><i style="width:' + st.pct.toFixed(1) + '%;background:linear-gradient(90deg,' + sj.color + ',' + sj.color + '99);box-shadow:none"></i></div>';
    h += '</div>';
  });
  h += '<div class="rec-s" style="margin-top:6px">点击单科看曲线' +
       (n === SUBJECTS.length ? '' : ' · 四科齐全后显示总分差距') + '</div></div>';
  document.getElementById('goalGrid').innerHTML = h;
}

function renderTrend() {
  var seg = document.getElementById('trendSeg');
  var opts = [{ k: 'total', n: '总分' }].concat(SUBJECTS.map(function (s) { return { k: s.key, n: s.name }; }));
  var idx = Math.max(0, opts.findIndex(function (o) { return o.k === trendKey; }));
  var html = '<div class="seg-thumb" style="width:calc((100% - 6px)/' + opts.length + ');transform:translateX(' + (idx * 100) + '%)"></div>';
  opts.forEach(function (o) {
    html += '<button class="' + (o.k === trendKey ? 'on' : '') + '" data-act="trend" data-key="' + o.k + '">' + o.n + '</button>';
  });
  seg.innerHTML = html;

  var pts = seriesFor(trendKey);
  var isTotal = trendKey === 'total';
  var s = state.settings;
  var color = isTotal ? '#E07B00' : SUBJECT_MAP[trendKey].color;
  var totalGoal = targetSum();
  var goal = isTotal ? (totalGoal > 0 ? totalGoal : null) : subjectTarget(trendKey);
  var notReady = isTotal && recordedCount() < SUBJECTS.length;
  var emptyTip = notReady
    ? '四科都有成绩后<br>显示总分趋势与差距'
    : '还没有数据<br>点下方按钮记录第一次成绩';
  document.getElementById('trendChart').innerHTML = lineChart(pts, {
    color: color, goal: goal, sel: trendSel, empty: emptyTip
  });

  var last = pts.length ? pts[pts.length - 1] : null;
  document.getElementById('trendHint').textContent = pts.length
    ? (pts.length + ' 个数据点 · 最近 ' + last.value + (isTotal && last.estimated ? '（合计）' : ''))
    : (notReady ? '已记录 ' + recordedCount() + '/' + SUBJECTS.length + ' 科' : '暂无数据');
}

function renderRecordList() {
  var list = sortedRecords().slice().reverse();
  document.getElementById('recordCount').textContent = list.length ? '共 ' + list.length + ' 条' : '';
  var box = document.getElementById('recordList');
  if (!list.length) {
    box.innerHTML = '<div class="empty-box">还没有记录<br>点下方按钮添加单科成绩或完整测试</div>';
    return;
  }
  box.innerHTML = list.map(recordRowHTML).join('');
}

function renderScores() {
  var subEl = document.getElementById('scoresSub');
  if (subEl) subEl.textContent = scoreSummaryText();
  renderGoalGrid();
  renderTrend();
  renderRecordList();
}

/* ── 日历页 ───────────────────────────────────────────── */
var calView = null; // 'YYYY-MM'
var selDay = null;

function monthKeys(view) {
  var p = view.split('-'), y = +p[0], m = +p[1] - 1;
  var first = new Date(y, m, 1);
  var offset = (first.getDay() + 6) % 7; // 周一为第一列
  var start = addDays(first, -offset);
  var out = [];
  for (var i = 0; i < 42; i++) {
    var d = addDays(start, i);
    out.push({ key: keyOf(d), day: d.getDate(), inMonth: d.getMonth() === m });
  }
  return out;
}
function calDotsHTML(dk) {
  var dots = todosOf(dk).slice(0, MAX_TODOS).map(function (x) {
    return '<i class="dot' + (x.done ? ' done' : '') + '"></i>';
  }).join('');
  return dots || '<i class="dot-slot"></i>';
}
function updateCalSub() {
  var p = calView.split('-'), y = +p[0], m = +p[1] - 1;
  var n = 0, d = new Date(y, m, 1);
  while (d.getMonth() === m) { n += todosOf(keyOf(d)).length; d = addDays(d, 1); }
  document.getElementById('calSub').textContent =
    '本月 ' + n + ' 个事项 · 每天最多 ' + MAX_TODOS + ' 个事项';
}
function renderCalendar() {
  var view = calView, p = view.split('-');
  document.getElementById('calMonth').textContent = p[0] + ' 年 ' + (+p[1]) + ' 月';
  document.getElementById('calWeek').innerHTML = ['一', '二', '三', '四', '五', '六', '日']
    .map(function (w) { return '<span>' + w + '</span>'; }).join('');
  var cells = monthKeys(view), t = today();
  var h = cells.map(function (c) {
    var cls = 'cal-cell' + (c.inMonth ? '' : ' out') + (c.key === t ? ' today' : '') + (c.key === selDay ? ' sel' : '');
    return '<div class="' + cls + '" data-act="cal-day" data-d="' + c.key + '">' +
      '<span class="d num">' + c.day + '</span>' +
      '<span class="dots">' + calDotsHTML(c.key) + '</span></div>';
  }).join('');
  document.getElementById('calGrid').innerHTML = h;
  updateCalSub();
  renderDayDetail();
}

function renderDayDetail() {
  var box = document.getElementById('dayDetail');
  if (!selDay) { box.innerHTML = ''; return; }
  var list = todosOf(selDay);
  var doneN = list.filter(function (x) { return x.done; }).length;
  var h = '<div class="card">';
  h += '<div class="card-head"><h2 class="card-title">' + fmtMDW(selDay) + '</h2>' +
       '<span class="card-hint">' + doneN + '/' + list.length + ' 完成' +
       (selDay === today() ? ' · 今天' : '') + '</span></div>';
  if (!list.length) {
    h += '<div class="empty-box">这一天还没有安排</div>';
  } else {
    h += '<div class="todo-list">';
    list.forEach(function (it) {
      h += '<div class="todo-row">';
      h += '<button class="tick' + (it.done ? ' on' : '') + '" data-act="todo-toggle" data-d="' + selDay +
           '" data-id="' + it.id + '">' + tickSVG() + '</button>';
      h += '<div class="todo-txt' + (it.done ? ' done' : '') + '" data-act="todo-edit" data-d="' + selDay +
           '" data-id="' + it.id + '">' + esc(it.text) + '</div>';
      h += '<span data-act="todo-edit" data-d="' + selDay + '" data-id="' + it.id + '">' + chevSVG() + '</span>';
      h += '</div>';
    });
    h += '</div>';
  }
  if (list.length < MAX_TODOS) {
    h += '<button class="btn-primary" data-act="todo-add" data-d="' + selDay + '">＋ 添加事项</button>';
  } else {
    h += '<div class="card-foot">这一天已满 ' + MAX_TODOS + ' 个事项</div>';
  }
  h += '</div>';
  box.innerHTML = h;
}

/* ── 设置页 ───────────────────────────────────────────── */
function renderSettings() {
  var s = state.settings;
  var h = '';

  h += '<div class="set-group"><h3>目标</h3><div class="set-list">';
  h += '<div class="set-row" data-act="exam-edit"><div class="set-lb">目标院校 / 考试科目</div>' +
       '<div class="set-field"><span style="font-size:13.5px;color:var(--ink-2)">' + esc(s.school) + ' · ' + esc(s.major) + '</span>' + chevSVG() + '</div></div>';
  h += '<div class="set-row"><div class="set-lb">目标年薪<small>首页激励标语</small></div><div class="set-field">' +
       '<input type="text" data-set="salaryGoal" value="' + esc(s.salaryGoal) + '" placeholder="20w" style="width:82px"></div></div>';
  h += '<div class="set-row"><div class="set-lb">考试日期</div><div class="set-field">' +
       '<input type="date" data-set="examDate" value="' + s.examDate + '"></div></div>';
  h += '</div></div>';

  h += '<div class="set-group"><h3>四科目标分数<span class="set-badge">已记录 ' + recordedCount() + '/' + SUBJECTS.length + ' 科</span></h3><div class="set-list">';
  SUBJECTS.forEach(function (sj) {
    var st = subjectStat(sj.key);
    h += '<div class="set-row"><div class="set-lb"><span style="display:inline-flex;align-items:center;gap:8px">' +
         '<i style="width:8px;height:8px;border-radius:50%;background:' + sj.color + ';display:inline-block"></i>' + sj.name +
         '<small>满分 ' + sj.max + ' · ' + (st.has ? '最近 ' + st.score + ' 分' : '未记录') + '</small></span></div><div class="set-field">' +
         '<input type="number" inputmode="decimal" data-set="t_' + sj.key + '" value="' + (num(s.targets[sj.key]) || 0) + '"><span>分</span></div></div>';
  });
  h += '<div class="set-row"><div class="set-lb">目标总分<small>四科目标之和 · 不是当前成绩</small></div>' +
       '<div class="set-field"><b class="num" id="targetTotal" style="font-size:17px">' + targetSum() +
       '<span style="font-weight:500">/500</span></b></div></div>';
  h += '</div></div>';

  h += '<div class="set-group"><h3>每日每科目标时长</h3><div class="set-list">';
  SUBJECTS.forEach(function (sj) {
    var mn = num(s.dailySubjectMin[sj.key]) || 0;
    h += '<div class="set-row"><div class="set-lb"><span style="display:inline-flex;align-items:center;gap:8px">' +
         '<i style="width:8px;height:8px;border-radius:50%;background:' + sj.color + ';display:inline-block"></i>' + sj.name +
         '<small data-daysub="' + sj.key + '">' + hoursText(mn) + '</small></span></div><div class="set-field"><div class="stepper">' +
         '<button data-act="day-step" data-key="' + sj.key + '" data-d="-15">−</button>' +
         '<b class="num" data-dayval="' + sj.key + '">' + planTimeText(mn) + '</b>' +
         '<button data-act="day-step" data-key="' + sj.key + '" data-d="15">＋</button></div></div></div>';
  });
  h += '<div class="set-row"><div class="set-lb">每日合计<small>四科之和</small></div>' +
       '<div class="set-field"><b class="num" id="dayTotal" style="font-size:15px">' + hoursText(dailyTotalMin()) + '</b></div></div>';
  h += '</div></div>';

  h += '<div class="set-group"><h3>数据</h3><div class="set-list">';
  h += '<div class="set-row"><div class="set-lb">记录条数<small>成绩 ' + state.records.length +
       ' 条 · 事项 ' + todoCount() + ' 个</small></div></div>';
  h += '<div class="set-row" style="gap:9px"><button class="btn-ghost" style="flex:1" data-act="seed">重新载入示例</button>' +
       '<button class="btn-ghost danger" style="flex:1" data-act="wipe">清空全部数据</button></div>';
  h += '</div></div>';

  document.getElementById('settingsGroups').innerHTML = h;
}

/* ── 弹层 ─────────────────────────────────────────────── */
var sheetOpen = false;
function openSheet(html, mount) {
  var root = document.getElementById('sheetRoot');
  var body = document.getElementById('sheetBody');
  body.innerHTML = html;
  root.classList.add('on');
  root.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  sheetOpen = true;
  if (mount) mount(body);
}
function closeSheet() {
  if (!sheetOpen) return;
  var root = document.getElementById('sheetRoot');
  root.classList.remove('on');
  root.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  sheetOpen = false;
  setTimeout(function () { if (!sheetOpen) document.getElementById('sheetBody').innerHTML = ''; }, 430);
}
function sheetFoot(extra) {
  return '<div style="height:6px"></div>' + (extra || '');
}

/* 添加/编辑事项（每天最多 MAX_TODOS 条） */
function setTodos(dk, arr) {
  arr = arr.filter(function (x) { return x && x.text; }).slice(0, MAX_TODOS);
  if (arr.length) state.todos[dk] = arr;
  else delete state.todos[dk];
}
function todoSheet(dk, id) {
  var list = todosOf(dk);
  var item = id ? (list.filter(function (x) { return x.id === id; })[0] || null) : null;
  if (!item && list.length >= MAX_TODOS) {
    toast('这一天已满 ' + MAX_TODOS + ' 个事项');
    return;
  }
  var h = '<div class="sheet-title">' + (item ? '编辑事项' : '添加事项') + '</div>' +
    '<div class="sheet-sub">' + fmtMDW(dk) + ' · 已有 ' + list.length + '/' + MAX_TODOS + ' 个</div>' +
    '<div class="field"><label>事项内容</label><textarea id="tdText" placeholder="例如：数学 2019 真题第二遍 + 专业课第 5 章">' +
    esc(item ? item.text : '') + '</textarea></div>' +
    '<button class="btn-primary" id="tdSave">保存</button>';
  if (item) {
    h += '<div class="btn-row" style="margin-top:9px">' +
      '<button class="btn-ghost" id="tdToggle">' + (item.done ? '标记为未完成' : '标记为已完成') + '</button>' +
      '<button class="btn-ghost danger" id="tdDel">删除事项</button></div>';
  }
  openSheet(h, function (root) {
    var ta = root.querySelector('#tdText');
    setTimeout(function () { ta.focus(); }, 260);
    root.querySelector('#tdSave').onclick = function () {
      var v = ta.value.trim();
      if (!v) { toast('请输入事项内容'); return; }
      if (item) {
        setTodos(dk, todosOf(dk).map(function (x) {
          return x.id === item.id ? { id: x.id, text: v, done: !!x.done } : x;
        }));
      } else {
        if (todosOf(dk).length >= MAX_TODOS) { toast('已满 ' + MAX_TODOS + ' 个'); return; }
        setTodos(dk, todosOf(dk).concat([{ id: uid(), text: v, done: false }]));
      }
      save(); closeSheet(); renderTodoViews(dk);
      toast('已保存 · ' + todosOf(dk).length + '/' + MAX_TODOS + ' 条');
    };
    var tg = root.querySelector('#tdToggle');
    if (tg) tg.onclick = function () {
      setTodos(dk, todosOf(dk).map(function (x) {
        return x.id === item.id ? { id: x.id, text: x.text, done: !x.done } : x;
      }));
      save(); closeSheet(); renderTodoViews(dk);
      toast(!item.done ? '已标记完成' : '已标记未完成');
    };
    var dl = root.querySelector('#tdDel');
    if (dl) dl.onclick = function () {
      setTodos(dk, todosOf(dk).filter(function (x) { return x.id !== item.id; }));
      save(); closeSheet(); renderTodoViews(dk); toast('已删除');
    };
  });
}

/* 记录成绩 */
/* 真题年份选择：最近 6 年快选 + 手动输入 */
function yearField(r) {
  var cur = new Date().getFullYear();
  var y = num(r.year);
  var h = '<div class="field"><label>真题年份<span class="lab-opt">选填 · 做真题时填</span></label><div class="year-row">';
  for (var i = 0; i < 6; i++) {
    var yy = cur - i;
    h += '<button class="year-chip' + (y === yy ? ' on' : '') + '" data-y="' + yy + '">' + yy + '</button>';
  }
  h += '<input type="number" inputmode="numeric" id="rcYear" placeholder="其他" maxlength="4" value="' + (y === null ? '' : y) + '">';
  h += '</div></div>';
  return h;
}
function noteField(r) {
  return '<div class="field"><label>备注<span class="lab-opt">选填</span></label>' +
    '<textarea class="sm" id="rcNote" placeholder="例如：概率大题全错、时间不够没做完">' + esc(r.note || '') + '</textarea></div>';
}
/* 年份/备注读取与校验 */
function readYear(root) {
  var el = root.querySelector('#rcYear');
  if (!el || el.value.trim() === '') return { ok: true, year: null };
  var y = num(el.value);
  if (y === null || Math.round(y) !== y || y < 1990 || y > 2100) return { ok: false, year: null };
  return { ok: true, year: Math.round(y) };
}

function recordSheet(rec) {
  var editing = !!rec;
  var type = editing ? rec.type : 'full';
  var r = editing ? rec : { date: today(), type: 'full', subject: 'math', score: '' };
  function body() {
    var h = '<div class="sheet-title">' + (editing ? '编辑记录' : '记录成绩') + '</div>' +
      '<div class="sheet-sub">' + (type === 'full' ? '一次完整测试，自动计算总分' : '单科测试或小题得分') + '</div>';
    if (!editing) {
      h += '<div class="seg-btn"><button class="' + (type === 'full' ? 'on' : '') + '" data-t="full">完整测试</button>' +
           '<button class="' + (type === 'single' ? 'on' : '') + '" data-t="single">单科成绩</button></div>';
    }
    h += '<div class="field"><label>日期</label><input type="date" id="rcDate" value="' + r.date + '"></div>';
    h += yearField(r);
    if (type === 'full') {
      h += '<div class="field"><label>各科分数</label><div class="field-grid">';
      SUBJECTS.forEach(function (sj) {
        h += '<div class="field-inline"><input type="number" inputmode="decimal" data-k="' + sj.key + '" placeholder="' + sj.name +
             '" value="' + (num(r[sj.key]) === null ? '' : r[sj.key]) + '"><span class="unit">/' + sj.max + '</span></div>';
      });
      h += '</div></div>';
      h += '<div class="sum-box"><span class="k">自动计算总分</span><span class="v num" id="rcSum">0<small>/500</small></span></div>';
    } else {
      h += '<div class="field"><label>科目</label><div class="seg-btn" style="margin-bottom:0">';
      SUBJECTS.forEach(function (sj) {
        h += '<button class="' + (r.subject === sj.key ? 'on' : '') + '" data-s="' + sj.key + '" style="padding:9px 4px;font-size:13px">' + sj.name + '</button>';
      });
      h += '</div></div>';
      h += '<div class="field"><label>分数</label><div class="field-inline">' +
           '<input type="number" inputmode="decimal" id="rcScore" style="text-align:left;padding:13px 14px;border-radius:15px;background:#fff;border:.5px solid rgba(122,106,84,.16);width:100%" placeholder="0" value="' +
           (num(r.score) === null ? '' : r.score) + '"><span class="unit" id="rcMax">/' + (SUBJECT_MAP[r.subject] ? SUBJECT_MAP[r.subject].max : 100) + '</span></div></div>';
    }
    h += noteField(r);
    h += '<button class="btn-primary" id="rcSave">保存记录</button>';
    if (editing) h += '<div class="btn-row" style="margin-top:9px"><button class="btn-ghost danger" id="rcDel">删除这条记录</button></div>';
    h += sheetFoot();
    return h;
  }
  function recalcSum(root) {
    var sum = 0;
    root.querySelectorAll('input[data-k]').forEach(function (i) { sum += num(i.value) || 0; });
    var el = root.querySelector('#rcSum');
    if (el) el.innerHTML = (Math.round(sum * 10) / 10) + '<small>/500</small>';
  }
  /* 把当前输入写回 r，避免切换记录类型时丢失已填内容 */
  function syncInputs(root) {
    var dEl = root.querySelector('#rcDate');
    if (dEl && dEl.value) r.date = dEl.value;
    var yEl = root.querySelector('#rcYear');
    if (yEl) r.year = yEl.value.trim() === '' ? null : num(yEl.value);
    var nEl = root.querySelector('#rcNote');
    if (nEl) r.note = nEl.value.trim();
    var sEl = root.querySelector('#rcScore');
    if (sEl) r.score = sEl.value === '' ? null : num(sEl.value);
    root.querySelectorAll('input[data-k]').forEach(function (i) {
      r[i.getAttribute('data-k')] = i.value === '' ? null : num(i.value);
    });
  }
  function mountFn(root) {
    root.querySelectorAll('[data-t]').forEach(function (b) {
      b.onclick = function () {
        syncInputs(root);
        type = b.getAttribute('data-t');
        r.type = type;
        redraw();
      };
    });
    root.querySelectorAll('[data-s]').forEach(function (b) {
      b.onclick = function () {
        r.subject = b.getAttribute('data-s');
        root.querySelectorAll('[data-s]').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        var mx = root.querySelector('#rcMax');
        if (mx) mx.textContent = '/' + SUBJECT_MAP[r.subject].max;
      };
    });
    // 年份快选：点击写入输入框并高亮，再点取消
    root.querySelectorAll('.year-chip').forEach(function (b) {
      b.onclick = function () {
        var yi = root.querySelector('#rcYear');
        var same = b.classList.contains('on');
        root.querySelectorAll('.year-chip').forEach(function (x) { x.classList.remove('on'); });
        if (same) { yi.value = ''; }
        else { yi.value = b.getAttribute('data-y'); b.classList.add('on'); }
      };
    });
    var yi2 = root.querySelector('#rcYear');
    if (yi2) yi2.oninput = function () {
      var v = yi2.value.trim();
      root.querySelectorAll('.year-chip').forEach(function (x) {
        x.classList.toggle('on', x.getAttribute('data-y') === v);
      });
    };
    root.querySelectorAll('input[data-k]').forEach(function (i) {
      i.oninput = function () { recalcSum(root); };
    });
    recalcSum(root);
    root.querySelector('#rcSave').onclick = function () {
      var date = root.querySelector('#rcDate').value || today();
      var yInfo = readYear(root);
      if (!yInfo.ok) { toast('年份请填 4 位数字，如 2025'); return; }
      var note = (root.querySelector('#rcNote').value || '').trim();
      if (type === 'full') {
        var obj = { id: editing ? rec.id : uid(), date: date, type: 'full' };
        var filled = 0, sum = 0;
        SUBJECTS.forEach(function (sj) {
          var v = num(root.querySelector('input[data-k="' + sj.key + '"]').value);
          obj[sj.key] = v;
          if (v !== null) { filled++; sum += v; }
          if (v !== null && (v < 0 || v > sj.max)) {
            obj['__bad'] = v < 0 ? (sj.name + ' 分数不能为负') : (sj.name + ' 超过满分 ' + sj.max);
          }
        });
        if (obj.__bad) { toast(obj.__bad); return; }
        if (filled === 0) { toast('请至少填写一科分数'); return; }
        delete obj.__bad;
        if (yInfo.year !== null) obj.year = yInfo.year;
        if (note) obj.note = note;
        if (editing) { replaceRecord(obj); } else { state.records.push(obj); markFresh(obj.id); }
        save(); refresh(); closeSheet();
        toast('总分 ' + (Math.round(sum * 10) / 10) + ' 已记录 · 第 ' + state.records.length + ' 条');
      } else {
        var sc = num(root.querySelector('#rcScore').value);
        if (sc === null) { toast('请输入分数'); return; }
        var mx = SUBJECT_MAP[r.subject].max;
        if (sc < 0) { toast('分数不能为负'); return; }
        if (sc > mx) { toast('超过该科满分 ' + mx); return; }
        var o2 = { id: editing ? rec.id : uid(), date: date, type: 'single', subject: r.subject, score: sc };
        if (yInfo.year !== null) o2.year = yInfo.year;
        if (note) o2.note = note;
        if (editing) { replaceRecord(o2); } else { state.records.push(o2); markFresh(o2.id); }
        save(); refresh(); closeSheet();
        toast(SUBJECT_MAP[r.subject].name + ' ' + sc + ' 分已记录');
      }
    };
    var del = root.querySelector('#rcDel');
    if (del) del.onclick = function () {
      state.records = state.records.filter(function (x) { return x.id !== rec.id; });
      save(); refresh(); closeSheet(); toast('已删除');
    };
  }
  function redraw() { openSheet(body(), mountFn); }
  openSheet(body(), mountFn);
}
function replaceRecord(obj) {
  for (var i = 0; i < state.records.length; i++) {
    if (state.records[i].id === obj.id) { state.records[i] = obj; return; }
  }
  state.records.push(obj);
}

/* 考试信息 */
function examSheet() {
  var s = state.settings;
  var h = '<div class="sheet-title">考试信息</div><div class="sheet-sub">改动会立即保存</div>' +
    '<div class="field"><label>目标院校 / 考试科目</label><div class="field-grid">' +
    '<input type="text" id="exSchool" value="' + esc(s.school) + '"><input type="text" id="exMajor" value="' + esc(s.major) + '"></div></div>' +
    '<div class="field"><label>考试日期</label><input type="date" id="exDate" value="' + s.examDate + '"></div>' +
    '<button class="btn-primary" id="exSave">保存</button>' +
    '<div class="btn-row" style="margin-top:9px"><button class="btn-ghost" data-act="go-settings">去设置页调整目标</button></div>' + sheetFoot();
  openSheet(h, function (root) {
    root.querySelector('#exSave').onclick = function () {
      var sch = root.querySelector('#exSchool').value.trim();
      var mj = root.querySelector('#exMajor').value.trim();
      state.settings.school = sch || DEFAULT_SETTINGS.school;
      state.settings.major = mj || DEFAULT_SETTINGS.major;
      state.settings.examDate = root.querySelector('#exDate').value || DEFAULT_SETTINGS.examDate;
      save(); refresh(); closeSheet(); toast('考试信息已更新');
    };
  });
}

/* 快捷记录 */
function quickSheet() {
  var h = '<div class="sheet-title">快速记录</div><div class="sheet-sub">想记点什么？</div>' +
    '<div class="ac-list">' +
    '<div class="ac-item" data-q="record"><span style="font-size:17px">◎</span>记录一次测试成绩</div>' +
    '<div class="ac-item" data-q="todo"><span style="font-size:17px">✓</span>添加今日事项</div>' +
    '<div class="ac-item" data-q="cal"><span style="font-size:17px">▤</span>给某个日期加事项</div>' +
    '</div>' + sheetFoot();
  openSheet(h, function (root) {
    root.querySelectorAll('[data-q]').forEach(function (it) {
      it.onclick = function () {
        var q = it.getAttribute('data-q');
        setTimeout(function () {
          if (q === 'record') recordSheet(null);
          else if (q === 'todo') todoSheet(today());
          else if (q === 'cal') { switchTab('calendar'); selDay = selDay || today(); renderCalendar(); toast('选择一个日期'); }
        }, 120);
      };
    });
  });
}

/* ── 交互 ─────────────────────────────────────────────── */
var curTab = 'today';

function switchTab(name) {
  curTab = name;
  /* 进日历始终回到今天，保证与首页「今日」看到同一份数据 */
  if (name === 'calendar') selDay = today();
  Array.prototype.forEach.call(document.querySelectorAll('.page'), function (p) {
    p.classList.toggle('active', p.id === 'page-' + name);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === name);
  });
  window.scrollTo(0, 0);
  refresh();
}
function renderPage() {
  if (curTab === 'today') renderToday();
  else if (curTab === 'scores') renderScores();
  else if (curTab === 'calendar') renderCalendar();
  else renderSettings();
}
function refresh() {
  renderTop();
  renderPage();
}
/* 事项变化后的局部刷新，避免整页重建 */
function renderTodoViews(dk) {
  if (curTab === 'today') { renderPlan(); return; }
  if (curTab === 'calendar') {
    var dots = document.querySelector('.cal-cell[data-d="' + dk + '"] .dots');
    if (dots) dots.innerHTML = calDotsHTML(dk);
    renderDayDetail();
    updateCalSub();
  }
}
/* 统一的进度文案：完成数/任务数 */
function todoProgressText(dk) {
  var list = todosOf(dk);
  var done = list.filter(function (x) { return x.done; }).length;
  return done + '/' + list.length + ' 项';
}
function toggleTodo(dk, id) {
  var list = todosOf(dk).map(function (x) {
    return x.id === id ? { id: x.id, text: x.text, done: !x.done } : x;
  });
  setTodos(dk, list);
  save();
  var it = todosOf(dk).filter(function (x) { return x.id === id; })[0];
  renderTodoViews(dk);
  toast(it ? (it.done ? '已完成 ' + todoProgressText(dk) : '已取消 · ' + todoProgressText(dk)) : '已删除');
}

function bind() {
  document.addEventListener('click', function (e) {
    var tabBtn = e.target.closest && e.target.closest('.tab');
    if (tabBtn) { switchTab(tabBtn.getAttribute('data-tab')); return; }

    var hit = e.target.closest && e.target.closest('.hit');
    if (hit) {
      var i = +hit.getAttribute('data-i');
      trendSel = (trendSel === i ? null : i);
      renderTrend();
      return;
    }

    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var dk = el.getAttribute('data-d') || today();

    switch (act) {
      case 'todo-toggle': toggleTodo(dk, el.getAttribute('data-id')); break;
      case 'todo-edit':
      case 'todo-add': todoSheet(dk, el.getAttribute('data-id')); break;
      case 'pick-subject':
        trendKey = el.getAttribute('data-key');
        trendSel = null;
        switchTab('scores');
        break;
      case 'go-scores':
        switchTab('scores');
        break;
      case 'go-settings':
        closeSheet(); switchTab('settings');
        break;
      case 'plan-toggle': {
        var pk = el.getAttribute('data-key');
        toggleCheck(dk, pk);
        renderPlan();
        toast(checksOf(dk)[pk] ? SUBJECT_MAP[pk].name + ' 已完成' : SUBJECT_MAP[pk].name + ' 取消完成');
        break;
      }
      case 'open-record': {
        var id = el.getAttribute('data-id');
        var rec = state.records.filter(function (x) { return x.id === id; })[0];
        if (rec) recordSheet(rec);
        break;
      }
      case 'trend':
        trendKey = el.getAttribute('data-key');
        trendSel = null;
        renderTrend();
        break;
      case 'cal-day': {
        var prev = document.querySelector('.cal-cell.sel');
        if (prev && prev !== el) prev.classList.remove('sel');
        el.classList.add('sel');
        selDay = dk;
        renderDayDetail();
        break;
      }
      case 'exam-edit': examSheet(); break;
      case 'day-step': {
        var skey = el.getAttribute('data-key');
        var step = +el.getAttribute('data-d');
        var dm = state.settings.dailySubjectMin;
        dm[skey] = clamp((num(dm[skey]) || 0) + step, 0, 360);
        save();
        var bEl = document.querySelector('[data-dayval="' + skey + '"]');
        if (bEl) bEl.textContent = planTimeText(dm[skey]);
        var sEl = document.querySelector('[data-daysub="' + skey + '"]');
        if (sEl) sEl.textContent = hoursText(dm[skey]);
        var tEl = document.getElementById('dayTotal');
        if (tEl) tEl.textContent = hoursText(dailyTotalMin());
        renderTop();
        toast(SUBJECT_MAP[skey].name + ' ' + hoursText(dm[skey]));
        break;
      }
      case 'seed':
        state = seed(); save(); refresh(); toast('已载入示例数据');
        break;
      case 'wipe':
        openSheet('<div class="sheet-title">清空全部数据</div>' +
          '<div class="sheet-sub">学习记录、成绩、事项和设置都会被删除，无法恢复</div>' +
          '<button class="btn-primary" id="wpOk" style="background:linear-gradient(150deg,rgba(255,69,58,.95),rgba(255,120,110,.9));box-shadow:0 8px 22px rgba(255,69,58,.3)">确认清空</button>' +
          '<div class="btn-row" style="margin-top:9px"><button class="btn-ghost" id="wpCancel">取消</button></div>', function (root) {
            root.querySelector('#wpOk').onclick = function () {
              state = { v: STATE_VERSION, settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), records: [], study: {}, checks: {}, todos: {} };
              save(); refresh(); closeSheet(); toast('已清空');
            };
            root.querySelector('#wpCancel').onclick = closeSheet;
          });
        break;
    }
  });

  document.getElementById('addRecordBtn').onclick = function () { recordSheet(null); };
  document.getElementById('quickAdd').onclick = quickSheet;
  document.getElementById('sheetBackdrop').onclick = closeSheet;
  document.getElementById('calPrev').onclick = function () { shiftMonth(-1); };
  document.getElementById('calNext').onclick = function () { shiftMonth(1); };
  document.getElementById('calTodayBtn').onclick = function () { selDay = today(); setView(today()); };
  document.getElementById('calMonth').onclick = function () { selDay = today(); setView(today()); };

  // 设置项输入
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el.getAttribute) return;
    var k = el.getAttribute('data-set');
    if (!k) return;
    var s = state.settings;
    var isTarget = k.charAt(0) === 't' && k.charAt(1) === '_';
    if (k === 'examDate') {
      if (!el.value) return;
      s.examDate = el.value;
    } else if (k === 'salaryGoal') {
      s.salaryGoal = el.value.trim() || DEFAULT_SETTINGS.salaryGoal;
    } else if (isTarget) {
      var sk = k.slice(2);
      var v = num(el.value);
      s.targets[sk] = v === null ? 0 : clamp(v, 0, SUBJECT_MAP[sk].max);
    }
    save();
    if (isTarget) {
      /* 目标总分即时更新，不必等输入框失焦后整页重渲染 */
      var tt = document.getElementById('targetTotal');
      if (tt) tt.innerHTML = targetSum() + '<span style="font-weight:500">/500</span>';
    }
    renderTop();
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || !el.getAttribute) return;
    var k = el.getAttribute('data-set');
    if (!k) return;
    if (k.charAt(0) === 't' && k.charAt(1) === '_') {
      /* 失焦时把输入回填成 clamp 后的真实值（超满分会被截断） */
      el.value = num(state.settings.targets[k.slice(2)]) || 0;
    }
  });

  window.addEventListener('storage', function (ev) {
    if (ev.key === STORE_KEY) { state = load(); refresh(); }
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      if (!sheetOpen) refresh();
      lastDay = today();
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  bindTopbar();
}

/* 顶栏：滚动前完全透明，滚动后浮出玻璃层（rAF 节流，避免滚动掉帧） */
function bindTopbar() {
  var bar = document.querySelector('.topbar');
  if (!bar) return;
  var ticking = false;
  function update() {
    ticking = false;
    bar.classList.toggle('scrolled', window.scrollY > 6);
  }
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
}
function shiftMonth(n) {
  var p = calView.split('-');
  var d = new Date(+p[0], +p[1] - 1 + n, 1);
  setView(keyOf(d));
}
function setView(k) {
  calView = k.slice(0, 7);
  renderCalendar();
}

/* ── 启动 ─────────────────────────────────────────────── */
var lastDay = today();
function boot() {
  if (!localStorage.getItem(STORE_KEY)) {
    state = seed();
    save();
  } else {
    state = load();
    save();          // 把迁移（版本升级、院校变更）结果落盘
  }
  if (!calView) calView = today().slice(0, 7);
  if (!selDay) selDay = today();
  bind();
  switchTab('today');
  setInterval(function () {
    var t = today();
    if (t !== lastDay) { lastDay = t; if (!sheetOpen) refresh(); }
  }, 30000);
}

/* 调试 / 自动化挂钩（不影响正常使用） */
window.KY = {
  get state() { return state; }, save: save, load: load, seed: seed, refresh: refresh,
  reload: function () { state = load(); save(); refresh(); return state; },
  today: today, keyOf: keyOf, addDays: addDays, dayDiff: dayDiff,
  toggleTodo: toggleTodo, setTodos: setTodos, todosOf: todosOf, todoCount: todoCount,
  toggleCheck: toggleCheck, checksOf: checksOf, currentPhase: currentPhase,
  weakestSubject: weakestSubject, planTimeText: planTimeText, PHASES: PHASES,
  switchTab: switchTab, subjectSeries: subjectSeries, totalSeries: totalSeries,
  latestTotal: latestTotal, targetSum: targetSum, dailyTotalMin: dailyTotalMin,
  recordedCount: recordedCount, subjectStat: subjectStat, latestScoredSubject: latestScoredSubject,
  subjectGapSentence: subjectGapSentence, scoreSummaryText: scoreSummaryText,
  MAX_TODOS: MAX_TODOS, openSheet: openSheet, closeSheet: closeSheet,
  recordSheet: recordSheet, todoSheet: todoSheet, examSheet: examSheet, STORE_KEY: STORE_KEY
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
