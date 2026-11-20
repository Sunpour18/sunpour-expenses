/* Sunpour Expenses — salary from attendance.
   All money is worked out in paise (whole numbers); only the final pay is rounded to the rupee.

   Per person, per month:
     day rate      = monthly salary ÷ days in that month (every calendar day counts)
     leaves        = days so far − holidays not worked − (present days + ½ × half days)
     extra leaves  = leaves above the paid-leave allowance → deducted at the day rate
     auto overtime = (only if switched on for that person) unused paid leaves × day rate
     adjustments   = overtime (days × day rate and/or an amount), bonus, deduction, salary advance
   Someone who joins mid-month gets salary and paid leaves for the days from joining. */
(function (root) {
  const pad = (n) => String(n).padStart(2, '0');
  const daysIn = (month) => { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const dayStr = (month, d) => `${month}-${pad(d)}`;

  function ruleFor(rules, person, month) {
    return rules.filter((r) => r.person === person && r.from <= month).sort((a, b) => b.from.localeCompare(a.from))[0] || null;
  }

  /**
   * @param {object} o {person, joinDate?, month 'YYYY-MM', today 'YYYY-MM-DD', rules[], attendance[], adjustments[]}
   */
  function compute(o) {
    const { person, month, today } = o;
    const rule = ruleFor(o.rules || [], person, month);
    const D = daysIn(month);
    const first = dayStr(month, 1), last = dayStr(month, D);
    const res = { person, month, days: D, rule, lines: [], status: last < today ? 'complete' : first > today ? 'future' : 'running' };
    if (!rule) { res.noRule = true; return res; }

    const join = o.joinDate && o.joinDate > first ? o.joinDate : first;
    // attendance is only counted from the day tracking started (earlier days are not treated as leave)
    const track = o.trackFrom && o.trackFrom > join ? o.trackFrom : join;
    if (join > last) { res.notJoined = true; return res; }
    const startDay = Number(join.slice(8, 10));
    const eligibleDays = D - startDay + 1;

    const att = (o.attendance || []).filter((a) => a.person === person && !a.deleted && a.date >= track && a.date <= last && a.date <= today);
    const markedToday = att.some((a) => a.date === today);
    // days counted so far: whole month when complete, otherwise up to yesterday (today too once marked)
    let countTo = last;
    if (res.status === 'running') countTo = markedToday ? today : dayBefore(today);
    const trackDay = track > last ? D + 1 : Number(track.slice(8, 10));
    const elapsed = res.status === 'future' ? 0 : Math.max(0, countTo < track ? 0 : Number(countTo.slice(8, 10)) - trackDay + 1);

    // festival/company holidays with no attendance entry are neither leave nor worked
    const marked = new Set(att.map((a) => a.date));
    const holidays = res.status === 'future' ? 0 : [...new Set((o.holidays || []).map((h) => (typeof h === 'string' ? h : h.date)))]
      .filter((d) => d >= track && d <= countTo && !marked.has(d)).length;
    const present = att.filter((a) => a.status !== 'half' && a.date <= countTo).length;
    const half = att.filter((a) => a.status === 'half' && a.date <= countTo).length;
    const worked = present + half / 2;
    const leaves = Math.max(0, elapsed - holidays - worked);
    const allowance = eligibleDays === D ? rule.paidLeaves : Math.round((rule.paidLeaves * eligibleDays / D) * 2) / 2;

    const basePaise = Math.round(rule.base * 100);
    const dayRate = basePaise / D; // fractional paise kept until each line is rounded
    const baseEarned = eligibleDays === D ? basePaise : Math.round(dayRate * eligibleDays);
    const extraLeaves = Math.max(0, leaves - allowance);
    const unused = Math.max(0, allowance - leaves);

    Object.assign(res, { trackFrom: track !== join ? track : '', holidays, dayRate, eligibleDays, elapsed, present, half, worked, leaves, allowance, extraLeaves, unused, joinDate: join !== first ? join : '' });

    const add = (key, label, paise, detail) => { if (paise) res.lines.push({ key, label, paise: Math.round(paise), detail }); };
    add('base', 'Monthly salary', baseEarned, eligibleDays === D ? `${fmtR(basePaise)} for ${D} days` : `${eligibleDays} of ${D} days (joined ${join})`);
    if (rule.autoOvertime) add('autoOT', 'Overtime (unused leaves)', unused * dayRate, `${num(unused)} × ${fmtR(dayRate)}${res.status === 'running' ? ' if no more leaves' : ''}`);
    add('leaveCut', 'Extra leaves', -extraLeaves * dayRate, `${num(extraLeaves)} × ${fmtR(dayRate)}`);

    for (const a of (o.adjustments || []).filter((x) => x.person === person && x.month === month && !x.deleted)) {
      const amt = Math.round((Number(a.amount) || 0) * 100);
      const dayPart = (Number(a.days) || 0) * dayRate;
      const label = { overtime: 'Overtime', bonus: 'Bonus', deduction: 'Deduction', advance: 'Salary advance' }[a.kind];
      const sign = a.kind === 'deduction' || a.kind === 'advance' ? -1 : 1;
      const detail = [a.days ? `${num(a.days)} × ${fmtR(dayRate)}` : '', a.days && amt ? '+' : '', amt ? fmtR(amt) : '', a.note ? `· ${a.note}` : ''].filter(Boolean).join(' ');
      res.lines.push({ key: 'adj', id: a.id, kind: a.kind, label, paise: sign * Math.round(dayPart + amt), detail });
    }
    const exact = res.lines.reduce((s, l) => s + l.paise, 0);
    res.net = Math.round(exact / 100) * 100; // to the rupee
    res.rounding = res.net - exact;
    return res;
  }

  function dayBefore(s) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d - 1); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; }
  const num = (n) => (Math.round(n * 10) / 10).toString();
  function fmtR(p) {
    const r = p / 100;
    return '₹' + r.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(Math.round(r * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 });
  }

  const api = { compute, ruleFor, daysIn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Payroll = api;
})(typeof window !== 'undefined' ? window : globalThis);
