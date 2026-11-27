/* Demo backend: used only when config.js has no API_URL.
   Mirrors the Apps Script API, keeps data in this browser's localStorage. */
(function () {
  const KEY = 'spx.mockdb';
  const PEOPLE = [{ id: 'p1', name: 'Sandeep Swami', active: true, joinDate: '', tools: true }, { id: 'p2', name: 'Ravi Goyal', active: true, joinDate: '', tools: false }];
  const RULES = [{ person: 'p1', from: '2026-08', base: 15000, paidLeaves: 4, autoOvertime: true, note: 'Unused paid leaves are paid as overtime' }, { person: 'p2', from: '2026-08', base: 20000, paidLeaves: 4, autoOvertime: false, note: 'Fixed salary' }];
  const CATS = [['petrol', 'Petrol', 'fuel'], ['tea', 'Tea & snacks', 'cup'], ['milk', 'Milk', 'milk'], ['water', 'Water', 'drop'], ['grocery', 'Grocery', 'basket'], ['meals', 'Meals', 'meal'], ['supplies', 'Office supplies', 'box'], ['maintenance', 'Repairs & cleaning', 'wrench'], ['stationery', 'Stationery & docs', 'pen'], ['travel', 'Travel & parking', 'car'], ['bills', 'Bills & utilities', 'bolt'], ['site', 'Site work', 'sun'], ['courier', 'Courier', 'parcel'], ['misc', 'Miscellaneous', 'dots']]
    .map(([id, name, icon], i) => ({ id, name, icon, active: true, order: i }));
  let db;
  function load() {
    if (db) return db;
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!db) db = { tx: [], people: PEOPLE, cats: CATS, counts: [], audit: [], pin: '', seeded: false };
    db.att = db.att || []; db.rules = db.rules || RULES; db.adj = db.adj || []; db.payroll = db.payroll || []; db.hrPin = db.hrPin || ''; db.hrSalary = !!db.hrSalary; db.hol = db.hol || [];
    return db;
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ } };
  const audit = (who, action, id, details) => db.audit.push({ time: new Date().toISOString(), who, action, id, details });
  const isAdmin = (t) => t && db.pin && t === 'admin.mock.' + db.pin;
  const roleOf = (t) => (isAdmin(t) ? 'admin' : t && db.hrPin && t === 'hr.mock.' + db.hrPin ? 'hr' : null);
  const pad = (n) => String(n).padStart(2, '0');
  const nowDate = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const attStart = () => db.attStart || db.att.filter((a) => !a.deleted).map((a) => a.date).sort()[0] || nowDate();
  const wait = () => new Promise((r) => setTimeout(r, 120));

  async function seed() {
    if (db.seeded) return;
    db.seeded = true;
    try {
      const r = await fetch(window.SPX_CONFIG.DEMO_SEED || '../import/seed.json');
      if (r.ok) { const rows = await r.json(); db.tx = rows.map((t) => ({ ...t, deleted: false })); audit('admin', 'import', '', rows.length + ' entries from the old spreadsheet'); }
    } catch (e) { /* no seed */ }
    save();
  }

  window.MockAPI = async function (req) {
    load(); await seed(); await wait();
    const fail = (m) => { throw new Error(m); };
    const admin = isAdmin(req.token);
    const role = roleOf(req.token);
    const actor = role || req.actor;
    const needHR = () => { if (!role) fail('HR_LOGIN_REQUIRED'); };
    switch (req.action) {
      case 'config': return { ok: true, people: db.people, categories: db.cats, hasPin: !!db.pin, hasHrPin: !!db.hrPin, today: nowDate() };
      case 'list': return { ok: true, transactions: db.tx.filter((t) => !t.deleted && (t.person === req.person || t.to === req.person)) };
      case 'save': {
        const t = req.txn;
        if (!(Number(t.amount) > 0)) fail('Amount must be more than 0');
        if (t.type === 'expense' && !db.cats.some((c) => c.id === t.category)) fail('Pick a category');
        const i = db.tx.findIndex((x) => x.id === t.id);
        const now = new Date().toISOString();
        if (i >= 0) { const old = db.tx[i]; db.tx[i] = { ...old, ...t, by: old.by, createdAt: old.createdAt, updatedAt: now, flag: admin ? t.flag || '' : old.flag }; audit(actor, 'edit', t.id, `${t.date} ${t.type} ${t.amount}`); }
        else { db.tx.push({ ...t, by: actor, createdAt: t.createdAt || now, updatedAt: now, deleted: false, flag: admin ? t.flag || '' : '' }); audit(actor, 'add', t.id, `${t.date} ${t.type} ${t.amount}`); }
        save(); return { ok: true };
      }
      case 'remove': { const t = db.tx.find((x) => x.id === req.id); if (t) { t.deleted = true; audit(actor, 'delete', t.id, `${t.date} ${t.type} ${t.amount}`); save(); } return { ok: true }; }
      case 'setPin':
        if (db.pin && !admin) fail('Not allowed');
        if (!/^\d{4,8}$/.test(req.pin)) fail('PIN must be 4 to 8 digits');
        db.pin = req.pin; save(); return { ok: true, token: 'admin.mock.' + db.pin };
      case 'login':
        if (!db.pin) return { ok: false, needsPin: true };
        if (req.pin !== db.pin) fail('Wrong PIN');
        return { ok: true, token: 'admin.mock.' + db.pin };
      case 'admin':
        if (!admin) { const e = new Error('ADMIN_LOGIN_REQUIRED'); throw e; }
        return { ok: true, transactions: db.tx, people: db.people, categories: db.cats, counts: db.counts, audit: db.audit.slice(-300) };
      case 'savePerson': {
        if (!admin) fail('ADMIN_LOGIN_REQUIRED');
        const p = req.person; const id = p.id || 'p' + Date.now().toString(36);
        const i = db.people.findIndex((x) => x.id === id);
        const v = { id, name: String(p.name).trim(), active: p.active !== false, joinDate: p.joinDate || '', tools: p.tools === true };
        if (!v.name) fail('Name is required');
        if (i >= 0) db.people[i] = v; else db.people.push(v);
        save(); return { ok: true, people: db.people };
      }
      case 'saveCategory': {
        if (!admin) fail('ADMIN_LOGIN_REQUIRED');
        const c = req.category; const id = c.id || 'c' + Date.now().toString(36);
        const i = db.cats.findIndex((x) => x.id === id);
        const v = { id, name: String(c.name).trim(), icon: c.icon, active: c.active !== false, order: i >= 0 ? db.cats[i].order : db.cats.length };
        if (!v.name) fail('Name is required');
        if (i >= 0) db.cats[i] = v; else db.cats.push(v);
        save(); return { ok: true, categories: db.cats };
      }
      case 'importSeed': {
        if (!admin) fail('ADMIN_LOGIN_REQUIRED');
        const have = new Set(db.tx.map((t) => t.id));
        const add = (req.txns || []).filter((t) => !have.has(t.id)).map((t) => ({ ...t, deleted: false }));
        db.tx.push(...add); audit('admin', 'import', '', add.length + ' entries'); save();
        return { ok: true, added: add.length };
      }
      case 'deleteCategory':
        if (!admin) fail('ADMIN_LOGIN_REQUIRED');
        if (db.tx.some((t) => t.category === req.id && !t.deleted)) fail('This category has entries, so it can only be hidden. Edit it and switch off "Show in the entry form".');
        db.cats = db.cats.filter((c) => c.id !== req.id); save(); return { ok: true, categories: db.cats };
      case 'attendance': { const m = req.month || nowDate().slice(0, 7); return { ok: true, month: m, today: nowDate(), attStart: attStart(), attendance: db.att.filter((a) => !a.deleted && a.date.slice(0, 7) === m), holidays: db.hol.filter((h) => h.date.slice(0, 7) === m), people: db.people }; }
      case 'markAttendance': {
        const p = db.people.find((x) => x.id === req.person && x.active); if (!p) fail('Unknown person');
        const d = nowDate();
        const ex = db.att.find((a) => !a.deleted && a.person === p.id && a.date === d);
        if (ex) fail(`${p.name.split(' ')[0]} was already marked ${ex.status === 'half' ? 'half day' : 'present'}.`);
        const row = { id: crypto.randomUUID(), date: d, person: p.id, status: req.status === 'half' ? 'half' : 'present', time: new Date().toISOString(), by: actor, note: '', editedBy: '', editedAt: '', deleted: false };
        db.att.push(row); audit(actor, 'attendance', p.id, d + ' ' + row.status); save(); return { ok: true, entry: row };
      }
      case 'makeHalfDay': {
        const a = db.att.find((x) => x.id === req.id); if (!a) fail('Entry not found');
        if (!role) { if (a.date !== nowDate()) fail('Only today’s entry can be changed. Ask HR or the admin.'); if (actor !== a.person && actor !== a.by) fail('You can only change your own entry.'); }
        a.status = 'half'; a.editedBy = actor; a.editedAt = new Date().toISOString(); save(); return { ok: true, entry: a };
      }
      case 'hrLogin':
        if (!db.hrPin) fail('HR login is not set up yet. The admin can create an HR PIN in Settings.');
        if (req.pin !== db.hrPin) fail('Wrong PIN');
        return { ok: true, token: 'hr.mock.' + db.hrPin };
      case 'hrData': {
        needHR();
        const att = db.att.filter((a) => (!req.from || a.date >= req.from) && (!req.to || a.date <= req.to));
        const canSalary = role === 'admin' || db.hrSalary;
        const out = { ok: true, role, today: nowDate(), attStart: attStart(), attendance: att, people: db.people, canSalary, hrCanSeeSalary: db.hrSalary, hasHrPin: !!db.hrPin,
          holidays: db.hol.filter((h) => (!req.from || h.date >= req.from) && (!req.to || h.date <= req.to)),
          overtime: db.adj.filter((x) => !x.deleted && x.kind === 'overtime').map((x) => (canSalary ? x : { ...x, amount: 0 })) };
        if (canSalary) Object.assign(out, { rules: db.rules, adjustments: db.adj.filter((x) => !x.deleted), payroll: db.payroll });
        return out;
      }
      case 'setAttendance': {
        needHR();
        if (req.date > nowDate()) fail('Can’t mark a future date');
        const cur = db.att.find((a) => !a.deleted && a.person === req.person && a.date === req.date);
        const now = new Date().toISOString();
        if (cur) { if (req.status === 'none') cur.deleted = true; else cur.status = req.status; cur.editedBy = role; cur.editedAt = now; if (req.note) cur.note = req.note; }
        else if (req.status !== 'none') db.att.push({ id: crypto.randomUUID(), date: req.date, person: req.person, status: req.status, time: '', by: role, note: req.note || '', editedBy: role, editedAt: now, deleted: false });
        audit(role, 'set attendance', req.person, req.date + ' → ' + req.status); save(); return { ok: true };
      }
      case 'setHrAccess':
        if (!admin) fail('ADMIN_LOGIN_REQUIRED');
        if (req.pin) { if (req.pin === db.pin) fail('Use a different PIN from yours'); db.hrPin = req.pin; }
        if (req.removePin) db.hrPin = '';
        if (req.canSeeSalary != null) db.hrSalary = !!req.canSeeSalary;
        save(); return { ok: true, hasHrPin: !!db.hrPin, hrCanSeeSalary: db.hrSalary };
      case 'saveRule': {
        if (!admin) fail('ADMIN_LOGIN_REQUIRED');
        const r = req.rule; if (!/^\d{4}-\d{2}$/.test(r.from)) fail('Pick the month this starts from'); if (!(r.base >= 0)) fail('Enter the monthly salary');
        db.rules = db.rules.filter((x) => !(x.person === r.person && x.from === r.from)).concat([{ ...r }]); save(); return { ok: true, rules: db.rules };
      }
      case 'deleteRule': if (!admin) fail('ADMIN_LOGIN_REQUIRED'); db.rules = db.rules.filter((x) => !(x.person === req.person && x.from === req.from)); save(); return { ok: true, rules: db.rules };
      case 'saveHoliday': {
        needHR(); const h = req.holiday;
        if (!h.date) fail('Pick a date'); if (!String(h.name || '').trim()) fail('Give the holiday a name');
        db.hol = db.hol.filter((x) => x.date !== h.date).concat([{ id: crypto.randomUUID(), date: h.date, name: h.name.trim(), kind: h.kind === 'company' ? 'company' : 'festival', by: role }]);
        save(); return { ok: true };
      }
      case 'deleteHoliday': needHR(); db.hol = db.hol.filter((x) => x.id !== req.id); save(); return { ok: true };
      case 'saveAdjustment': {
        needHR();
        const a = req.adjustment;
        if (role === 'hr') { if (a.kind !== 'overtime') fail('Only the admin can add bonus, deductions or advances'); a.amount = 0; } if (!(a.days > 0) && !(a.amount > 0) && !a.deleted) fail('Enter days or an amount');
        db.adj = db.adj.filter((x) => x.id !== a.id).concat([{ ...a }]); save(); return { ok: true };
      }
      case 'setAttStart': if (!admin) fail('ADMIN_LOGIN_REQUIRED'); db.attStart = req.date; save(); return { ok: true, attStart: req.date };
      case 'setPayroll': {
        if (!admin) fail('ADMIN_LOGIN_REQUIRED');
        const p = req.payroll; db.payroll = db.payroll.filter((x) => !(x.month === p.month && x.person === p.person)).concat([{ month: p.month, person: p.person, status: p.status, paidOn: p.status === 'paid' ? nowDate() : '', net: p.net, note: '' }]);
        save(); return { ok: true };
      }
      case 'saveCount':
        if (!admin) fail('ADMIN_LOGIN_REQUIRED');
        db.counts.push({ ...req.count, createdAt: new Date().toISOString() }); save();
        return { ok: true, counts: db.counts };
      default: fail('Unknown action');
    }
  };
})();
