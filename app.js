/* Sunpour Expenses — app logic (no build step, plain JS).
   Money is always computed in paise (integers) so totals never drift. */
(function () {
  'use strict';

  /* ======================= utilities ======================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paise = (rupees) => Math.round(Number(rupees || 0) * 100);
  const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  /** format paise as ₹ */
  function money(p, { sign = false } = {}) {
    const neg = p < 0, abs = Math.abs(p);
    const s = abs % 100 === 0 ? inr0.format(abs / 100) : inr2.format(abs / 100);
    return (neg ? '−' : sign && p > 0 ? '+' : '') + '₹' + s;
  }
  function short(p) {
    const r = Math.abs(p) / 100;
    if (r >= 100000) return '₹' + (r / 100000).toFixed(r >= 1000000 ? 0 : 1).replace(/\.0$/, '') + 'L';
    if (r >= 1000) return '₹' + (r / 1000).toFixed(r >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return '₹' + Math.round(r);
  }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // dates are local 'YYYY-MM-DD' strings
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const weekStart = (s) => { const d = parse(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return iso(d); }; // Monday
  const monthStart = (s) => s.slice(0, 8) + '01';
  const monthEnd = (s) => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return iso(d); };
  const addMonths = (s, n) => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + n); return iso(d); };
  /* language: each staff profile picks English or Hindi on its own (admin and HR screens stay English) */
  const store0 = { get(k, d) { try { const v = localStorage.getItem('spx.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } } };
  let LANG_ME = null; // set from S.me once state exists
  const isStaff = (me) => me && me !== 'admin' && me !== 'hr';
  const lang = () => (isStaff(LANG_ME) ? store0.get('lang.' + LANG_ME, 'en') : LANG_ME ? 'en' : store0.get('lang.device', 'en'));
  /** translate a staff-screen string; {name} parts are filled from vars */
  function tr(en, vars) {
    let out = lang() === 'hi' && window.SPX_HI && window.SPX_HI[en] ? window.SPX_HI[en] : en;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return out;
  }
  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MON_HI = ['जन', 'फ़र', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुल', 'अग', 'सित', 'अक्टू', 'नव', 'दिस'];
  const DOW_HI = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];
  const MONTHS_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
  const MON = MON_EN, DOW = DOW_EN; // English names used by admin charts and tables
  const monA = () => (lang() === 'hi' ? MON_HI : MON_EN);
  const dowA = () => (lang() === 'hi' ? DOW_HI : DOW_EN);
  const dShort = (s) => { const d = parse(s); return `${d.getDate()} ${monA()[d.getMonth()]}`; };
  const dLong = (s) => { const d = parse(s); return `${dowA()[d.getDay()]}, ${d.getDate()} ${monA()[d.getMonth()]} ${d.getFullYear()}`; };
  const monthName = (s) => { const d = parse(s); return `${(lang() === 'hi' ? MONTHS_HI : MONTHS_EN)[d.getMonth()]} ${d.getFullYear()}`; };
  function dayLabel(s) {
    const t = today();
    if (s === t) return tr('Today');
    if (s === addDays(t, -1)) return tr('Yesterday');
    return dLong(s);
  }
  const weekLabel = (ws) => { const we = addDays(ws, 6); return `${dShort(ws)} – ${dShort(we)}`; };

  const store = {
    get(k, d) { try { const v = localStorage.getItem('spx.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('spx.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem('spx.' + k); } catch (e) { /* ignore */ } },
  };

  /* ======================= icons ======================= */
  const ICONS = {
    fuel: 'M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 8h2.5L19 10.5V17a1.5 1.5 0 0 1-3 0v-3h-2',
    cup: 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3v3M12.5 3v3',
    milk: 'M9 2.5h6M10 2.5v3L7.5 9v10.5a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2V9L14 5.5v-3M7.5 13h9',
    drop: 'M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5z',
    basket: 'M3.5 9.5h17l-1.8 10a1.5 1.5 0 0 1-1.5 1.2H6.8a1.5 1.5 0 0 1-1.5-1.2l-1.8-10zM8 9.5l4-6 4 6M9.5 13.5v3.5M14.5 13.5v3.5',
    meal: 'M6.5 3v7a2 2 0 0 0 2 2v9M10.5 3v7a2 2 0 0 1-2 2M8.5 3v5M17.5 21V3c-2 1.5-3 5-3 9h3',
    box: 'M3.5 7.5l8.5-4 8.5 4v9l-8.5 4-8.5-4v-9zM3.5 7.5l8.5 4 8.5-4M12 11.5v9',
    wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.4-.4-2.6 2.4-2.4z',
    pen: 'M15.5 4.5l4 4L8.5 19.5H4.5v-4l11-11zM13 7l4 4',
    car: 'M5 16.5h14M4.5 16.5v-4l1.8-4.6A1.5 1.5 0 0 1 7.7 7h8.6a1.5 1.5 0 0 1 1.4.9l1.8 4.6v4M4.5 12.5h15M7 16.5v2.5M17 16.5v2.5',
    bolt: 'M13 2.5L4.5 13.5h6.5l-1 8 8.5-11h-6.5l1-8z',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
    parcel: 'M3.5 8l8.5-4.5L20.5 8v8.5L12 21l-8.5-4.5V8zM3.5 8L12 12.5 20.5 8M12 12.5V21M7.8 5.8l8.5 4.5',
    dots: 'M6 12h.01M12 12h.01M18 12h.01',
    plus: 'M12 5v14M5 12h14',
    home: 'M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19v-8.5z',
    list: 'M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
    chart: 'M4 20h16M7 16.5V11M12 16.5V6M17 16.5v-3.5',
    report: 'M7 3.5h7l4 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM14 3.5v4h4M9 13h6M9 16.5h6M9 9.5h2',
    lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9.5h-13z',
    gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7 7 0 0 1-2 1.2l-.3 2h-3.6l-.3-2a7 7 0 0 1-2-1.2l-1.9.7-1.8-3.1 1.6-1.2a7 7 0 0 1 0-3l-1.6-1.2 1.8-3.1 1.9.7a7 7 0 0 1 2-1.2l.3-2h3.6l.3 2a7 7 0 0 1 2 1.2l1.9-.7 1.8 3.1-1.6 1.2a7 7 0 0 1 0 3z',
    left: 'M14.5 6l-6 6 6 6',
    right: 'M9.5 6l6 6-6 6',
    down: 'M12 4.5v15M6 13.5l6 6 6-6',
    up: 'M12 19.5v-15M6 10.5l6-6 6 6',
    swap: 'M4 8h14l-3.5-3.5M20 16H6l3.5 3.5',
    search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8',
    download: 'M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15',
    share: 'M12 3.5v12M7.5 8l4.5-4.5L16.5 8M5 12.5v7h14v-7',
    print: 'M7 9V3.5h10V9M7 17.5H4.5v-7.5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v7.5H17M7 14.5h10v6H7z',
    x: 'M6 6l12 12M18 6L6 18',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    alert: 'M12 4l9 16H3l9-16zM12 10v4.5M12 17.5h.01',
    wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5h11v3M4 7.5v10A2.5 2.5 0 0 0 6.5 20H20v-12H6.5A2.5 2.5 0 0 1 4 5.5M16 14h.01',
    user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
    trash: 'M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5',
    edit: 'M15.5 4.5l4 4L8.5 19.5H4.5v-4l11-11z',
    calendar: 'M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4',
    cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v.01M18 14v.01',
    upi: 'M7 3.5h10v17H7zM10.5 17.5h3',
    flag: 'M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11',
    sync: 'M19.5 12a7.5 7.5 0 0 1-13 5M4.5 12a7.5 7.5 0 0 1 13-5M17.5 3.5V7H14M6.5 20.5V17H10',
    users: 'M9 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM3 20a6 6 0 0 1 12 0M16 4.3a3.5 3.5 0 0 1 0 6.4M17.5 14.2A6 6 0 0 1 21 20',
    star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    monitor: 'M3.5 5h17v11h-17zM8.5 20h7M12 16v4',
    halfday: 'M12 3.5a8.5 8.5 0 1 0 0 17zM12 3.5a8.5 8.5 0 0 1 0 17',
    logout: 'M14 4.5h4.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H14M10 8l-4 4 4 4M6 12h10',
  };
  const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n] || ICONS.dots}"/></svg>`;

  /* chart colors (validated categorical order, see dataviz palette) */
  const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)'];
  const CAT_SLOT = { petrol: 0, tea: 1, water: 2, milk: 3, supplies: 4, grocery: 5, maintenance: 6 };
  const OTHER = 'var(--s-other)';

  /* ======================= state ======================= */
  const CONFIG = window.SPX_CONFIG || {};
  const S = {
    config: store.get('config', null),      // {people, categories, hasPin}
    me: store.get('me', null),              // person id, or 'admin'
    mine: store.get('mine', []),            // my transactions (cache)
    outbox: store.get('outbox', []),        // unsynced saves/deletes
    token: store.get('token', null),        // admin token
    admin: null,                            // admin data {transactions, people, categories, counts, audit}
    route: 'home',
    period: store.get('period', 'month'),
    periodAnchor: today(),
    reportMode: 'week',
    reportAnchor: today(),
    ledgerFilter: { person: '', type: '', category: '', q: '', flagged: false, deleted: false },
    attNow: store.get('attNow', null),
    theme: store.get('theme', 'system'),
    att: null, attMonth: null, hr: null, hrMonth: null, hrTab: 'attendance',
    online: navigator.onLine,
    syncing: false,
    lastError: '',
  };

  LANG_ME = S.me;
  const people = () => (S.admin ? S.admin.people : S.config ? S.config.people : []);
  const cats = () => (S.admin ? S.admin.categories : S.config ? S.config.categories : []);
  const personName = (id) => (people().find((p) => p.id === id) || { name: id === 'admin' ? 'Admin' : id === 'import' ? 'Old sheet' : 'Unknown' }).name;
  const firstName = (id) => personName(id).split(' ')[0];
  const catOf0 = (id) => cats().find((c) => c.id === id) || { id, name: id || 'Uncategorised', icon: 'dots' };
  /** category in the viewer's language: default categories get their Hindi name unless the admin renamed them */
  const catOf = (id) => {
    const c = catOf0(id);
    if (lang() === 'hi' && window.SPX_HI_CATS && SPX_HI_CATS[c.id] && (!SPX_HI_CAT_EN[c.id] || SPX_HI_CAT_EN[c.id] === c.name)) return { ...c, name: SPX_HI_CATS[c.id] };
    return c;
  };
  const personColor = (id) => SERIES[Math.max(0, people().findIndex((p) => p.id === id)) % SERIES.length];
  const catColor = (id) => (CAT_SLOT[id] != null ? SERIES[CAT_SLOT[id]] : OTHER);

  /* ======================= API ======================= */
  async function api(action, payload = {}) {
    const body = { action, actor: S.me, token: S.token, ...payload };
    if (!CONFIG.API_URL) return window.MockAPI(body);
    const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
    if (!res.ok) throw new Error('Server error ' + res.status);
    const data = await res.json();
    if (!data.ok) {
      if (data.error === 'ADMIN_LOGIN_REQUIRED' || data.error === 'HR_LOGIN_REQUIRED') { S.token = null; store.del('token'); S.admin = null; S.hr = null; }
      throw new Error(data.error || 'Something went wrong');
    }
    return data;
  }

  async function loadConfig() {
    try {
      const c = await api('config');
      S.config = { people: c.people, categories: c.categories, hasPin: c.hasPin, hasHrPin: c.hasHrPin };
      if (c.today) S.serverToday = c.today;
      store.set('config', S.config);
    } catch (e) { if (!S.config) throw e; }
  }

  async function loadMine() {
    if (!S.me || S.me === 'admin') return;
    const r = await api('list', { person: S.me });
    S.mine = r.transactions; S.mineLoaded = true;
    store.set('mine', S.mine);
  }

  async function loadAdmin() {
    const r = await api('admin');
    S.admin = r;
    S.config = { people: r.people, categories: r.categories, hasPin: true };
    store.set('config', S.config);
  }

  /* ---- outbox: saves work offline and sync when back ---- */
  function queue(op) {
    S.outbox = S.outbox.filter((o) => !(o.id === op.id)); // newest wins
    S.outbox.push(op);
    store.set('outbox', S.outbox);
  }
  async function flush() {
    if (S.syncing || !S.outbox.length) return;
    S.syncing = true; renderSyncChip();
    try {
      while (S.outbox.length) {
        const op = S.outbox[0];
        if (op.kind === 'save') await api('save', { txn: op.txn });
        else if (op.kind === 'delete') await api('remove', { id: op.id });
        S.outbox.shift();
        store.set('outbox', S.outbox);
      }
      S.lastError = '';
    } catch (e) {
      S.lastError = navigator.onLine ? e.message : '';
      // validation errors would block the queue forever: drop that one item and tell the user
      if (navigator.onLine && /Bad|Pick|Unknown|Amount|Missing/.test(e.message)) {
        const bad = S.outbox.shift(); store.set('outbox', S.outbox);
        toast(`Couldn't save ${bad.txn ? money(paise(bad.txn.amount)) : 'an entry'}: ${e.message}`, 'warn');
      }
    } finally {
      S.syncing = false; renderSyncChip();
    }
  }

  /* local view of a person's data = server cache + unsynced outbox */
  function myTxns() {
    const map = new Map(S.mine.map((t) => [t.id, t]));
    for (const op of S.outbox) {
      if (op.kind === 'save') map.set(op.id, { ...op.txn, _pending: true });
      if (op.kind === 'delete') map.delete(op.id);
    }
    return [...map.values()].filter((t) => !t.deleted);
  }
  function adminTxns(includeDeleted = false) {
    if (!S.admin) return [];
    const map = new Map(S.admin.transactions.map((t) => [t.id, t]));
    for (const op of S.outbox) {
      if (op.kind === 'save') map.set(op.id, { ...(map.get(op.id) || {}), ...op.txn, _pending: true });
      if (op.kind === 'delete' && map.has(op.id)) map.set(op.id, { ...map.get(op.id), deleted: true, _pending: true });
    }
    return [...map.values()].filter((t) => includeDeleted || !t.deleted);
  }

  /* ======================= calculations ======================= */
  /** effect of one transaction on a person's cash in hand (paise) */
  function effect(t, pid) {
    const a = paise(t.amount);
    if (t.type === 'received' && t.person === pid) return a;
    if (t.type === 'expense' && t.person === pid) return -a;
    if (t.type === 'transfer') { if (t.person === pid) return -a; if (t.to === pid) return a; }
    return 0;
  }
  function balanceOf(txns, pid, upTo) { // upTo inclusive date
    let b = 0;
    for (const t of txns) if (!upTo || t.date <= upTo) b += effect(t, pid);
    return b;
  }
  /** full summary of a date range */
  function summarize(txns, from, to, pids) {
    const inR = txns.filter((t) => t.date >= from && t.date <= to);
    const per = {};
    for (const pid of pids) {
      const before = addDays(from, -1);
      const o = { opening: balanceOf(txns, pid, before), received: 0, spent: 0, tin: 0, tout: 0, count: 0, byCat: {} };
      for (const t of inR) {
        const a = paise(t.amount);
        if (t.type === 'received' && t.person === pid) o.received += a;
        if (t.type === 'expense' && t.person === pid) { o.spent += a; o.count++; o.byCat[t.category] = (o.byCat[t.category] || 0) + a; }
        if (t.type === 'transfer' && t.person === pid) o.tout += a;
        if (t.type === 'transfer' && t.to === pid) o.tin += a;
      }
      o.closing = o.opening + o.received + o.tin - o.tout - o.spent;
      per[pid] = o;
    }
    const tot = { received: 0, spent: 0, petrol: 0, count: 0, byCat: {}, byDay: {}, byMode: { Cash: 0, UPI: 0, '': 0 } };
    for (const t of inR) {
      const a = paise(t.amount);
      if (t.type === 'received') tot.received += a;
      if (t.type === 'expense') {
        tot.spent += a; tot.count++;
        tot.byCat[t.category] = (tot.byCat[t.category] || 0) + a;
        if (t.category === 'petrol') tot.petrol += a;
        tot.byDay[t.date] = tot.byDay[t.date] || {};
        tot.byDay[t.date][t.person] = (tot.byDay[t.date][t.person] || 0) + a;
        tot.byMode[t.mode || ''] += a;
      }
    }
    tot.opening = pids.reduce((s, p) => s + per[p].opening, 0);
    tot.closing = pids.reduce((s, p) => s + per[p].closing, 0);
    return { per, tot, rows: inR };
  }

  function periodRange() {
    const a = S.periodAnchor;
    if (S.period === 'week') return { from: weekStart(a), to: addDays(weekStart(a), 6), label: weekLabel(weekStart(a)) };
    if (S.period === 'month') return { from: monthStart(a), to: monthEnd(a), label: monthName(a) };
    const all = adminTxns();
    const first = all.reduce((m, t) => (t.date < m ? t.date : m), today());
    return { from: first, to: today(), label: 'All time' };
  }

  /* ======================= toast & sheet ======================= */
  function toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.innerHTML = (kind === 'warn' ? icon('alert') : icon('check')) + `<span>${esc(msg)}</span>`;
    $('#toasts').appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); }, 3200);
  }

  function openSheet(html, { onOpen, wide } = {}) {
    const root = $('#sheet');
    root.innerHTML = `<div class="sheet-backdrop" data-act="close-sheet"></div>
      <div class="sheet glass${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
    root.hidden = false;
    document.body.classList.add('sheet-open');
    requestAnimationFrame(() => root.classList.add('open'));
    onOpen && onOpen(root);
  }
  function closeSheet() {
    const root = $('#sheet');
    root.classList.remove('open');
    document.body.classList.remove('sheet-open');
    Charts.hideTip();
    setTimeout(() => { root.hidden = true; root.innerHTML = ''; }, 280);
  }

  /* ======================= entry form ======================= */
  /**
   * opts: {txn?, type?, person?, asAdmin?}
   */
  function entryForm(opts = {}) {
    const isEdit = !!opts.txn;
    const t = opts.txn ? { ...opts.txn } : {
      id: uid(), type: opts.type || 'expense', person: opts.person || (S.me !== 'admin' ? S.me : people().filter((p) => p.active)[0]?.id),
      date: today(), amount: '', category: '', mode: store.get('lastMode', 'Cash'), note: '', to: '',
    };
    const admin = S.me === 'admin';
    const activePeople = people().filter((p) => p.active || p.id === t.person || p.id === t.to);
    const title = isEdit ? tr('Edit entry') : t.type === 'received' && admin ? 'Give money' : tr('New entry');

    const typeSeg = `<div class="seg3" role="tablist" data-field="type">
        ${[['expense', tr('Expense')], ['received', admin ? 'Give money' : tr('Received')], ['transfer', admin ? 'Transfer' : tr('To colleague')]]
          .map(([v, l]) => `<button type="button" role="tab" class="${t.type === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}
      </div>`;

    const personPick = admin ? `<div class="field"><label>${t.type === 'received' ? 'Give to' : t.type === 'transfer' ? 'From' : 'Spent by'}</label>
      <div class="chips" data-field="person">${activePeople.map((p) => `<button type="button" class="chip ${t.person === p.id ? 'on' : ''}" data-v="${p.id}">${icon('user')}${esc(p.name)}</button>`).join('')}</div></div>` : '';

    const catGrid = `<div class="field" data-show="expense"><label>${tr('Category')}</label>
      <div class="cat-grid" data-field="category">${cats().filter((c) => c.active || c.id === t.category).map((c) => `
        <button type="button" class="cat ${t.category === c.id ? 'on' : ''}" data-v="${c.id}" style="--c:${catColor(c.id)}">
          <span class="cat-ic">${icon(c.icon)}</span><span>${esc(catOf(c.id).name)}</span></button>`).join('')}
      </div></div>`;

    const toPick = `<div class="field" data-show="transfer"><label>${admin ? 'To' : tr('Gave it to')}</label>
      <div class="chips" data-field="to">${activePeople.filter((p) => p.id !== t.person).map((p) => `<button type="button" class="chip ${t.to === p.id ? 'on' : ''}" data-v="${p.id}">${icon('user')}${esc(p.name)}</button>`).join('')}</div></div>`;

    const y = addDays(today(), -1);
    const dateRow = `<div class="field"><label>${tr('Date')}</label><div class="chips date-chips" data-field="datechip">
        <button type="button" class="chip ${t.date === today() ? 'on' : ''}" data-v="${today()}">${tr('Today')}</button>
        <button type="button" class="chip ${t.date === y ? 'on' : ''}" data-v="${y}">${tr('Yesterday')}</button>
        <label class="chip date-pick ${t.date !== today() && t.date !== y ? 'on' : ''}">${icon('calendar')}<span class="date-text">${t.date !== today() && t.date !== y ? dShort(t.date) : tr('Pick date')}</span>
          <input type="date" name="date" value="${t.date}" max="${today()}"></label>
      </div></div>`;

    const html = `<form class="entry" novalidate>
      <div class="sheet-head"><button type="button" class="link" data-act="close-sheet">${tr('Cancel')}</button><h2>${title}</h2>
        <button type="submit" class="link strong">${tr('Save')}</button></div>
      ${typeSeg}
      <div class="amount-wrap"><span class="cur">₹</span><input class="amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${t.amount || ''}" aria-label="Amount in rupees"></div>
      <p class="hint" data-hint></p>
      ${personPick}
      ${catGrid}
      ${toPick}
      <div class="field"><label>${tr('Paid by')}</label><div class="seg2" data-field="mode">
        <button type="button" class="${t.mode === 'Cash' ? 'on' : ''}" data-v="Cash">${icon('cash')}${tr('Cash')}</button>
        <button type="button" class="${t.mode === 'UPI' ? 'on' : ''}" data-v="UPI">${icon('upi')}${tr('UPI / online')}</button></div></div>
      ${dateRow}
      <div class="field"><label for="note">${tr('Note')} <span class="opt">${tr('optional')}</span></label>
        <input id="note" name="note" class="input" maxlength="300" placeholder="${t.type === 'expense' ? tr('e.g. 2 bottles of water for site') : tr('e.g. advance for the week')}" value="${esc(t.note)}"></div>
      ${isEdit && t.flag && admin ? `<div class="flag-box">${icon('flag')}<div><b>Needs review</b><p>${esc(t.flag)}</p>
          <button type="button" class="btn small" data-act="clear-flag">Mark as reviewed</button></div></div>` : ''}
      <p class="form-error" role="alert"></p>
      <button type="submit" class="btn primary big">${isEdit ? tr('Save changes') : tr('Save entry')}</button>
      ${isEdit ? `<button type="button" class="btn danger-ghost" data-act="delete-entry">${icon('trash')}${tr('Delete entry')}</button>` : ''}
    </form>`;

    openSheet(html, {
      onOpen(root) {
        const form = $('form', root);
        const sync = () => {
          $$('[data-show]', form).forEach((el) => (el.hidden = el.dataset.show !== t.type));
          const hint = $('[data-hint]', form);
          hint.textContent = t.type === 'received'
            ? (admin ? `Adds to ${firstName(t.person)}'s cash in hand.` : tr('Money you got from the office for expenses.'))
            : t.type === 'transfer' ? tr('Moves money between staff. It is not counted as an office expense.') : '';
          const tp = $('[data-field="to"]', form);
          tp.innerHTML = activePeople.filter((p) => p.id !== t.person).map((p) => `<button type="button" class="chip ${t.to === p.id ? 'on' : ''}" data-v="${p.id}">${icon('user')}${esc(p.name)}</button>`).join('');
          if (t.to === t.person) t.to = '';
        };
        sync();
        if (!isEdit) setTimeout(() => $('.amount', form).focus(), 320);

        form.addEventListener('click', (e) => {
          const b = e.target.closest('button[data-v]');
          if (!b) return;
          const f = b.parentElement.dataset.field;
          if (!f) return;
          if (f === 'datechip') { t.date = b.dataset.v; $('input[name=date]', form).value = t.date; $('.date-text', form).textContent = tr('Pick date'); $('.date-pick', form).classList.remove('on'); }
          else t[f] = b.dataset.v;
          $$('button[data-v]', b.parentElement).forEach((x) => x.classList.toggle('on', x === b));
          if (f === 'type' || f === 'person') sync();
          if (f === 'type') { $('h2', form).textContent = isEdit ? tr('Edit entry') : t.type === 'received' && admin ? 'Give money' : tr('New entry'); }
        });
        $('input[name=date]', form).addEventListener('change', (e) => {
          if (!e.target.value) return;
          t.date = e.target.value;
          $$('.date-chips .chip', form).forEach((x) => x.classList.remove('on'));
          const isQuick = t.date === today() || t.date === y;
          if (isQuick) $(`.date-chips [data-v="${t.date}"]`, form).classList.add('on');
          else { $('.date-pick', form).classList.add('on'); $('.date-text', form).textContent = dShort(t.date); }
        });
        $('.amount', form).addEventListener('input', (e) => {
          let v = e.target.value.replace(/[^\d.]/g, '');
          const parts = v.split('.');
          if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
          if (parts[1] && parts[1].length > 2) v = parts[0] + '.' + parts[1].slice(0, 2);
          e.target.value = v;
          fitAmount(e.target);
        });
        fitAmount($('.amount', form));
        form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
        root.addEventListener('click', async (e) => {
          const a = e.target.closest('[data-act]');
          if (!a) return;
          if (a.dataset.act === 'delete-entry') {
            if (!confirm(tr('Delete this entry? The admin can still see it in the change log.'))) return;
            queue({ kind: 'delete', id: t.id });
            closeSheet(); toast(tr('Entry deleted')); afterChange();
          }
          if (a.dataset.act === 'clear-flag') {
            t.flag = '';
            a.closest('.flag-box').remove();
            queue({ kind: 'save', id: t.id, txn: { ...t, amount: Number(t.amount) } });
            toast('Marked as reviewed'); afterChange();
          }
        });

        function submit() {
          const err = $('.form-error', form);
          t.note = $('#note', form).value.trim();
          t.amount = $('.amount', form).value;
          const a = Number(t.amount);
          const fail = (m) => { err.textContent = m; err.classList.remove('shake'); void err.offsetWidth; err.classList.add('shake'); err.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
          if (!(a > 0)) return fail(tr('Enter the amount.'));
          if (a > 1000000) return fail(tr('That amount looks too large. Check the number.'));
          if (!t.person) return fail(tr('Pick a person.'));
          if (t.type === 'expense' && !t.category) return fail(tr('Pick a category.'));
          if (t.type === 'transfer' && !t.to) return fail(tr('Pick who got the money.'));
          if (!t.mode) return fail(tr('Pick Cash or UPI.'));
          if (t.date > today()) return fail(tr('Date can’t be in the future.'));
          const clean = { id: t.id, date: t.date, person: t.person, type: t.type, category: t.type === 'expense' ? t.category : '', amount: Math.round(a * 100) / 100, mode: t.mode, note: t.note, to: t.type === 'transfer' ? t.to : '', flag: t.flag || '', createdAt: t.createdAt || new Date().toISOString(), by: t.by || S.me };
          // duplicate guard
          if (!isEdit && !form.dataset.dupeOk) {
            const pool = S.me === 'admin' ? adminTxns() : myTxns();
            const dupe = pool.find((x) => x.id !== clean.id && x.type === clean.type && x.person === clean.person && x.date === clean.date && paise(x.amount) === paise(clean.amount) && (x.category || '') === clean.category);
            if (dupe) {
              form.dataset.dupeOk = '1';
              const who = dupe.by === 'admin' ? tr('the admin') : dupe.by === S.me ? tr('you') : firstName(dupe.by);
              return fail(tr('{amt} on {date} was already entered by {who}. Tap Save again if this is a separate entry.', { amt: money(paise(clean.amount)), date: dShort(clean.date), who }));
            }
          }
          store.set('lastMode', clean.mode);
          queue({ kind: 'save', id: clean.id, txn: clean });
          closeSheet();
          const amtS = money(paise(clean.amount));
          toast(isEdit ? tr('Changes saved') : clean.type === 'expense' ? tr('{amt} expense saved', { amt: amtS }) : clean.type === 'received' ? (admin ? `${amtS} given to ${firstName(clean.person)}` : tr('{amt} received', { amt: amtS })) : tr('{amt} transfer saved', { amt: amtS }));
          afterChange();
        }
      },
    });
  }

  /** grow the big amount box with its digits so the ₹ sign stays next to them */
  function fitAmount(el) {
    const v = el.value || el.placeholder || '0';
    const digits = v.replace(/[^\d]/g, '').length, dots = (v.match(/\./g) || []).length;
    el.style.width = `${Math.max(1, digits) * 0.62 + dots * 0.3 + 0.15}em`;
  }

  function afterChange() {
    render();
    flush().then(() => refreshData().then(render).catch(() => {}));
  }

  /* ======================= views: shared bits ======================= */
  function txRow(t, { showPerson = false } = {}) {
    const c = catOf(t.category);
    const a = paise(t.amount);
    const viewer = S.me;
    let title, ic, cls, amt;
    if (t.type === 'expense') { title = c.name; ic = icon(c.icon); cls = 'exp'; amt = money(-a); }
    else if (t.type === 'received') { title = viewer === 'admin' ? `Given to ${firstName(t.person)}` : tr('Money received'); ic = icon('down'); cls = 'in'; amt = money(a, { sign: true }); }
    else {
      const outgoing = viewer === 'admin' ? true : t.person === viewer;
      title = viewer === 'admin' ? `${firstName(t.person)} → ${firstName(t.to)}` : outgoing ? tr('Gave to {name}', { name: firstName(t.to) }) : tr('From {name}', { name: firstName(t.person) });
      ic = icon('swap'); cls = 'tr'; amt = viewer === 'admin' ? money(a) : outgoing ? money(-a) : money(a, { sign: true });
    }
    const sub = [showPerson && t.type === 'expense' ? firstName(t.person) : '', t.note, t.mode === 'UPI' ? 'UPI' : t.mode === 'Cash' ? tr('Cash') : ''].filter(Boolean).map(esc).join(' · ');
    const canEdit = viewer === 'admin' || (t.by !== 'admin' && (t.person === viewer || t.by === viewer));
    return `<button class="tx ${cls}${t.deleted ? ' deleted' : ''}" ${canEdit && !t.deleted ? `data-act="edit" data-id="${esc(t.id)}"` : 'disabled'} style="--c:${t.type === 'expense' ? catColor(t.category) : ''}">
      <span class="tx-ic">${ic}</span>
      <span class="tx-main"><span class="tx-title">${esc(title)}${t.flag && viewer === 'admin' ? ` <span class="pill warn">Review</span>` : ''}${t._pending ? ` <span class="pill">${tr('Syncing')}</span>` : ''}${t.deleted ? ' <span class="pill">Deleted</span>' : ''}</span>
        <span class="tx-sub">${sub || '&nbsp;'}</span></span>
      <span class="tx-amt">${amt}</span></button>`;
  }

  function groupedList(txns, opts = {}) {
    if (!txns.length) return `<div class="empty">${icon('list')}<p>${opts.empty || tr('No entries yet.')}</p></div>`;
    const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
    let html = '', cur = null, buf = [], dayTotal = 0;
    const flushDay = () => {
      if (cur == null) return;
      html += `<section class="day"><header><span>${dayLabel(cur)}</span>${dayTotal ? `<span class="muted">${money(-dayTotal)}</span>` : ''}</header><div class="glass list">${buf.join('')}</div></section>`;
    };
    for (const t of sorted) {
      if (t.date !== cur) { flushDay(); cur = t.date; buf = []; dayTotal = 0; }
      buf.push(txRow(t, opts));
      if (t.type === 'expense') dayTotal += paise(t.amount);
    }
    flushDay();
    return html;
  }

  function balanceWords(b, name) {
    if (b > 0) return { tone: 'pos', text: name ? `${name} has ${money(b)} of office cash` : tr('You have {amt} of office cash', { amt: money(b) }) };
    if (b < 0) return { tone: 'neg', text: name ? `Office owes ${name} ${money(-b)}` : tr('Office owes you {amt}', { amt: money(-b) }) };
    return { tone: 'zero', text: name ? 'All settled' : tr('All settled') };
  }

  /* ======================= employee views ======================= */
  function viewWho() {
    const ps = (S.config?.people || []).filter((p) => p.active);
    return `<div class="who">
      ${logoFull('big')}
      <h1>${tr('Who’s using this phone?')}</h1>
      <p class="muted">${tr('You only choose once. You can change it later.')}</p>
      <div class="who-list">
        ${ps.map((p, i) => `<button class="glass who-btn" data-act="pick-me" data-id="${p.id}"><span class="avatar" style="--c:${SERIES[i % SERIES.length]}">${esc(p.name[0])}</span><span>${esc(p.name)}</span>${icon('right')}</button>`).join('')}
        <button class="glass who-btn admin" data-act="pick-me" data-id="admin"><span class="avatar">${icon('lock')}</span><span>${tr('I’m the admin')}</span>${icon('right')}</button>
        <button class="glass who-btn" data-act="pick-me" data-id="hr"><span class="avatar" style="--c:var(--s7)">${icon('users')}</span><span>HR</span>${icon('right')}</button>
      </div>
      ${!ps.length ? `<p class="form-error">${S.lastError ? esc(S.lastError) : tr('Loading…')}</p>` : ''}
      <div class="who-theme">${langSeg()}${themeSeg()}</div>
    </div>`;
  }

  function viewHome() {
    const tx = myTxns();
    const bal = balanceOf(tx, S.me);
    const ws = weekStart(today());
    const sum = summarize(tx, ws, addDays(ws, 6), [S.me]);
    const me = sum.per[S.me];
    const bw = balanceWords(bal);
    const topCats = Object.entries(me.byCat).sort((a, b) => b[1] - a[1]);
    const maxCat = topCats[0]?.[1] || 1;
    const recent = tx.filter((t) => t.date >= addDays(today(), -6));
    return `
      <div class="topbar">${logoFull()}<div class="topbar-actions">${refreshButton()}${langButton()}${themeButton()}<button class="icon-btn glass" data-act="switch-user" aria-label="${tr('Switch user')}">${icon('user')}</button></div></div>
      <header class="hello"><div><p class="muted">${esc(personName(S.me))} · ${dLong(today())}</p><h1>${tr('Today')}</h1></div></header>
      ${attendanceCard()}
      <section class="balance glass hero ${bw.tone}">
        <p class="label">${tr('Cash in hand')}</p>
        <p class="hero-num">${!S.mineLoaded && !S.mine.length ? '…' : money(bal)}</p>
        <p class="hero-sub">${!S.mineLoaded && !S.mine.length ? tr('Loading…') : bw.text}</p>
        <div class="hero-stats">
          <div><span>${tr('Spent this week')}</span><b>${money(me.spent)}</b></div>
          <div><span>${tr('Received this week')}</span><b>${money(me.received + me.tin)}</b></div>
        </div>
      </section>
      <div class="quick">
        <button class="btn primary big" data-act="add" data-type="expense">${icon('plus')}${tr('Add expense')}</button>
        <div class="quick-2">
          <button class="btn glass" data-act="add" data-type="received">${icon('down')}${tr('Money received')}</button>
          <button class="btn glass" data-act="add" data-type="transfer">${icon('swap')}${tr('Gave to staff')}</button>
        </div>
      </div>
      ${topCats.length ? `<section class="card glass"><h3>${tr('This week by category')}</h3><div class="mini-bars">${topCats.map(([k, v]) => `
        <div class="mb-row"><span class="mb-ic" style="--c:${catColor(k)}">${icon(catOf(k).icon)}</span><span class="mb-name">${esc(catOf(k).name)}</span>
          <span class="mb-track"><span style="width:${(v / maxCat) * 100}%;background:${catColor(k)}"></span></span><b>${money(v)}</b></div>`).join('')}</div></section>` : ''}
      <h3 class="section-title">${tr('Last 7 days')}</h3>
      ${groupedList(recent, { empty: tr('Nothing this week yet. Tap “Add expense” to start.') })}
      <button class="btn ghost wide" data-go="history">${tr('See all entries')}</button>`;
  }

  function viewHistory() {
    const tx = myTxns();
    const months = [...new Set(tx.map((t) => t.date.slice(0, 7)))].sort().reverse();
    const sel = S.histMonth && months.includes(S.histMonth) ? S.histMonth : months[0] || today().slice(0, 7);
    const inM = tx.filter((t) => t.date.startsWith(sel));
    const s = summarize(tx, sel + '-01', monthEnd(sel + '-01'), [S.me]).per[S.me];
    return `<header class="page-head"><h1>${tr('My entries')}</h1><div class="head-actions">${refreshButton()}</div></header>
      <div class="scroller chips">${months.map((m) => `<button class="chip ${m === sel ? 'on' : ''}" data-act="hist-month" data-m="${m}">${monthName(m + '-01')}</button>`).join('')}</div>
      <section class="stat-row">
        <div class="stat glass"><span>${tr('Opening')}</span><b>${money(s.opening)}</b></div>
        <div class="stat glass"><span>${tr('Received')}</span><b class="pos">${money(s.received + s.tin)}</b></div>
        <div class="stat glass"><span>${tr('Spent')}</span><b>${money(s.spent + s.tout)}</b></div>
        <div class="stat glass"><span>${tr('Closing')}</span><b>${money(s.closing)}</b></div>
      </section>
      ${groupedList(inM)}`;
  }

  /* ======================= admin views ======================= */
  function viewAdminLogin() {
    const needsPin = S.config && !S.config.hasPin;
    return `<div class="who login">
      ${logoFull('big')}
      <h1>${needsPin ? 'Create your admin PIN' : 'Admin'}</h1>
      <p class="muted">${needsPin ? 'Choose 4 to 8 digits. You’ll need this PIN to open the dashboard on any device.' : 'Enter your PIN to see the dashboard and reports.'}</p>
      <form class="pin-form" data-mode="${needsPin ? 'create' : 'login'}">
        <input class="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="${needsPin ? 'new-password' : 'current-password'}" placeholder="••••" aria-label="PIN" autofocus>
        ${needsPin ? `<input class="pin" name="pin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password" placeholder="Repeat PIN" aria-label="Repeat PIN">` : ''}
        <p class="form-error" role="alert"></p>
        <button class="btn primary big" type="submit">${needsPin ? 'Create PIN' : 'Unlock'}</button>
      </form>
      <button class="btn ghost" data-act="switch-user">Not the admin? Switch user</button>
    </div>`;
  }

  function periodBar() {
    const r = periodRange();
    return `<div class="period glass">
      <div class="seg3 small">${[['week', 'Week'], ['month', 'Month'], ['all', 'All']].map(([v, l]) => `<button class="${S.period === v ? 'on' : ''}" data-act="period" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="stepper">${S.period !== 'all' ? `<button class="icon-btn" data-act="period-step" data-d="-1" aria-label="Previous">${icon('left')}</button>` : ''}
        <span class="period-label">${esc(r.label)}</span>
        ${S.period !== 'all' ? `<button class="icon-btn" data-act="period-step" data-d="1" aria-label="Next" ${r.to >= today() ? 'disabled' : ''}>${icon('right')}</button>` : ''}</div>
    </div>`;
  }

  function viewDashboard() {
    if (!S.admin) return loadingView();
    const tx = adminTxns();
    const ps = people().filter((p) => p.active || tx.some((t) => t.person === p.id || t.to === p.id));
    const pids = ps.map((p) => p.id);
    const r = periodRange();
    const sm = summarize(tx, r.from, r.to, pids);
    const flagged = tx.filter((t) => t.flag);
    const withStaff = pids.reduce((s, p) => s + balanceOf(tx, p, r.to), 0);
    const counts = (S.admin.counts || []);

    const kpi = (label, val, sub, cls = '') => `<div class="kpi glass ${cls}"><span>${label}</span><b>${val}</b><small>${sub}</small></div>`;
    const days = Math.max(1, Math.min((parse(r.to < today() ? r.to : today()) - parse(r.from)) / 86400000 + 1, 400));
    return `
      <header class="page-head"><div><p class="muted">Admin</p><h1>Dashboard</h1></div>
        <button class="btn primary" data-act="add" data-type="received">${icon('plus')}Give money</button></header>
      ${!S.admin.transactions.length ? `<section class="card glass import-card"><div><h3>Bring in your old spreadsheet entries</h3>
        <p class="muted small">One time only. Choose <b>seed.json</b> from the office-expenses → import folder on your Mac (116 entries from Oct–Nov). Entries already imported are skipped.</p></div>
        <label class="btn primary file-btn">${icon('up')}Choose seed.json<input type="file" accept=".json,application/json" data-act-file="import"></label></section>` : ''}
      ${periodBar()}
      <section class="kpis">
        ${kpi('Money given', money(sm.tot.received), `to staff, ${esc(r.label.toLowerCase() === 'all time' ? 'all time' : 'this period')}`)}
        ${kpi('Spent', money(sm.tot.spent), `${sm.tot.count} expenses · ${money(Math.round(sm.tot.spent / days / 100) * 100)}/day`)}
        ${kpi('Cash with staff', money(withStaff), withStaff < 0 ? 'Office owes staff' : `as of ${dShort(r.to < today() ? r.to : today())}`, withStaff < 0 ? 'neg' : '')}
        ${kpi('Petrol', money(sm.tot.petrol), sm.tot.spent ? `${Math.round((sm.tot.petrol / sm.tot.spent) * 100)}% of spending` : '—')}
      </section>

      <section class="people-cards">${ps.map((p) => {
        const o = sm.per[p.id];
        const bal = balanceOf(tx, p.id, r.to);
        const bw = balanceWords(bal, firstName(p.id));
        const last = counts.filter((c) => c.person === p.id).slice(-1)[0];
        return `<article class="glass person-card ${bw.tone}">
          <header><span class="avatar" style="--c:${personColor(p.id)}">${esc(p.name[0])}</span><div><h3>${esc(p.name)}</h3><small>${bw.text}</small></div></header>
          <p class="pc-bal">${money(bal)}</p>
          <dl><div><dt>Received</dt><dd>${money(o.received)}</dd></div><div><dt>Spent</dt><dd>${money(o.spent)}</dd></div><div><dt>${o.tin - o.tout ? 'Staff transfers' : 'Expenses'}</dt><dd>${o.tin - o.tout ? money(o.tin - o.tout, { sign: true }) : o.count}</dd></div></dl>
          ${last ? `<p class="pc-count ${Math.round(Number(last.counted) * 100) === Math.round(Number(last.expected) * 100) ? 'ok' : 'off'}">${icon(Math.round(Number(last.counted) * 100) === Math.round(Number(last.expected) * 100) ? 'check' : 'alert')}Last cash count ${dShort(last.date)}: ${money(paise(last.counted) - paise(last.expected), { sign: true })}</p>` : ''}
          <div class="pc-actions"><button class="btn small glass" data-act="add" data-type="received" data-person="${p.id}">${icon('plus')}Give money</button>
            <button class="btn small glass" data-act="count" data-person="${p.id}">${icon('cash')}Count cash</button></div>
        </article>`;
      }).join('')}</section>

      <div class="grid-charts">
        <section class="card glass"><header class="card-head"><h3>Where the money went</h3><small class="muted">${esc(r.label)}</small></header>
          <div class="donut-wrap"><div id="ch-donut"></div><ul class="legend" id="lg-donut"></ul></div></section>
        <section class="card glass"><header class="card-head"><h3>${S.period === 'week' ? 'Daily spending' : 'Weekly spending'}</h3>
          <ul class="legend inline">${ps.map((p) => `<li><i style="background:${personColor(p.id)}"></i>${esc(firstName(p.id))}</li>`).join('')}</ul></header>
          <div id="ch-cols" class="cols-wrap"></div></section>
      </div>

      <div class="grid-2">
        <section class="card glass"><header class="card-head"><h3>Cash or UPI</h3></header>
          <div id="ch-mode"></div>
          <ul class="legend inline">${[['Cash', 'var(--s1)'], ['UPI', 'var(--s3)'], ['', 'var(--s-other)']].filter(([k]) => sm.tot.byMode[k]).map(([k, c]) => `<li><i style="background:${c}"></i>${k || 'Not set'} <b>${money(sm.tot.byMode[k])}</b></li>`).join('')}</ul>
          <h3 class="mt">Biggest expenses</h3>
          <div class="list">${sm.rows.filter((t) => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5).map((t) => txRow(t, { showPerson: true })).join('') || '<p class="muted">No expenses in this period.</p>'}</div>
        </section>
        <section class="card glass"><header class="card-head"><h3>Needs your review</h3><span class="pill ${flagged.length ? 'warn' : ''}">${flagged.length}</span></header>
          ${flagged.length ? `<p class="muted small">Entries fixed or guessed while moving from the old spreadsheet. Tap one to check it, then “Mark as reviewed”.</p><div class="list">${flagged.slice(0, 8).map((t) => txRow(t, { showPerson: true })).join('')}</div>
            ${flagged.length > 8 ? `<button class="btn ghost wide" data-act="ledger-flagged">See all ${flagged.length}</button>` : ''}` : `<div class="empty small">${icon('check')}<p>Nothing to review.</p></div>`}
        </section>
      </div>`;
  }

  function drawDashboardCharts() {
    if (S.route !== 'dashboard' || !S.admin) return;
    const tx = adminTxns();
    const r = periodRange();
    const ps = people().filter((p) => p.active || tx.some((t) => t.person === p.id || t.to === p.id));
    const sm = summarize(tx, r.from, r.to, ps.map((p) => p.id));
    // donut: fixed category order, rest folded into Other
    const items = [];
    let other = 0; const otherNames = [];
    const order = Object.keys(CAT_SLOT);
    for (const k of order) if (sm.tot.byCat[k]) items.push({ key: k, label: catOf(k).name, value: sm.tot.byCat[k], color: catColor(k) });
    for (const [k, v] of Object.entries(sm.tot.byCat)) if (CAT_SLOT[k] == null) { other += v; otherNames.push(catOf(k).name); }
    if (other) items.push({ key: 'other', label: 'Other', value: other, color: OTHER, names: otherNames });
    const el = $('#ch-donut');
    if (el) {
      Charts.donut(el, items, { fmt: money, label: 'Spending by category', caption: 'spent' , center: short(sm.tot.spent) });
      const total = sm.tot.spent || 1;
      $('#lg-donut').innerHTML = items.length ? [...items].sort((a, b) => b.value - a.value).map((i) => `<li data-key="${i.key}"><i style="background:${i.color}"></i><span>${esc(i.label)}${i.names ? `<small>${esc(i.names.join(', '))}</small>` : ''}</span><b>${money(i.value)}</b><em>${Math.round((i.value / total) * 100)}%</em></li>`).join('') : '<li class="muted">No expenses in this period.</li>';
    }
    // columns: by day for a week, by week otherwise
    const groups = [];
    if (S.period === 'week') {
      for (let i = 0; i < 7; i++) {
        const d = addDays(r.from, i);
        groups.push({ label: DOW[parse(d).getDay()], sub: dShort(d), values: sm.tot.byDay[d] || {} });
      }
    } else {
      let ws = weekStart(r.from);
      while (ws <= r.to) {
        const vals = {};
        for (let i = 0; i < 7; i++) {
          const d = addDays(ws, i);
          if (d < r.from || d > r.to) continue;
          for (const [p, v] of Object.entries(sm.tot.byDay[d] || {})) vals[p] = (vals[p] || 0) + v;
        }
        groups.push({ label: dShort(ws < r.from ? r.from : ws), sub: weekLabel(ws), values: vals });
        ws = addDays(ws, 7);
      }
    }
    const series = ps.map((p) => ({ key: p.id, label: firstName(p.id), color: personColor(p.id) }));
    const ce = $('#ch-cols');
    if (ce) Charts.columns(ce, groups.slice(-26), series, { fmt: money, short, label: 'Spending over time', height: window.innerWidth >= 900 ? 340 : 220 });
    const me = $('#ch-mode');
    if (me) Charts.split(me, [{ key: 'Cash', label: 'Cash', value: sm.tot.byMode.Cash, color: 'var(--s1)' }, { key: 'UPI', label: 'UPI', value: sm.tot.byMode.UPI, color: 'var(--s3)' }, { key: '', label: 'Not set', value: sm.tot.byMode[''], color: 'var(--s-other)' }], { fmt: money, label: 'Cash vs UPI' });
  }

  /* ---- reports ---- */
  function reportRange() {
    const a = S.reportAnchor;
    if (S.reportMode === 'week') { const ws = weekStart(a); return { from: ws, to: addDays(ws, 6), label: weekLabel(ws), title: 'Weekly report' }; }
    return { from: monthStart(a), to: monthEnd(a), label: monthName(a), title: 'Monthly report' };
  }

  function viewReports() {
    if (!S.admin) return loadingView();
    const tx = adminTxns();
    const r = reportRange();
    const ps = people().filter((p) => p.active || tx.some((t) => (t.person === p.id || t.to === p.id) && t.date <= r.to));
    const pids = ps.map((p) => p.id);
    const sm = summarize(tx, r.from, r.to, pids);
    const catIds = [...new Set(sm.rows.filter((t) => t.type === 'expense').map((t) => t.category))].sort((a, b) => (sm.tot.byCat[b] || 0) - (sm.tot.byCat[a] || 0));
    const isFuture = r.to >= today();
    return `
      <header class="page-head"><div><p class="muted">Admin</p><h1>Reports</h1></div>
        <div class="head-actions no-print">
          <button class="btn glass small" data-act="share-report">${icon('share')}Share</button>
          <button class="btn glass small" data-act="csv-report">${icon('download')}CSV</button>
          <button class="btn glass small" data-act="print">${icon('print')}Print / PDF</button></div></header>
      <div class="period glass no-print">
        <div class="seg2 small">${[['week', 'Weekly'], ['month', 'Monthly']].map(([v, l]) => `<button class="${S.reportMode === v ? 'on' : ''}" data-act="report-mode" data-v="${v}">${l}</button>`).join('')}</div>
        <div class="stepper"><button class="icon-btn" data-act="report-step" data-d="-1" aria-label="Previous">${icon('left')}</button>
          <span class="period-label">${esc(r.label)}</span>
          <button class="icon-btn" data-act="report-step" data-d="1" aria-label="Next" ${isFuture ? 'disabled' : ''}>${icon('right')}</button></div>
      </div>
      <article class="report glass">
        <header class="report-head">${logoFull('report')}<div><h2>${r.title}</h2><p>${dLong(r.from)} to ${dLong(r.to)}${isFuture ? ' · in progress' : ''}</p></div></header>
        <section class="report-kpis">
          <div><span>Opening balance</span><b>${money(sm.tot.opening)}</b></div>
          <div><span>Money given</span><b>${money(sm.tot.received)}</b></div>
          <div><span>Spent</span><b>${money(sm.tot.spent)}</b></div>
          <div><span>Closing balance</span><b>${money(sm.tot.closing)}</b></div>
        </section>
        <h3>Cash reconciliation by person</h3>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Person</th><th>Opening</th><th>Given</th><th>Transfers</th><th>Spent</th><th>Closing</th></tr></thead>
          <tbody>${ps.map((p) => { const o = sm.per[p.id]; return `<tr><th>${esc(p.name)}</th><td>${money(o.opening)}</td><td>${money(o.received)}</td><td>${o.tin - o.tout ? money(o.tin - o.tout, { sign: true }) : '—'}</td><td>${money(o.spent)}</td><td class="${o.closing < 0 ? 'neg' : ''}"><b>${money(o.closing)}</b></td></tr>`; }).join('')}</tbody>
          <tfoot><tr><th>Total</th><td>${money(sm.tot.opening)}</td><td>${money(sm.tot.received)}</td><td>—</td><td>${money(sm.tot.spent)}</td><td><b>${money(sm.tot.closing)}</b></td></tr></tfoot>
        </table></div>
        <p class="muted small">Closing = opening + given + transfers in − transfers out − spent. A negative closing means the office owes that person.</p>

        <h3>Spending by category</h3>
        ${catIds.length ? `<div class="table-wrap"><table class="tbl">
          <thead><tr><th>Category</th>${ps.map((p) => `<th>${esc(firstName(p.id))}</th>`).join('')}<th>Total</th><th>Share</th></tr></thead>
          <tbody>${catIds.map((c) => `<tr><th><span class="dot" style="background:${catColor(c)}"></span>${esc(catOf(c).name)}</th>${ps.map((p) => `<td>${sm.per[p.id].byCat[c] ? money(sm.per[p.id].byCat[c]) : '—'}</td>`).join('')}<td><b>${money(sm.tot.byCat[c])}</b></td><td>${Math.round((sm.tot.byCat[c] / (sm.tot.spent || 1)) * 100)}%</td></tr>`).join('')}</tbody>
          <tfoot><tr><th>Total</th>${ps.map((p) => `<td>${money(sm.per[p.id].spent)}</td>`).join('')}<td><b>${money(sm.tot.spent)}</b></td><td>100%</td></tr></tfoot>
        </table></div>` : '<p class="muted">No expenses in this period.</p>'}

        ${S.reportMode === 'month' ? weekTable(sm, r, ps) : dayTable(sm, r, ps)}

        <h3>All entries</h3>
        <div class="table-wrap"><table class="tbl entries">
          <thead><tr><th>Date</th><th>Person</th><th>Type</th><th>Category</th><th>Note</th><th>Mode</th><th class="num">Amount</th></tr></thead>
          <tbody>${[...sm.rows].sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt))).map((t) => `<tr${t.flag ? ' class="flagged"' : ''}><td>${dShort(t.date)}</td><td>${esc(firstName(t.person))}${t.type === 'transfer' ? ' → ' + esc(firstName(t.to)) : ''}</td><td>${t.type === 'expense' ? 'Expense' : t.type === 'received' ? 'Given' : 'Transfer'}</td><td>${t.type === 'expense' ? esc(catOf(t.category).name) : '—'}</td><td>${esc(t.note)}</td><td>${esc(t.mode || '—')}</td><td class="num">${money(paise(t.amount))}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No entries.</td></tr>'}</tbody>
        </table></div>
        <p class="muted small print-only">Generated ${new Date().toLocaleString('en-IN')} · Sunpour Expenses</p>
      </article>`;
  }
  function dayTable(sm, r, ps) {
    const rows = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(r.from, i), v = sm.tot.byDay[d] || {};
      rows.push(`<tr><th>${DOW[parse(d).getDay()]} ${dShort(d)}</th>${ps.map((p) => `<td>${v[p.id] ? money(v[p.id]) : '—'}</td>`).join('')}<td><b>${money(Object.values(v).reduce((a, b) => a + b, 0))}</b></td></tr>`);
    }
    return `<h3>Day by day</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Day</th>${ps.map((p) => `<th>${esc(firstName(p.id))}</th>`).join('')}<th>Total</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  function weekTable(sm, r, ps) {
    const rows = [];
    let ws = weekStart(r.from);
    while (ws <= r.to) {
      const v = {}; let pet = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(ws, i);
        if (d < r.from || d > r.to) continue;
        for (const [p, a] of Object.entries(sm.tot.byDay[d] || {})) v[p] = (v[p] || 0) + a;
      }
      for (const t of sm.rows) if (t.type === 'expense' && t.category === 'petrol' && t.date >= ws && t.date <= addDays(ws, 6)) pet += paise(t.amount);
      const given = sm.rows.filter((t) => t.type === 'received' && t.date >= ws && t.date <= addDays(ws, 6)).reduce((s, t) => s + paise(t.amount), 0);
      const from = ws < r.from ? r.from : ws, to = addDays(ws, 6) > r.to ? r.to : addDays(ws, 6);
      rows.push(`<tr><th>${dShort(from)} – ${dShort(to)}</th>${ps.map((p) => `<td>${v[p.id] ? money(v[p.id]) : '—'}</td>`).join('')}<td><b>${money(Object.values(v).reduce((a, b) => a + b, 0))}</b></td><td>${pet ? money(pet) : '—'}</td><td>${given ? money(given) : '—'}</td></tr>`);
      ws = addDays(ws, 7);
    }
    return `<h3>Week by week</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Week (Mon–Sun)</th>${ps.map((p) => `<th>${esc(firstName(p.id))}</th>`).join('')}<th>Spent</th><th>Petrol</th><th>Given</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }

  /* ---- ledger ---- */
  function ledgerRows() {
    const f = S.ledgerFilter;
    const q = f.q.trim().toLowerCase();
    return adminTxns(f.deleted).filter((t) =>
      (!f.person || t.person === f.person || t.to === f.person) &&
      (!f.type || t.type === f.type) &&
      (!f.category || t.category === f.category) &&
      (!f.flagged || t.flag) &&
      (!f.deleted || t.deleted) &&
      (!q || [t.note, catOf(t.category).name, personName(t.person), String(t.amount)].join(' ').toLowerCase().includes(q)));
  }
  function viewLedger() {
    if (!S.admin) return loadingView();
    const f = S.ledgerFilter;
    const rows = ledgerRows();
    const spent = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + paise(t.amount), 0);
    const given = rows.filter((t) => t.type === 'received').reduce((s, t) => s + paise(t.amount), 0);
    return `<header class="page-head"><div><p class="muted">Admin</p><h1>All entries</h1></div>
        <div class="head-actions"><button class="btn glass small" data-act="csv-ledger">${icon('download')}CSV</button>
        <button class="btn primary small" data-act="add" data-type="expense">${icon('plus')}Add</button></div></header>
      <div class="filters glass">
        <label class="search">${icon('search')}<input type="search" placeholder="Search notes, amounts…" value="${esc(f.q)}" data-filter="q"></label>
        <select data-filter="person" aria-label="Person"><option value="">Everyone</option>${people().map((p) => `<option value="${p.id}" ${f.person === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <select data-filter="type" aria-label="Type"><option value="">All types</option><option value="expense" ${f.type === 'expense' ? 'selected' : ''}>Expenses</option><option value="received" ${f.type === 'received' ? 'selected' : ''}>Money given</option><option value="transfer" ${f.type === 'transfer' ? 'selected' : ''}>Transfers</option></select>
        <select data-filter="category" aria-label="Category"><option value="">All categories</option>${cats().map((c) => `<option value="${c.id}" ${f.category === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <label class="toggle"><input type="checkbox" data-filter="flagged" ${f.flagged ? 'checked' : ''}><span>Needs review</span></label>
        <label class="toggle"><input type="checkbox" data-filter="deleted" ${f.deleted ? 'checked' : ''}><span>Deleted</span></label>
      </div>
      <p class="muted small ledger-sum">${rows.length} entries · spent ${money(spent)} · given ${money(given)}</p>
      ${groupedList(rows, { showPerson: true, empty: 'No entries match these filters.' })}`;
  }

  /* ---- settings ---- */
  function viewSettings() {
    if (!S.admin) return loadingView();
    const audit = [...(S.admin.audit || [])].reverse().slice(0, 40);
    return `<header class="page-head"><div><p class="muted">Admin</p><h1>Settings</h1></div></header>
      <div class="grid-2">
        <section class="card glass"><header class="card-head"><h3>Staff</h3><button class="btn small glass" data-act="add-person">${icon('plus')}Add</button></header>
          <div class="list">${people().map((p) => `<div class="set-row"><span class="avatar sm" style="--c:${personColor(p.id)}">${esc(p.name[0])}</span><span class="grow">${esc(p.name)}${p.active ? '' : ' <span class="pill">Hidden</span>'}</span>
            <button class="btn small ghost" data-act="edit-person" data-id="${p.id}">Edit</button></div>`).join('')}</div>
          <p class="muted small">Hidden staff can’t add entries, but their history stays in reports.</p></section>
        <section class="card glass"><header class="card-head"><h3>Categories</h3><button class="btn small glass" data-act="add-cat">${icon('plus')}Add</button></header>
          <div class="list cats-list">${cats().map((c) => `<div class="set-row"><span class="cat-ic sm" style="--c:${catColor(c.id)}">${icon(c.icon)}</span><span class="grow">${esc(c.name)}${c.active ? '' : ' <span class="pill">Hidden</span>'}</span>
            <button class="btn small ghost" data-act="edit-cat" data-id="${c.id}">Edit</button></div>`).join('')}</div></section>
      </div>
      <div class="grid-2">
        <section class="card glass"><h3>Appearance</h3>${themeSeg()}<p class="muted small">Auto follows this device’s light or dark setting. Saved on this device only.</p>
          <h3 class="mt">Security</h3>
          <button class="btn glass wide" data-act="change-pin">${icon('lock')}Change admin PIN</button>
          <button class="btn glass wide" data-act="logout">${icon('logout')}Lock admin on this device</button>
          <button class="btn glass wide" data-act="switch-user">${icon('user')}Use this device as staff</button>
          <h3 class="mt">Data</h3>
          <button class="btn glass wide" data-act="csv-all">${icon('download')}Download everything (CSV)</button>
          <label class="btn glass wide file-btn">${icon('up')}Import old spreadsheet entries<input type="file" accept=".json,application/json" data-act-file="import"></label>
          <p class="muted small">One time only: choose <b>seed.json</b> from the office-expenses/import folder on your Mac. Entries already imported are skipped.</p>
          <p class="muted small">Every entry is also saved in your Google Sheet${CONFIG.SHEET_URL ? ` — <a href="${esc(CONFIG.SHEET_URL)}" target="_blank" rel="noopener">open it</a>` : ''}.</p>
          <p class="muted small">App ${esc(CONFIG.VERSION || '')}${CONFIG.API_URL ? '' : ' · demo mode (data stays on this device)'}</p></section>
        <section class="card glass"><h3>Change log</h3>
          <div class="audit">${audit.map((a) => `<div class="audit-row"><span class="muted">${esc(new Date(a.time).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span><b>${esc(a.who === 'admin' ? 'Admin' : a.who ? firstName(a.who) : '')}</b> ${esc(a.action)}<small>${esc(String(a.details).slice(0, 120))}</small></div>`).join('') || '<p class="muted">No changes yet.</p>'}</div></section>
      </div>`;
  }

  function loadingView() {
    return `<div class="empty">${icon('sync', 'spin')}<p>${S.lastError ? esc(S.lastError) : tr('Loading…')}</p>${S.lastError ? `<button class="btn glass" data-act="retry">${tr('Try again')}</button>` : ''}</div>`;
  }

  /* Sunpour logo: the official navy artwork (brand/), never redrawn or recoloured.
     On dark surfaces it sits on a small light plate. */
  const logoFull = (cls = '') => `<span class="logo-full ${cls}"><img src="brand/sunpour-logo.png" alt="Sunpour" width="1200" height="317"></span>`;

  /* theme: system (follows the phone), light or dark; remembered on this device */
  const THEMES = [['system', 'Auto', 'monitor'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']];
  function applyTheme() {
    const t = S.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    $$('meta[name=theme-color]').forEach((m) => { m.removeAttribute('media'); m.content = dark ? '#141415' : '#f5f6f8'; });
  }
  function setTheme(t) { S.theme = t; store.set('theme', t); applyTheme(); render(); }
  const themeIcon = () => (THEMES.find((x) => x[0] === S.theme) || THEMES[0])[2];
  const themeButton = () => { const n = tr((THEMES.find((x) => x[0] === S.theme) || THEMES[0])[1]); return `<button class="icon-btn glass" data-act="theme-cycle" aria-label="${tr('Theme: {name}', { name: n })}" title="${tr('Theme: {name}', { name: n })}">${icon(themeIcon())}</button>`; };
  /* language switch: per staff profile (or per device on the start screen) */
  const langKey = () => (isStaff(S.me) ? 'lang.' + S.me : 'lang.device');
  function setLang(l) { store.set(langKey(), l); document.documentElement.lang = l === 'hi' ? 'hi' : 'en'; render(); toast(l === 'hi' ? 'भाषा: हिन्दी' : 'Language: English'); }
  const langButton = () => `<button class="icon-btn glass lang-btn" data-act="lang-toggle" aria-label="${lang() === 'hi' ? 'Switch to English' : 'हिन्दी में देखें'}" title="${lang() === 'hi' ? 'Switch to English' : 'हिन्दी में देखें'}">${lang() === 'hi' ? 'EN' : 'हि'}</button>`;
  const langSeg = () => `<div class="seg2 small lang-seg" role="radiogroup" aria-label="Language"><button class="${lang() === 'en' ? 'on' : ''}" data-act="lang-set" data-v="en" role="radio" aria-checked="${lang() === 'en'}">English</button><button class="${lang() === 'hi' ? 'on' : ''}" data-act="lang-set" data-v="hi" role="radio" aria-checked="${lang() === 'hi'}">हिन्दी</button></div>`;
  /* refresh: pull everyone's latest entries now */
  const refreshButton = () => `<button class="icon-btn glass" data-act="refresh" aria-label="${tr('Refresh')}" title="${tr('Refresh')}">${icon('sync', S.refreshing ? 'spin' : '')}</button>`;
  async function doRefresh({ quiet = false } = {}) {
    if (S.refreshing || !S.me) return;
    S.refreshing = true; if (!quiet) render();
    try { await flush(); await refreshData(); S.lastError = ''; if (!quiet) toast(tr('Up to date')); }
    catch (e) { if (!quiet) toast(navigator.onLine ? e.message : tr('Couldn’t refresh. Check the internet.'), 'warn'); }
    finally { S.refreshing = false; if (!busy()) render(); }
  }
  /** don't redraw under someone's fingers: open form, focused input */
  const busy = () => !$('#sheet').hidden || (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName));
  const themeSeg = () => `<div class="seg3 small theme-seg" role="radiogroup" aria-label="Theme">${THEMES.map(([v, l, i]) => `<button class="${S.theme === v ? 'on' : ''}" data-act="theme-set" data-v="${v}" role="radio" aria-checked="${S.theme === v}">${icon(i)}${tr(l)}</button>`).join('')}</div>`;

  /* ======================= small admin sheets ======================= */
  function countSheet(pid) {
    const tx = adminTxns();
    const expected = balanceOf(tx, pid, today());
    openSheet(`<form class="entry"><div class="sheet-head"><button type="button" class="link" data-act="close-sheet">Cancel</button><h2>Count cash</h2><span></span></div>
      <p class="muted">Count the cash ${esc(firstName(pid))} has right now and enter it. Include only office cash.</p>
      <div class="kv"><span>The app expects</span><b>${money(expected)}</b></div>
      <div class="amount-wrap"><span class="cur">₹</span><input class="amount" name="counted" inputmode="decimal" placeholder="0" aria-label="Counted cash"></div>
      <div class="kv diff"><span>Difference</span><b data-diff>—</b></div>
      <div class="field"><label for="cnote">Note <span class="opt">optional</span></label><input id="cnote" class="input" maxlength="200"></div>
      <p class="form-error"></p>
      <button class="btn primary big" type="submit">Save count</button></form>`, {
      onOpen(root) {
        const inp = $('.amount', root);
        setTimeout(() => inp.focus(), 300);
        inp.addEventListener('input', () => {
          inp.value = inp.value.replace(/[^\d.]/g, '');
          fitAmount(inp);
          const d = paise(inp.value) - expected;
          const el = $('[data-diff]', root);
          el.textContent = inp.value === '' ? '—' : d === 0 ? 'Matches exactly' : `${money(d, { sign: true })} ${d > 0 ? 'extra' : 'short'}`;
          el.className = d === 0 ? 'pos' : 'neg';
        });
        $('form', root).addEventListener('submit', async (e) => {
          e.preventDefault();
          if (inp.value === '') { $('.form-error', root).textContent = 'Enter the counted amount.'; return; }
          try {
            const r = await api('saveCount', { count: { id: uid(), date: today(), person: pid, counted: Number(inp.value), expected: expected / 100, note: $('#cnote', root).value } });
            S.admin.counts = r.counts;
            closeSheet(); toast('Cash count saved'); render();
          } catch (err) { $('.form-error', root).textContent = err.message; }
        });
      },
    });
  }

  function personSheet(id) {
    const p = people().find((x) => x.id === id) || { name: '', active: true };
    openSheet(`<form class="entry"><div class="sheet-head"><button type="button" class="link" data-act="close-sheet">Cancel</button><h2>${id ? 'Edit staff' : 'Add staff'}</h2><span></span></div>
      <div class="field"><label for="pname">Full name</label><input id="pname" class="input" value="${esc(p.name)}" maxlength="60" required></div>
      <div class="field"><label for="pjoin">Joining date <span class="opt">optional, used for the first month's salary</span></label><input id="pjoin" class="input" type="date" value="${esc(p.joinDate || '')}"></div>
      ${id ? `<label class="toggle big"><input type="checkbox" id="pactive" ${p.active ? 'checked' : ''}><span>Active (can add entries and mark attendance)</span></label>` : ''}
      <p class="form-error"></p><button class="btn primary big" type="submit">Save</button></form>`, {
      onOpen(root) {
        $('form', root).addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const r = await api('savePerson', { person: { id, name: $('#pname', root).value, joinDate: $('#pjoin', root).value, active: id ? $('#pactive', root).checked : true } });
            S.admin.people = r.people; S.config.people = r.people; store.set('config', S.config);
            closeSheet(); toast('Saved'); render();
          } catch (err) { $('.form-error', root).textContent = err.message; }
        });
      },
    });
  }

  function catSheet(id) {
    const c = cats().find((x) => x.id === id) || { name: '', icon: 'dots', active: true };
    const choices = ['fuel', 'cup', 'milk', 'drop', 'basket', 'meal', 'box', 'wrench', 'pen', 'car', 'bolt', 'sun', 'parcel', 'dots', 'wallet', 'report'];
    let chosen = c.icon;
    openSheet(`<form class="entry"><div class="sheet-head"><button type="button" class="link" data-act="close-sheet">Cancel</button><h2>${id ? 'Edit category' : 'Add category'}</h2><span></span></div>
      <div class="field"><label for="cname">Name</label><input id="cname" class="input" value="${esc(c.name)}" maxlength="40" required></div>
      <div class="field"><label>Icon</label><div class="icon-pick">${choices.map((n) => `<button type="button" class="${n === chosen ? 'on' : ''}" data-icon="${n}" aria-label="${n}">${icon(n)}</button>`).join('')}</div></div>
      ${id ? `<label class="toggle big"><input type="checkbox" id="cactive" ${c.active ? 'checked' : ''}><span>Show in the entry form</span></label>` : ''}
      <p class="form-error"></p><button class="btn primary big" type="submit">Save</button>
      ${id ? `<button type="button" class="btn danger-ghost" data-act="del-cat" data-id="${esc(id)}">${icon('trash')}Delete category</button>` : ''}</form>`, {
      onOpen(root) {
        $('.icon-pick', root).addEventListener('click', (e) => {
          const b = e.target.closest('[data-icon]'); if (!b) return;
          chosen = b.dataset.icon; $$('.icon-pick button', root).forEach((x) => x.classList.toggle('on', x === b));
        });
        $('form', root).addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const r = await api('saveCategory', { category: { id, name: $('#cname', root).value, icon: chosen, active: id ? $('#cactive', root).checked : true, order: c.order } });
            S.admin.categories = r.categories; S.config.categories = r.categories; store.set('config', S.config);
            closeSheet(); toast('Saved'); render();
          } catch (err) { $('.form-error', root).textContent = err.message; }
        });
      },
    });
  }

  function pinSheet() {
    openSheet(`<form class="entry"><div class="sheet-head"><button type="button" class="link" data-act="close-sheet">Cancel</button><h2>Change PIN</h2><span></span></div>
      <input class="pin" id="np1" type="password" inputmode="numeric" maxlength="8" placeholder="New PIN" autocomplete="new-password">
      <input class="pin" id="np2" type="password" inputmode="numeric" maxlength="8" placeholder="Repeat new PIN" autocomplete="new-password">
      <p class="form-error"></p><button class="btn primary big" type="submit">Change PIN</button></form>`, {
      onOpen(root) {
        $('form', root).addEventListener('submit', async (e) => {
          e.preventDefault();
          const a = $('#np1', root).value, b = $('#np2', root).value;
          if (!/^\d{4,8}$/.test(a)) return ($('.form-error', root).textContent = 'Use 4 to 8 digits.');
          if (a !== b) return ($('.form-error', root).textContent = 'The PINs don’t match.');
          try { const r = await api('setPin', { pin: a }); S.token = r.token; store.set('token', S.token); closeSheet(); toast('PIN changed. Other devices need the new PIN.'); }
          catch (err) { $('.form-error', root).textContent = err.message; }
        });
      },
    });
  }

  /* ======================= CSV & sharing ======================= */
  function csv(rows) {
    const head = ['Date', 'Person', 'Type', 'Category', 'Amount (₹)', 'Mode', 'To', 'Note', 'Entered by', 'Review note'];
    const lines = [head, ...rows.sort((a, b) => a.date.localeCompare(b.date)).map((t) => [t.date, personName(t.person), t.type === 'expense' ? 'Expense' : t.type === 'received' ? 'Money given' : 'Transfer', t.type === 'expense' ? catOf(t.category).name : '', (paise(t.amount) / 100).toFixed(2), t.mode, t.to ? personName(t.to) : '', t.note, t.by === 'admin' ? 'Admin' : t.by === 'import' ? 'Old sheet' : personName(t.by), t.flag])];
    return '﻿' + lines.map((l) => l.map((v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function reportText() {
    const r = reportRange();
    const tx = adminTxns();
    const ps = people().filter((p) => p.active);
    const sm = summarize(tx, r.from, r.to, ps.map((p) => p.id));
    const cat = Object.entries(sm.tot.byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `• ${catOf(k).name}: ${money(v)}`).join('\n');
    return `*Sunpour ${r.title.toLowerCase()}*\n${r.label}\n\nGiven: ${money(sm.tot.received)}\nSpent: ${money(sm.tot.spent)}\nPetrol: ${money(sm.tot.petrol)}\n\n${ps.map((p) => `${p.name}: spent ${money(sm.per[p.id].spent)}, balance ${money(sm.per[p.id].closing)}`).join('\n')}\n\n${cat}`;
  }

  /* ======================= attendance & HR ======================= */
  const role = () => (S.token ? S.token.split('.')[0] : null); // 'admin' | 'hr'
  const sToday = () => S.serverToday || today();
  const monthOf = (d) => d.slice(0, 7);
  const addMonthStr = (m, n) => addMonths(m + '-01', n).slice(0, 7);
  const monthLabel = (m) => monthName(m + '-01');
  const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
  const whoLabel = (by) => (by === 'admin' ? 'Admin' : by === 'hr' ? 'HR' : by ? firstName(by) : '');
  const canSeeSalary = () => role() === 'admin' || !!(S.hr && S.hr.canSalary);

  async function loadAtt(month) {
    const m = month || monthOf(sToday());
    const r = await api('attendance', { month: m });
    S.serverToday = r.today;
    if (r.month === monthOf(r.today)) { S.attNow = r; store.set('attNow', r); }
    if (!month || month === S.attMonth) S.att = r;
    if (r.people && S.config) { S.config.people = r.people; store.set('config', S.config); }
  }
  async function loadHR() {
    const m = S.hrMonth || monthOf(sToday());
    S.hrLoading = true;
    try {
      const r = await api('hrData', { from: m + '-01', to: m + '-31' });
      S.serverToday = r.today;
      S.hr = { ...r, month: m };
      if (S.config) { S.config.people = r.people; store.set('config', S.config); }
      S.lastError = '';
    } finally { S.hrLoading = false; }
  }
  async function reloadAttendance() {
    if (S.me === 'admin' || S.me === 'hr') await loadHR(); else { await loadAtt(); if (S.attMonth && S.attMonth !== monthOf(sToday())) await loadAtt(S.attMonth); }
  }

  async function markAtt(person, status) {
    const name = person === S.me ? tr('yourself') : firstName(person);
    const now = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    if (!confirm(tr('Mark {name} {status} for today ({date}, {time})?\n\nAfter this, only HR or the admin can change it.', { name, status: status === 'half' ? tr('HALF DAY') : tr('present'), date: dShort(sToday()), time: now }))) return;
    try {
      await api('markAttendance', { person, status });
      const st = status === 'half' ? tr('half day') : tr('present');
      toast(person === S.me ? tr('You are marked {status}', { status: st }) : tr('{name} is marked {status}', { name: firstName(person), status: st }));
    } catch (e) { toast(e.message, 'warn'); }
    await reloadAttendance().catch(() => {});
    render();
  }
  async function makeHalf(id) {
    if (!confirm(tr('Change today’s entry to a half day?\n\nYou can’t change it back yourself. Only HR or the admin can.'))) return;
    try { await api('makeHalfDay', { id }); toast(tr('Changed to half day')); } catch (e) { toast(e.message, 'warn'); }
    await reloadAttendance().catch(() => {});
    render();
  }

  /* ---- staff: attendance card on the home screen ---- */
  function attendanceCard() {
    const a = S.attNow;
    const td = sToday();
    if (!a) return `<section class="card glass att-card"><header class="card-head"><h3>${tr('Attendance')}</h3></header><p class="muted small">${S.online ? tr('Loading…') : tr('Needs internet to mark attendance.')}</p></section>`;
    const todays = a.attendance.filter((x) => x.date === td);
    const ps = people().filter((p) => p.active);
    const me = todays.find((x) => x.person === S.me);
    const row = (p) => {
      const e = todays.find((x) => x.person === p.id);
      const isMe = p.id === S.me;
      const state = e ? `<span class="att-state ${e.status}">${icon(e.status === 'half' ? 'halfday' : 'check')}${e.status === 'half' ? tr('Half day') : tr('Present')} · ${timeOf(e.time) || whoLabel(e.editedBy)}</span>${e.by !== p.id && e.by ? `<small class="muted">${tr('marked by {name}', { name: esc(whoLabel(e.by)) })}</small>` : ''}` : `<span class="att-state none">${tr('Not marked yet')}</span>`;
      let actions = '';
      if (!e) actions = `<button class="btn small ${isMe ? 'primary' : 'glass'}" data-act="att-mark" data-person="${p.id}" data-status="present">${tr('Present')}</button><button class="btn small glass" data-act="att-mark" data-person="${p.id}" data-status="half">${tr('Half day')}</button>`;
      else if (e.status === 'present' && (isMe || e.by === S.me)) actions = `<button class="btn small ghost" data-act="att-half" data-id="${esc(e.id)}">${tr('Make half day')}</button>`;
      return `<div class="att-row${isMe ? ' me' : ''}"><span class="avatar sm" style="--c:${personColor(p.id)}">${esc(p.name[0])}</span>
        <div class="grow"><b>${isMe ? tr('You') : esc(p.name)}</b><div>${state}</div></div><div class="att-actions">${actions}</div></div>`;
    };
    const order = [...ps.filter((p) => p.id === S.me), ...ps.filter((p) => p.id !== S.me)];
    return `<section class="card glass att-card ${me ? 'done' : 'todo'}">
      <header class="card-head"><h3>${tr('Attendance')}</h3>${me ? '' : `<small class="muted">${tr('Not marked yet')}</small>`}</header>
      ${(a.holidays || []).find((h) => h.date === td) ? `<p class="hol-banner">${icon('star')}<span>${tr('Today is a holiday: {name}. It won’t count as leave.', { name: `<b>${esc(a.holidays.find((h) => h.date === td).name)}</b>` })}</span></p>` : ''}
      <div class="att-list">${order.map(row).join('')}</div>
      <p class="muted small">${tr('Time is recorded automatically. Once marked, only HR or the admin can change it.')}</p>
      <button class="btn ghost wide" data-go="attendance">${icon('calendar')}${tr('Attendance sheet')}</button>
    </section>`;
  }

  /* ---- month grid ---- */
  function attGrid(month, ps, list, { editable, start, holidays = [] }) {
    const D = Payroll.daysIn(month);
    const td = sToday();
    const hol = {};
    holidays.forEach((h) => { hol[h.date] = h; });
    const map = {};
    list.filter((a) => !a.deleted).forEach((a) => { map[a.person + '|' + a.date] = a; });
    const head = [];
    for (let d = 1; d <= D; d++) {
      const ds = `${month}-${pad(d)}`, dow = parse(ds).getDay();
      head.push(`<th class="${dow === 0 ? 'sun' : ''}${ds === td ? ' today' : ''}${hol[ds] ? ' hol' : ''}"${hol[ds] ? ` title="${esc(hol[ds].name)}"` : ''}><span>${'SMTWTFS'[dow]}</span>${d}</th>`);
    }
    const rows = ps.map((p) => {
      let P = 0, H = 0, elapsed = 0, HOL = 0;
      const cells = [];
      for (let d = 1; d <= D; d++) {
        const ds = `${month}-${pad(d)}`;
        const a = map[p.id + '|' + ds];
        let cls = 'off', txt = '';
        if ((p.joinDate && ds < p.joinDate) || (start && ds < start)) { cls = 'na'; }
        else if (ds > td) { cls = 'future'; }
        else {
          if (ds < td || a) elapsed++;
          if (a) { cls = a.status === 'half' ? 'h' : 'p'; txt = a.status === 'half' ? '½' : '✓'; if (a.status === 'half') H++; else P++; }
          else if (hol[ds]) { cls = 'hol'; txt = '★'; if (ds < td || a) HOL++; }
          else if (ds === td) { cls = 'pending'; }
          else txt = '–';
        }
        const tip = a ? `${a.status === 'half' ? tr('Half day') : tr('Present')}${a.time ? ' · ' + timeOf(a.time) : ''}${hol[ds] ? ' · worked on ' + hol[ds].name : ''}` : cls === 'hol' ? `${tr('Holiday')}: ${hol[ds].name}` : cls === 'off' ? tr('Leave') : '';
        cells.push(`<td><button class="cell ${cls}${a && a.editedBy ? ' edited' : ''}" ${cls === 'future' || cls === 'na' ? 'disabled' : ''} data-act="att-cell" data-person="${p.id}" data-date="${ds}" title="${esc(tip)}" aria-label="${esc(p.name)} ${dShort(ds)} ${esc(tip || 'not marked')}">${txt}</button></td>`);
      }
      const leaves = Math.max(0, elapsed - HOL - P - H / 2);
      return `<tr><th class="name"><span class="dot" style="background:${personColor(p.id)}"></span>${esc(firstName(p.id))}</th>${cells.join('')}<td class="tot">${P}</td><td class="tot">${H}</td><td class="tot">${leaves}</td></tr>`;
    }).join('');
    return `<div class="att-grid-wrap"><table class="att-grid${editable ? ' editable' : ''}"><thead><tr><th class="name">${tr('Name')}</th>${head.join('')}<th class="tot">P</th><th class="tot">½</th><th class="tot">${tr('Off')}</th></tr></thead><tbody>${rows}</tbody></table></div>
      <ul class="legend inline att-legend"><li><i class="lg p"></i>${tr('Present')}</li><li><i class="lg h"></i>${tr('Half day')}</li><li><i class="lg off"></i>${tr('Leave (no entry)')}</li><li><i class="lg hol"></i>${tr('Holiday')}</li><li><i class="lg edited"></i>${tr('Changed by HR/admin')}</li></ul>${start && start > `${month}-01` && start <= `${month}-${pad(D)}` ? `<p class="muted small">${tr('Attendance is counted from {date}. Earlier days don’t count as leave.', { date: dShort(start) })}</p>` : ''}`;
  }

  function monthStepper(act, m, label) {
    const cur = monthOf(sToday());
    return `<div class="stepper"><button class="icon-btn" data-act="${act}" data-d="-1" aria-label="Previous month">${icon('left')}</button>
      <span class="period-label">${esc(label || monthLabel(m))}</span>
      <button class="icon-btn" data-act="${act}" data-d="1" aria-label="Next month" ${m >= cur ? 'disabled' : ''}>${icon('right')}</button></div>`;
  }

  /* ---- staff: attendance sheet ---- */
  function viewAttendance() {
    const m = S.attMonth || monthOf(sToday());
    const a = S.att && S.att.month === m ? S.att : m === monthOf(sToday()) ? S.attNow : null;
    if (!a) { if (!S.attLoading) { S.attLoading = true; loadAtt(m).then(render).catch((e) => { S.lastError = e.message; render(); }).finally(() => { S.attLoading = false; }); } return `<header class="page-head"><h1>${tr('Attendance')}</h1></header>` + loadingView(); }
    const ps = people().filter((p) => p.active || a.attendance.some((x) => x.person === p.id));
    const mine = a.attendance.filter((x) => x.person === S.me);
    const P = mine.filter((x) => x.status !== 'half').length, H = mine.filter((x) => x.status === 'half').length;
    const recent = [...a.attendance].sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time)).slice(0, 12);
    return `<header class="page-head"><div><p class="muted">${tr('Everyone')}</p><h1>${tr('Attendance')}</h1></div><div class="head-actions">${refreshButton()}</div></header>
      <div class="period glass"><span class="muted small">${lang() === 'hi' ? tr('Your month: {p} present · {h} half days', { p: `<b>${P}</b>`, h: `<b>${H}</b>` }) : `Your month: <b>${P}</b> present · <b>${H}</b> half day${H === 1 ? '' : 's'}`}</span>${monthStepper('att-month', m)}</div>
      <section class="card glass">${attGrid(m, ps, a.attendance, { editable: false, start: a.attStart, holidays: a.holidays || [] })}</section>
      ${(a.holidays || []).length ? `<section class="card glass"><h3>${tr('Holidays this month')}</h3><div class="list">${a.holidays.slice().sort((x, y) => x.date.localeCompare(y.date)).map(holLine).join('')}</div></section>` : ''}
      <section class="card glass"><h3>${tr('Latest entries')}</h3><div class="list">${recent.map(attLine).join('') || `<p class="muted">${tr('No entries this month yet.')}</p>`}</div>
        <p class="muted small">${tr('Entries can’t be edited here. Ask HR or the admin to correct a mistake.')}</p></section>`;
  }
  function attLine(a) {
    return `<div class="att-line"><span class="att-state ${a.status}">${icon(a.status === 'half' ? 'halfday' : 'check')}</span>
      <span class="grow"><b>${esc(personName(a.person))}</b><small class="muted">${dShort(a.date)}${a.time ? ' · ' + timeOf(a.time) : ''}${a.by && a.by !== a.person ? ' · ' + tr('marked by {name}', { name: esc(whoLabel(a.by)) }) : ''}${a.editedBy ? ' · ' + tr('changed by {name}', { name: esc(whoLabel(a.editedBy)) }) : ''}${a.note ? ' · ' + esc(a.note) : ''}</small></span>
      <span class="muted small">${a.status === 'half' ? tr('Half day') : tr('Present')}</span></div>`;
  }

  function attCellSheet(person, date) {
    const editable = S.me === 'admin' || S.me === 'hr';
    const list = editable ? (S.hr ? S.hr.attendance : []) : (S.att && S.att.month === monthOf(date) ? S.att.attendance : S.attNow ? S.attNow.attendance : []);
    const a = list.find((x) => x.person === person && x.date === date && !x.deleted);
    const info = a ? `<div class="kv"><span>${a.status === 'half' ? tr('Half day') : tr('Present')}</span><b>${a.time ? timeOf(a.time) : '—'}</b></div>
      <p class="muted small">${a.by ? tr('Marked by {name}', { name: esc(whoLabel(a.by)) }) : ''}${a.editedBy ? ` · changed by ${esc(whoLabel(a.editedBy))}${a.editedAt ? ' on ' + dShort(a.editedAt.slice(0, 10)) : ''}` : ''}${a.note ? ' · ' + esc(a.note) : ''}</p>`
      : `<div class="kv"><span>${tr('No entry')}</span><b>${date < sToday() ? tr('Counted as leave') : tr('Not marked yet')}</b></div>`;
    const status = a ? a.status : 'none';
    openSheet(`<form class="entry"><div class="sheet-head"><button type="button" class="link" data-act="close-sheet">${editable ? 'Cancel' : tr('Close')}</button><h2>${esc(firstName(person))} · ${dShort(date)}</h2><span></span></div>
      ${info}
      ${editable ? `<div class="field"><label>Change to</label><div class="seg3" data-field="status">
          <button type="button" class="${status === 'present' ? 'on' : ''}" data-v="present">Present</button>
          <button type="button" class="${status === 'half' ? 'on' : ''}" data-v="half">Half day</button>
          <button type="button" class="${status === 'none' ? 'on' : ''}" data-v="none">Leave</button></div></div>
        <div class="field"><label for="anote">Reason <span class="opt">optional, saved in the log</span></label><input id="anote" class="input" maxlength="200" placeholder="e.g. forgot to mark, was on site"></div>
        <p class="form-error"></p><button class="btn primary big" type="submit">Save</button>`
        : `<p class="muted small">${tr('Only HR or the admin can change attendance.')}</p>`}
    </form>`, {
      onOpen(root) {
        if (!editable) { $('form', root).addEventListener('submit', (e) => e.preventDefault()); return; }
        let st = status;
        $('[data-field=status]', root).addEventListener('click', (e) => {
          const b = e.target.closest('[data-v]'); if (!b) return;
          st = b.dataset.v; $$('[data-field=status] button', root).forEach((x) => x.classList.toggle('on', x === b));
        });
        $('form', root).addEventListener('submit', async (e) => {
          e.preventDefault();
          if (st === status) { closeSheet(); return; }
          try {
            await api('setAttendance', { person, date, status: st, note: $('#anote', root).value });
            closeSheet(); toast('Attendance updated'); await loadHR(); render();
          } catch (err) { $('.form-error', root).textContent = err.message; }
        });
      },
    });
  }

  /* ---- HR (admin + HR login) ---- */
  function viewHRLogin() {
    return `<div class="who login">
      ${logoFull('big')}
      <h1>HR</h1>
      <p class="muted">Enter the HR PIN. Ask the admin if you don’t have one.</p>
      <form class="pin-form" data-mode="hr">
        <input class="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="current-password" placeholder="HR PIN" aria-label="HR PIN" autofocus>
        <p class="form-error" role="alert"></p>
        <button class="btn primary big" type="submit">Unlock</button>
      </form>
      <button class="btn ghost" data-act="switch-user">Switch user</button>
    </div>`;
  }

  function viewHR() {
    const m = S.hrMonth || monthOf(sToday());
    if (!S.hr || S.hr.month !== m) {
      if (!S.hrLoading && !S.lastError) loadHR().then(render).catch((e) => { S.lastError = e.message; render(); });
      return `<header class="page-head"><h1>HR</h1></header>` + loadingView();
    }
    const hr = S.hr;
    const admin = role() === 'admin';
    const tabs = [['attendance', 'Attendance']];
    if (hr.canSalary) tabs.push(['salary', 'Salary']);
    if (admin) tabs.push(['setup', 'Salary setup']);
    if (!tabs.some((t) => t[0] === S.hrTab)) S.hrTab = 'attendance';
    const body = S.hrTab === 'salary' ? hrSalary(hr, m, admin) : S.hrTab === 'setup' ? hrSetup(hr, m) : hrAttendance(hr, m);
    return `<header class="page-head"><div><p class="muted">${admin ? 'Admin' : 'HR'}</p><h1>HR</h1></div>
        <div class="head-actions no-print">${S.hrTab === 'salary' ? `<button class="btn glass small" data-act="csv-salary">${icon('download')}CSV</button><button class="btn glass small" data-act="print">${icon('print')}Print / PDF</button>` : ''}
        ${!admin ? `${refreshButton()}${themeButton()}<button class="btn glass small" data-act="logout">${icon('logout')}Lock</button>` : ''}</div></header>
      <div class="period glass no-print"><div class="seg${tabs.length} small">${tabs.map(([k, l]) => `<button class="${S.hrTab === k ? 'on' : ''}" data-act="hr-tab" data-v="${k}">${l}</button>`).join('')}</div>
        ${S.hrTab !== 'setup' ? monthStepper('hr-month', m) : ''}</div>
      ${body}`;
  }

  function hrPeople(hr, m) {
    const D = Payroll.daysIn(m);
    return hr.people.filter((p) => (p.active || hr.attendance.some((a) => a.person === p.id && !a.deleted)) && !(p.joinDate && p.joinDate > `${m}-${pad(D)}`));
  }

  function hrAttendance(hr, m) {
    const ps = hrPeople(hr, m);
    const td = sToday();
    const todays = hr.attendance.filter((a) => a.date === td && !a.deleted);
    const missing = m === monthOf(td) ? ps.filter((p) => p.active && !todays.some((a) => a.person === p.id)) : [];
    const changes = hr.attendance.filter((a) => a.editedBy).sort((a, b) => String(b.editedAt).localeCompare(String(a.editedAt))).slice(0, 10);
    return `${m === monthOf(td) ? `<section class="card glass"><header class="card-head"><h3>Today</h3><small class="muted">${dLong(td)}</small></header>
        <div class="list">${todays.map(attLine).join('')}${missing.map((p) => `<div class="att-line"><span class="att-state none">${icon('alert')}</span><span class="grow"><b>${esc(p.name)}</b><small class="muted">Not marked yet</small></span>
          <button class="btn small glass" data-act="att-cell" data-person="${p.id}" data-date="${td}">Mark</button></div>`).join('')}</div></section>` : ''}
      <section class="card glass"><header class="card-head"><h3>${monthLabel(m)}</h3><small class="muted">Tap any day to correct it</small></header>
        ${attGrid(m, ps, hr.attendance, { editable: true, start: hr.attStart, holidays: hr.holidays || [] })}</section>
      <div class="grid-2">
        <section class="card glass"><header class="card-head"><h3>Holidays · ${monthLabel(m)}</h3><button class="btn small glass" data-act="add-hol">${icon('plus')}Add holiday</button></header>
          ${(hr.holidays || []).length ? `<div class="list">${hr.holidays.slice().sort((x, y) => x.date.localeCompare(y.date)).map((h) => holLine(h, true)).join('')}</div>` : '<p class="muted small">No holidays this month.</p>'}
          <p class="muted small">Festival and company holidays don’t count as leave for anyone. If someone works that day, mark them present as usual.</p></section>
        <section class="card glass"><header class="card-head"><h3>Overtime · ${monthLabel(m)}</h3></header>
          ${(() => { const ot = (hr.overtime || []).filter((x) => x.month === m); return ot.length ? `<div class="list">${ot.map((x) => `<div class="set-row"><span class="avatar sm" style="--c:${personColor(x.person)}">${esc(personName(x.person)[0])}</span><span class="grow"><b>${esc(firstName(x.person))}</b> · ${x.days ? x.days + ' day' + (x.days === 1 ? '' : 's') : ''}${x.amount ? (x.days ? ' + ' : '') + money(Math.round(x.amount * 100)) : ''}<small class="muted">${x.note ? ' · ' + esc(x.note) : ''}</small></span><button class="icon-btn sm" data-act="rm-adj" data-id="${esc(x.id)}" aria-label="Remove">${icon('x')}</button></div>`).join('')}</div>` : '<p class="muted small">No overtime this month.</p>'; })()}
          <div class="chips">${ps.filter((p) => p.active).map((p) => `<button class="chip" data-act="add-adj" data-person="${p.id}" data-kind="overtime">${icon('plus')}${esc(firstName(p.id))}</button>`).join('')}</div>
          <p class="muted small">Overtime is paid at that person’s day rate. Only Sandeep gets unused leaves paid automatically; anyone else’s overtime is added here.</p></section>
      </div>
      ${changes.length ? `<section class="card glass"><h3>Recent corrections</h3><div class="list">${changes.map(attLine).join('')}</div></section>` : ''}`;
  }

  function payslip(hr, m) {
    return (p) => Payroll.compute({ person: p.id, joinDate: p.joinDate, month: m, today: sToday(), rules: hr.rules || [], attendance: hr.attendance.filter((a) => !a.deleted), adjustments: hr.adjustments || [], trackFrom: hr.attStart, holidays: hr.holidays || [] });
  }

  function hrSalary(hr, m, admin) {
    const ps = hrPeople(hr, m);
    const calc = payslip(hr, m);
    const slips = ps.map((p) => ({ p, s: calc(p) }));
    const total = slips.reduce((t, x) => t + (x.s.net || 0), 0);
    const paid = slips.filter((x) => (hr.payroll || []).some((r) => r.month === m && r.person === x.p.id && r.status === 'paid'));
    const st = slips[0]?.s.status;
    return `<section class="kpis three">
        <div class="kpi glass"><span>Total salary</span><b>${money(total)}</b><small>${st === 'running' ? 'so far, month in progress' : monthLabel(m)}</small></div>
        <div class="kpi glass"><span>Paid</span><b>${paid.length} of ${slips.filter((x) => !x.s.noRule).length}</b><small>${paid.length ? money(paid.reduce((t, x) => t + x.s.net, 0)) : 'nothing marked paid yet'}</small></div>
        <div class="kpi glass"><span>Days in month</span><b>${Payroll.daysIn(m)}</b><small>every day counts, Sundays included</small></div>
      </section>
      <div class="payslips">${slips.map(({ p, s }) => payslipCard(p, s, hr, m, admin)).join('')}</div>
      <p class="muted small">Day rate = monthly salary ÷ days in the month. Leaves above the paid allowance are deducted at the day rate. A half day counts as half a leave.${st === 'running' ? ' This month is still running: leaves are counted up to today, and overtime assumes no more leaves.' : ''}</p>`;
  }

  function payslipCard(p, s, hr, m, admin) {
    if (s.noRule) return `<article class="glass payslip"><header><span class="avatar" style="--c:${personColor(p.id)}">${esc(p.name[0])}</span><div><h3>${esc(p.name)}</h3><small class="muted">No salary set</small></div></header>
      ${admin ? `<button class="btn glass" data-act="edit-rule" data-person="${p.id}">${icon('plus')}Set salary</button>` : ''}</article>`;
    const rec = (hr.payroll || []).find((r) => r.month === m && r.person === p.id);
    const isPaid = rec && rec.status === 'paid';
    const changed = isPaid && Math.round(rec.net * 100) !== s.net;
    const chip = isPaid ? `<span class="pill ok">${icon('check')}Paid ${rec.paidOn ? dShort(rec.paidOn) : ''}</span>` : s.status === 'running' ? '<span class="pill">In progress</span>' : '<span class="pill warn">Not paid</span>';
    return `<article class="glass payslip">
      <header><span class="avatar" style="--c:${personColor(p.id)}">${esc(p.name[0])}</span><div class="grow"><h3>${esc(p.name)}</h3><small class="muted">${money(Math.round(s.rule.base * 100))}/month · ${s.rule.paidLeaves} paid leaves${s.rule.autoOvertime ? ' · unused leaves paid' : ''}</small></div>${chip}</header>
      <p class="pc-bal">${money(s.net)}</p>
      ${changed ? `<p class="pc-count off">${icon('alert')}Paid ${money(Math.round(rec.net * 100))}, but attendance or adjustments changed after that.</p>` : ''}
      <div class="att-sum">
        <div><span>Worked</span><b>${s.worked}<small>/${s.elapsed}</small></b></div>
        <div><span>Present</span><b>${s.present}</b></div>
        <div><span>Half days</span><b>${s.half}</b></div>
        <div><span>Leaves</span><b class="${s.leaves > s.allowance ? 'neg' : ''}">${s.leaves}<small>/${s.allowance} paid</small></b></div>
        ${s.holidays ? `<div><span>Holidays</span><b>${s.holidays}</b></div>` : ''}
      </div>
      <div class="lines">${s.lines.map((l) => `<div class="line"><span class="grow">${esc(l.label)}<small>${esc(l.detail || '')}</small></span><b class="${l.paise < 0 ? 'neg' : ''}">${money(l.paise, { sign: l.key !== 'base' })}</b>${admin && l.key === 'adj' ? `<button class="icon-btn sm" data-act="rm-adj" data-id="${esc(l.id)}" aria-label="Remove">${icon('x')}</button>` : ''}</div>`).join('')}
        ${s.rounding ? `<div class="line muted"><span class="grow">Rounded to the rupee</span><b>${money(s.rounding, { sign: true })}</b></div>` : ''}
        <div class="line total"><span class="grow">Net pay</span><b>${money(s.net)}</b></div></div>
      ${admin ? `<div class="pc-actions no-print"><button class="btn small glass" data-act="add-adj" data-person="${p.id}" data-kind="overtime">${icon('plus')}Overtime</button>
        <button class="btn small glass" data-act="add-adj" data-person="${p.id}" data-kind="bonus">${icon('plus')}Bonus / deduction</button>
        <button class="btn small ${isPaid ? 'glass' : 'primary'}" data-act="pay" data-person="${p.id}" data-net="${s.net}" data-status="${isPaid ? 'open' : 'paid'}">${isPaid ? 'Undo paid' : icon('check') + 'Mark paid'}</button></div>` : ''}
    </article>`;
  }

  function hrSetup(hr, m) {
    const ps = hr.people;
    const rules = hr.rules || [];
    return `<div class="grid-2">${ps.map((p) => {
      const cur = Payroll.ruleFor(rules, p.id, monthOf(sToday()));
      const hist = rules.filter((r) => r.person === p.id).sort((a, b) => b.from.localeCompare(a.from));
      return `<section class="card glass"><header class="card-head"><div class="row"><span class="avatar sm" style="--c:${personColor(p.id)}">${esc(p.name[0])}</span><h3>${esc(p.name)}</h3>${p.active ? '' : '<span class="pill">Hidden</span>'}</div>
          <button class="btn small primary" data-act="edit-rule" data-person="${p.id}">${cur ? 'Change salary' : 'Set salary'}</button></header>
        ${cur ? `<div class="att-sum"><div><span>Monthly</span><b>${money(Math.round(cur.base * 100))}</b></div><div><span>Paid leaves</span><b>${cur.paidLeaves}</b></div><div><span>Unused leaves</span><b>${cur.autoOvertime ? 'Paid as overtime' : 'Not paid'}</b></div></div>` : '<p class="muted">No salary set yet.</p>'}
        ${p.joinDate ? `<p class="muted small">Joined ${dLong(p.joinDate)}</p>` : ''}
        ${hist.length ? `<div class="list">${hist.map((r) => `<div class="set-row"><span class="grow"><b>From ${monthLabel(r.from)}</b><small class="muted"> · ${money(Math.round(r.base * 100))}, ${r.paidLeaves} paid leaves${r.autoOvertime ? ', overtime for unused' : ''}${r.note ? ' · ' + esc(r.note) : ''}</small></span>
          <button class="btn small ghost" data-act="del-rule" data-person="${p.id}" data-from="${r.from}">Delete</button></div>`).join('')}</div>` : ''}
      </section>`;
    }).join('')}</div>
    <div class="grid-2"><section class="card glass"><h3>HR login</h3>
        <p class="muted small">HR can correct attendance for everyone. HR never sees expenses.</p>
        <p>${hr.hasHrPin ? `<span class="pill ok">${icon('check')}HR PIN is set</span>` : '<span class="pill">No HR PIN yet</span>'}</p>
        <button class="btn glass wide" data-act="hr-pin">${icon('lock')}${hr.hasHrPin ? 'Change HR PIN' : 'Create HR PIN'}</button>
        ${hr.hasHrPin ? `<button class="btn danger-ghost wide" data-act="hr-remove">Turn off HR login</button>` : ''}
        <label class="toggle big"><input type="checkbox" data-act-change="hr-salary" ${hr.hrCanSeeSalary ? 'checked' : ''}><span>Let HR see salaries</span></label>
        <p class="muted small">When this is on, HR can see the Salary tab but can’t change salaries, overtime or payments.</p></section>
      <section class="card glass"><h3>How salary is worked out</h3>
        <p class="muted small">Every calendar day counts, Sundays included. Day rate = monthly salary ÷ days in that month. Days with no attendance entry count as leave (except holidays), and a half day counts as half a leave. Leaves above the paid allowance are cut at the day rate. If “unused leaves paid” is on, each unused paid leave is added at the day rate (Sandeep: 30-day month, 1 leave → 3 × ₹500 = ₹1,500 extra). Overtime, bonus, deductions and salary advances can be added for anyone from the Salary tab.</p>
        <div class="field"><label for="attstart">Attendance counted from</label><input id="attstart" class="input" type="date" value="${esc(hr.attStart || '')}" data-act-change="att-start"><small class="muted">Days before this don’t count as leave. Set it to the day you start using the app.</small></div>
        <p class="muted small">Join dates are set under Settings → Staff. Salary rules can also be edited in the <b>SalaryRules</b> tab of the Google Sheet.</p></section></div>`;
  }

  function ruleSheet(person) {
    const hr = S.hr;
    const cur = Payroll.ruleFor(hr.rules || [], person, monthOf(sToday())) || { base: '', paidLeaves: 4, autoOvertime: false, note: '' };
    let auto = !!cur.autoOvertime;
    openSheet(`<form class="entry"><div class="sheet-head"><button type="button" class="link" data-act="close-sheet">Cancel</button><h2>Salary · ${esc(firstName(person))}</h2><span></span></div>
      <div class="field"><label for="rbase">Monthly salary (₹)</label><input id="rbase" class="input" inputmode="decimal" value="${cur.base}" placeholder="15000"></div>
      <div class="field"><label for="rleaves">Paid leaves per month</label><input id="rleaves" class="input" inputmode="decimal" value="${cur.paidLeaves}"></div>
      <label class="toggle big"><input type="checkbox" id="rauto" ${auto ? 'checked' : ''}><span>Pay unused paid leaves as overtime</span></label>
      <div class="field"><label for="rfrom">Starts from month</label><input id="rfrom" class="input" type="month" value="${monthOf(sToday())}"></div>
      <div class="field"><label for="rnote">Note <span class="opt">optional</span></label><input id="rnote" class="input" maxlength="120" value="${esc(cur.note || '')}"></div>
      <div class="kv"><span>Day rate in a 30-day month</span><b data-rate>—</b></div>
      <p class="muted small">Earlier months keep the salary they had. To fix a past month, pick that month here.</p>
      <p class="form-error"></p><button class="btn primary big" type="submit">Save salary</button></form>`, {
      onOpen(root) {
        const rate = () => { const b = Number($('#rbase', root).value); $('[data-rate]', root).textContent = b > 0 ? money(Math.round((b * 100) / 30)) : '—'; };
        rate(); $('#rbase', root).addEventListener('input', rate);
        $('form', root).addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const r = await api('saveRule', { rule: { person, from: $('#rfrom', root).value, base: Number($('#rbase', root).value), paidLeaves: Number($('#rleaves', root).value), autoOvertime: $('#rauto', root).checked, note: $('#rnote', root).value } });
            S.hr.rules = r.rules; closeSheet(); toast('Salary saved'); render();
          } catch (err) { $('.form-error', root).textContent = err.message; }
        });
      },
    });
  }

  function adjSheet(person, kind0) {
    const m = S.hr.month;
    const s = S.hr.canSalary ? payslip(S.hr, m)(people().find((p) => p.id === person) || { id: person }) : {};
    let kind = kind0 === 'overtime' ? 'overtime' : 'bonus';
    const hrOnly = role() === 'hr';
    if (hrOnly) kind = 'overtime';
    openSheet(`<form class="entry"><div class="sheet-head"><button type="button" class="link" data-act="close-sheet">Cancel</button><h2>${esc(firstName(person))} · ${monthLabel(m)}</h2><span></span></div>
      <div class="seg4" data-field="kind" ${hrOnly ? 'hidden' : ''}>${[['overtime', 'Overtime'], ['bonus', 'Bonus'], ['deduction', 'Deduction'], ['advance', 'Advance']].map(([v, l]) => `<button type="button" class="${kind === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="field" data-only="overtime"><label for="adays">Overtime days</label><input id="adays" class="input" inputmode="decimal" placeholder="e.g. 2 or 0.5"><small class="muted">Paid at the day rate${s.dayRate && !hrOnly ? ` (${money(Math.round(s.dayRate))})` : ''}. Half days allowed (0.5).</small></div>
      <div class="field" ${hrOnly ? 'hidden' : ''}><label for="aamt" data-amt-label>Amount (₹)</label><input id="aamt" class="input" inputmode="decimal" placeholder="0"></div>
      <div class="field"><label for="adnote">Note</label><input id="adnote" class="input" maxlength="200" placeholder="e.g. Sunday site visit"></div>
      <p class="muted small" data-hint></p>
      <p class="form-error"></p><button class="btn primary big" type="submit">Add</button></form>`, {
      onOpen(root) {
        const sync = () => {
          $('[data-only=overtime]', root).hidden = kind !== 'overtime';
          $('[data-amt-label]', root).textContent = kind === 'overtime' ? 'Or a fixed amount (₹)' : 'Amount (₹)';
          $('[data-hint]', root).textContent = { overtime: 'Added to the salary.', bonus: 'Added to the salary.', deduction: 'Taken off the salary.', advance: 'Money already given in advance, taken off this salary.' }[kind];
        };
        sync();
        $('[data-field=kind]', root).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; kind = b.dataset.v; $$('[data-field=kind] button', root).forEach((x) => x.classList.toggle('on', x === b)); sync(); });
        $('form', root).addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await api('saveAdjustment', { adjustment: { id: uid(), month: m, person, kind, days: kind === 'overtime' ? Number($('#adays', root).value) || 0 : 0, amount: Number($('#aamt', root).value) || 0, note: $('#adnote', root).value } });
            closeSheet(); toast('Added'); await loadHR(); render();
          } catch (err) { $('.form-error', root).textContent = err.message; }
        });
      },
    });
  }

  function holLine(h, removable) {
    return `<div class="set-row"><span class="hol-ic">${icon('star')}</span><span class="grow"><b>${esc(h.name)}</b><small class="muted"> · ${dLong(h.date)} · ${h.kind === 'company' ? tr('Company holiday') : tr('Festival')}</small></span>
      ${removable ? `<button class="icon-btn sm" data-act="rm-hol" data-id="${esc(h.id)}" aria-label="Remove holiday">${icon('x')}</button>` : ''}</div>`;
  }

  function holidaySheet() {
    let kind = 'festival';
    const m = S.hr.month;
    const def = m === monthOf(sToday()) ? sToday() : `${m}-01`;
    openSheet(`<form class="entry"><div class="sheet-head"><button type="button" class="link" data-act="close-sheet">Cancel</button><h2>Add holiday</h2><span></span></div>
      <div class="seg2" data-field="hkind"><button type="button" class="on" data-v="festival">${icon('star')}Festival</button><button type="button" data-v="company">${icon('calendar')}Company holiday</button></div>
      <div class="field"><label for="hname">Name</label><input id="hname" class="input" maxlength="60" placeholder="e.g. Diwali, Office closed"></div>
      <div class="field"><label for="hdate">Date</label><input id="hdate" class="input" type="date" value="${def}"></div>
      <p class="muted small">Nobody is marked on leave for this day. It can be a past or future date.</p>
      <p class="form-error"></p><button class="btn primary big" type="submit">Add holiday</button></form>`, {
      onOpen(root) {
        $('[data-field=hkind]', root).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; kind = b.dataset.v; $$('[data-field=hkind] button', root).forEach((x) => x.classList.toggle('on', x === b)); });
        setTimeout(() => $('#hname', root).focus(), 300);
        $('form', root).addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const date = $('#hdate', root).value;
            await api('saveHoliday', { holiday: { date, name: $('#hname', root).value, kind } });
            closeSheet(); toast('Holiday added');
            if (monthOf(date) !== S.hr.month) S.hrMonth = monthOf(date);
            await loadHR(); render();
          } catch (err) { $('.form-error', root).textContent = err.message; }
        });
      },
    });
  }

  function hrPinSheet() {
    openSheet(`<form class="entry"><div class="sheet-head"><button type="button" class="link" data-act="close-sheet">Cancel</button><h2>HR PIN</h2><span></span></div>
      <p class="muted">Give this PIN to the person handling HR. It must be different from your admin PIN.</p>
      <input class="pin" id="hp1" type="password" inputmode="numeric" maxlength="8" placeholder="New HR PIN" autocomplete="new-password">
      <input class="pin" id="hp2" type="password" inputmode="numeric" maxlength="8" placeholder="Repeat HR PIN" autocomplete="new-password">
      <p class="form-error"></p><button class="btn primary big" type="submit">Save HR PIN</button></form>`, {
      onOpen(root) {
        $('form', root).addEventListener('submit', async (e) => {
          e.preventDefault();
          const a = $('#hp1', root).value, b = $('#hp2', root).value;
          if (!/^\d{4,8}$/.test(a)) return ($('.form-error', root).textContent = 'Use 4 to 8 digits.');
          if (a !== b) return ($('.form-error', root).textContent = 'The PINs don’t match.');
          try { const r = await api('setHrAccess', { pin: a }); Object.assign(S.hr, r); closeSheet(); toast('HR PIN saved'); render(); }
          catch (err) { $('.form-error', root).textContent = err.message; }
        });
      },
    });
  }

  function salaryCsv() {
    const m = S.hr.month, calc = payslip(S.hr, m);
    const head = ['Month', 'Person', 'Monthly salary', 'Days in month', 'Present', 'Half days', 'Leaves', 'Paid leaves', 'Extra leave cut', 'Auto overtime', 'Adjustments', 'Net pay', 'Paid'];
    const rows = hrPeople(S.hr, m).map((p) => {
      const s = calc(p);
      if (s.noRule) return [m, p.name, '', '', '', '', '', '', '', '', '', '', ''];
      const sumKey = (k) => s.lines.filter((l) => l.key === k).reduce((t, l) => t + l.paise, 0) / 100;
      const rec = (S.hr.payroll || []).find((r) => r.month === m && r.person === p.id && r.status === 'paid');
      return [m, p.name, s.rule.base, s.days, s.present, s.half, s.leaves, s.allowance, sumKey('leaveCut'), sumKey('autoOT'), sumKey('adj'), s.net / 100, rec ? rec.paidOn : ''];
    });
    return '﻿' + [head, ...rows].map((l) => l.map((v) => { const x = String(v); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; }).join(',')).join('\n');
  }

  /* ======================= render ======================= */
  const ADMIN_TABS = [['dashboard', 'Dashboard', 'chart'], ['reports', 'Reports', 'report'], ['ledger', 'Entries', 'list'], ['hr', 'HR', 'users'], ['settings', 'Settings', 'gear']];
  const STAFF_TABS = [['home', 'Home', 'home'], ['attendance', 'Attendance', 'calendar'], ['history', 'Expenses', 'list']]; // labels go through tr()
  const HR_TABS = [['hr', 'HR', 'users']];

  function render() {
    const app = $('#app');
    const nav = $('#nav');
    const isAdmin = S.me === 'admin', isHR = S.me === 'hr';
    if (S.token && (isAdmin || isHR) && role() !== S.me) { S.token = null; store.del('token'); }
    document.body.classList.toggle('is-admin', (isAdmin || isHR) && !!S.token);
    let html = '';
    if (!S.me) { html = viewWho(); nav.hidden = true; }
    else if (isAdmin && !S.token) { html = viewAdminLogin(); nav.hidden = true; }
    else if (isHR && !S.token) { html = viewHRLogin(); nav.hidden = true; }
    else {
      const tabs = isAdmin ? ADMIN_TABS : isHR ? HR_TABS : STAFF_TABS;
      if (!tabs.some((t) => t[0] === S.route)) S.route = tabs[0][0];
      html = ({ home: viewHome, attendance: viewAttendance, history: viewHistory, dashboard: viewDashboard, reports: viewReports, ledger: viewLedger, hr: viewHR, settings: viewSettings })[S.route]();
      nav.hidden = isHR;
      nav.innerHTML = `<div class="nav-inner glass">${tabs.map(([k, l, i]) => `<button class="${S.route === k ? 'on' : ''}" data-go="${k}" aria-label="${tr(l)}">${icon(i)}<span>${tr(l)}</span></button>`).join('')}
        ${isAdmin ? `<button class="nav-refresh" data-act="refresh" aria-label="Refresh" title="Refresh">${icon('sync', S.refreshing ? 'spin' : '')}<span>Refresh</span></button>` : ''}
        ${!isAdmin && !isHR ? `<button class="nav-add" data-act="add" data-type="expense" aria-label="${tr('Add expense')}">${icon('plus')}</button>` : ''}</div>`;
    }
    const y = window.scrollY;
    const anim = S._lastView !== S.me + S.route; S._lastView = S.me + S.route;
    app.innerHTML = `<div class="view view-${S.route}${anim ? ' anim' : ''}">${html}</div>`;
    window.scrollTo(0, y);
    renderSyncChip();
    if (S.route === 'dashboard') requestAnimationFrame(drawDashboardCharts);
    $$('.att-grid-wrap').forEach((w) => { const t = $('th.today', w); if (t) w.scrollLeft = Math.max(0, t.offsetLeft - w.clientWidth / 2); });
  }

  function renderSyncChip() {
    const el = $('#sync');
    const n = S.outbox.length;
    if (!n && !S.lastError && S.online) { el.hidden = true; return; }
    el.hidden = false;
    el.className = 'sync-chip glass' + (S.lastError ? ' warn' : '');
    el.innerHTML = !S.online ? `${icon('sync')}${tr('Offline')}${n ? ` · ${tr('{n} waiting', { n })}` : ''}` : S.syncing ? `${icon('sync', 'spin')}${tr('Syncing {n}…', { n })}` : S.lastError ? `${icon('alert')}${n ? tr('{n} not synced', { n }) + ' · ' : ''}${tr('Tap to retry')}` : `${icon('sync')}${tr('{n} waiting to sync', { n })}`;
  }

  async function refreshData() {
    if (!S.me) return;
    if (S.me === 'admin') { if (S.token) { await loadAdmin(); if (S.route === 'hr') await loadHR(); } }
    else if (S.me === 'hr') { if (S.token) await loadHR(); }
    else { await Promise.all([loadMine(), loadAtt()]); if (S.attMonth && S.attMonth !== monthOf(sToday())) await loadAtt(S.attMonth); }
  }

  /* ======================= events ======================= */
  document.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { S.route = go.dataset.go; history.replaceState(null, '', '#' + S.route); window.scrollTo(0, 0); render(); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    switch (act) {
      case 'close-sheet': if (a.closest('#sheet')) closeSheet(); break;
      case 'pick-me':
        S.me = a.dataset.id; store.set('me', S.me); LANG_ME = S.me;
        S.route = S.me === 'admin' ? 'dashboard' : S.me === 'hr' ? 'hr' : 'home';
        render();
        refreshData().then(render).catch((err) => { S.lastError = err.message; render(); });
        break;
      case 'switch-user':
        if (S.outbox.length && !confirm(tr('Some entries are still waiting to sync. Switch anyway? They will sync later.'))) return;
        S.me = null; LANG_ME = null; store.del('me'); S.mine = []; store.set('mine', []); S.admin = null; S.hr = null; S.attNow = null; store.del('attNow'); S.token = null; store.del('token'); render(); break;
      case 'add': entryForm({ type: a.dataset.type, person: a.dataset.person }); break;
      case 'edit': {
        const pool = S.me === 'admin' ? adminTxns() : myTxns();
        const t = pool.find((x) => x.id === a.dataset.id);
        if (t) entryForm({ txn: t });
        break;
      }
      case 'hist-month': S.histMonth = a.dataset.m; render(); break;
      case 'period': S.period = a.dataset.v; S.periodAnchor = today(); store.set('period', S.period); render(); break;
      case 'period-step':
        S.periodAnchor = S.period === 'week' ? addDays(S.periodAnchor, 7 * Number(a.dataset.d)) : addMonths(S.periodAnchor, Number(a.dataset.d));
        render(); break;
      case 'report-mode': S.reportMode = a.dataset.v; render(); break;
      case 'report-step':
        S.reportAnchor = S.reportMode === 'week' ? addDays(S.reportAnchor, 7 * Number(a.dataset.d)) : addMonths(S.reportAnchor, Number(a.dataset.d));
        render(); break;
      case 'print': window.print(); break;
      case 'share-report': {
        const text = reportText();
        if (navigator.share) { try { await navigator.share({ text }); } catch (err) { /* cancelled */ } }
        else { try { await navigator.clipboard.writeText(text); toast('Summary copied. Paste it in WhatsApp.'); } catch (err) { toast('Couldn’t copy', 'warn'); } }
        break;
      }
      case 'csv-report': { const r = reportRange(); download(`sunpour-expenses-${r.from}-to-${r.to}.csv`, csv(adminTxns().filter((t) => t.date >= r.from && t.date <= r.to))); break; }
      case 'csv-ledger': download(`sunpour-expenses-filtered-${today()}.csv`, csv(ledgerRows())); break;
      case 'csv-all': download(`sunpour-expenses-all-${today()}.csv`, csv(adminTxns())); break;
      case 'ledger-flagged': S.ledgerFilter = { ...S.ledgerFilter, flagged: true }; S.route = 'ledger'; render(); break;
      case 'count': countSheet(a.dataset.person); break;
      case 'add-person': personSheet(null); break;
      case 'edit-person': personSheet(a.dataset.id); break;
      case 'add-cat': catSheet(null); break;
      case 'edit-cat': catSheet(a.dataset.id); break;
      case 'change-pin': pinSheet(); break;
      case 'logout': S.token = null; store.del('token'); S.admin = null; S.hr = null; render(); break;
      case 'att-mark': markAtt(a.dataset.person, a.dataset.status); break;
      case 'att-half': makeHalf(a.dataset.id); break;
      case 'att-month': S.attMonth = addMonthStr(S.attMonth || monthOf(sToday()), Number(a.dataset.d)); render(); break;
      case 'att-cell': attCellSheet(a.dataset.person, a.dataset.date); break;
      case 'hr-tab': S.hrTab = a.dataset.v; render(); break;
      case 'hr-month': S.hrMonth = addMonthStr(S.hrMonth || monthOf(sToday()), Number(a.dataset.d)); S.lastError = ''; render(); break;
      case 'edit-rule': ruleSheet(a.dataset.person); break;
      case 'del-rule':
        if (!confirm(`Delete the salary rule from ${monthLabel(a.dataset.from)}? Months from then on will use the rule before it.`)) return;
        try { const r = await api('deleteRule', { person: a.dataset.person, from: a.dataset.from }); S.hr.rules = r.rules; render(); } catch (err) { toast(err.message, 'warn'); }
        break;
      case 'add-adj': adjSheet(a.dataset.person, a.dataset.kind); break;
      case 'rm-adj': {
        const adj = (S.hr.adjustments || []).find((x) => x.id === a.dataset.id) || (S.hr.overtime || []).find((x) => x.id === a.dataset.id);
        if (!adj || !confirm('Remove this from the salary?')) return;
        try { await api('saveAdjustment', { adjustment: { ...adj, deleted: true } }); await loadHR(); render(); } catch (err) { toast(err.message, 'warn'); }
        break;
      }
      case 'pay': {
        const paidNow = a.dataset.status === 'paid';
        if (paidNow && !confirm(`Mark ${firstName(a.dataset.person)}'s ${monthLabel(S.hr.month)} salary of ${money(Number(a.dataset.net))} as paid?`)) return;
        try { await api('setPayroll', { payroll: { month: S.hr.month, person: a.dataset.person, status: a.dataset.status, net: Number(a.dataset.net) / 100 } }); await loadHR(); render(); toast(paidNow ? 'Marked as paid' : 'Marked as not paid'); } catch (err) { toast(err.message, 'warn'); }
        break;
      }
      case 'hr-pin': hrPinSheet(); break;
      case 'theme-set': setTheme(a.dataset.v); break;
      case 'theme-cycle': { const i = THEMES.findIndex((x) => x[0] === S.theme); setTheme(THEMES[(i + 1) % THEMES.length][0]); toast(tr('Theme: {name}', { name: tr(THEMES[(i + 1) % THEMES.length][1]) })); break; }
      case 'lang-toggle': setLang(lang() === 'hi' ? 'en' : 'hi'); break;
      case 'lang-set': setLang(a.dataset.v); break;
      case 'refresh': doRefresh(); break;
      case 'add-hol': holidaySheet(); break;
      case 'rm-hol':
        if (!confirm('Remove this holiday? That day will count as leave for anyone who didn’t mark attendance.')) return;
        try { await api('deleteHoliday', { id: a.dataset.id }); await loadHR(); render(); toast('Holiday removed'); } catch (err) { toast(err.message, 'warn'); }
        break;
      case 'hr-remove':
        if (!confirm('Turn off HR login? Anyone signed in as HR will be signed out.')) return;
        try { const r = await api('setHrAccess', { removePin: true }); Object.assign(S.hr, r); render(); } catch (err) { toast(err.message, 'warn'); }
        break;
      case 'csv-salary': download(`sunpour-salary-${S.hr.month}.csv`, salaryCsv()); break;
      case 'del-cat':
        if (!confirm('Delete this category for good?')) return;
        try { const r = await api('deleteCategory', { id: a.dataset.id }); S.admin.categories = r.categories; S.config.categories = r.categories; store.set('config', S.config); closeSheet(); toast('Category deleted'); render(); } catch (err) { toast(err.message, 'warn'); }
        break;
      case 'retry': S.lastError = ''; render(); boot(); break;
    }
  });

  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('.pin-form');
    if (!f) return;
    e.preventDefault();
    const err = $('.form-error', f);
    const pin = f.pin.value.trim();
    const btn = $('button[type=submit]', f);
    try {
      btn.disabled = true;
      if (f.dataset.mode === 'hr') {
        const r = await api('hrLogin', { pin });
        S.token = r.token; store.set('token', S.token); S.route = 'hr'; render();
        await loadHR(); render(); return;
      }
      if (f.dataset.mode === 'create') {
        if (!/^\d{4,8}$/.test(pin)) throw new Error('Use 4 to 8 digits.');
        if (pin !== f.pin2.value.trim()) throw new Error('The PINs don’t match.');
        const r = await api('setPin', { pin });
        S.token = r.token;
      } else {
        const r = await api('login', { pin });
        if (r.needsPin) { S.config.hasPin = false; render(); return; }
        S.token = r.token;
      }
      store.set('token', S.token);
      S.route = 'dashboard';
      render();
      await loadAdmin(); render();
    } catch (x) { err.textContent = x.message; f.pin.value = ''; f.pin.focus(); }
    finally { btn.disabled = false; }
  });

  document.addEventListener('change', async (e) => {
    const st = e.target.closest('[data-act-change="att-start"]');
    if (st) {
      try { const r = await api('setAttStart', { date: st.value }); S.hr.attStart = r.attStart; toast(`Attendance counted from ${dShort(r.attStart)}`); render(); } catch (err) { toast(err.message, 'warn'); }
      return;
    }
    const tg = e.target.closest('[data-act-change="hr-salary"]');
    if (tg) {
      try { const r = await api('setHrAccess', { canSeeSalary: tg.checked }); Object.assign(S.hr, r); toast(tg.checked ? 'HR can now see salaries' : 'Salaries hidden from HR'); } catch (err) { tg.checked = !tg.checked; toast(err.message, 'warn'); }
      return;
    }
    const inp = e.target.closest('[data-act-file="import"]');
    if (!inp || !inp.files[0]) return;
    try {
      const rows = JSON.parse(await inp.files[0].text());
      if (!Array.isArray(rows) || !rows.every((t) => t.id && t.date && t.type)) throw new Error('This is not the import file.');
      if (!confirm(`Import ${rows.length} entries from the old spreadsheet?`)) return;
      toast('Importing…');
      const r = await api('importSeed', { txns: rows });
      await loadAdmin(); render();
      toast(`${r.added} entries imported${r.added < rows.length ? `, ${rows.length - r.added} were already there` : ''}`);
    } catch (err) { toast(err.message, 'warn'); }
    inp.value = '';
  });

  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-filter]');
    if (!el) return;
    const k = el.dataset.filter;
    S.ledgerFilter[k] = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'q') {
      clearTimeout(S._qT);
      S._qT = setTimeout(() => { render(); const i = $('[data-filter=q]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250);
    } else render();
  });

  $('#sync').addEventListener('click', () => { S.lastError = ''; flush().then(() => refreshData()).then(render).catch(() => render()); });
  window.addEventListener('online', () => { S.online = true; flush().then(refreshData).then(render).catch(() => {}); });
  window.addEventListener('offline', () => { S.online = false; renderSyncChip(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.me) flush().then(refreshData).then(render).catch(() => {});
  });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== S.route) { S.route = h; render(); } });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
  let rT; window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(drawDashboardCharts, 150); });
  setInterval(() => { if (S.outbox.length && navigator.onLine) flush().then(refreshData).then(render).catch(() => {}); }, 30000);
  // keep everyone's changes coming in without restarting the app
  setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine && S.me && !busy()) doRefresh({ quiet: true }); }, 60000);
  let lastFocusRefresh = 0;
  window.addEventListener('focus', () => { if (Date.now() - lastFocusRefresh > 15000 && S.me && navigator.onLine) { lastFocusRefresh = Date.now(); doRefresh({ quiet: true }); } });

  /* ======================= boot ======================= */
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); if (S.route === 'dashboard') drawDashboardCharts(); });

  async function boot() {
    applyTheme();
    document.documentElement.lang = lang();
    const h = location.hash.slice(1);
    if (h) S.route = h;
    render();
    try {
      await loadConfig();
      S.lastError = '';
      render();
      await flush();
      await refreshData();
    } catch (e) {
      S.lastError = navigator.onLine ? e.message : tr('You’re offline. Entries you add will sync later.');
    }
    render();
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.SPX = { S, summarize, balanceOf, paise, money }; // for debugging/tests
  boot();
})();
