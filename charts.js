/* Sunpour Expenses — small SVG chart kit (donut, stacked bars, split bar).
   Colors come from CSS variables so light/dark both work. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let tip;
  function tooltip() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-tip';
      tip.setAttribute('role', 'status');
      document.body.appendChild(tip);
    }
    return tip;
  }
  function showTip(html, x, y) {
    const t = tooltip();
    t.innerHTML = html;
    t.style.opacity = '1';
    const r = t.getBoundingClientRect();
    let left = x + 14, top = y - r.height - 10;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top < 8) top = y + 16;
    t.style.transform = `translate(${Math.max(8, left)}px, ${top}px)`;
  }
  function hideTip() { if (tip) tip.style.opacity = '0'; }
  function bindTips(root) {
    root.querySelectorAll('[data-tip]').forEach((el) => {
      const show = (e) => {
        const p = e.touches ? e.touches[0] : e;
        showTip(el.getAttribute('data-tip'), p.clientX, p.clientY);
        root.querySelectorAll('.is-hot').forEach((h) => h.classList.remove('is-hot'));
        // light up what this mark belongs to: a whole column (data-col) or one series/slice (data-key)
        const col = el.getAttribute('data-col');
        const key = el.getAttribute('data-key');
        const sel = col != null ? `[data-col="${col}"]` : key ? `[data-key="${key}"]` : null;
        let lit = 0;
        if (sel) root.querySelectorAll(sel).forEach((h) => { if (!h.classList.contains('hit')) { h.classList.add('is-hot'); lit++; } });
        root.classList.toggle('has-hot', lit > 0); // nothing to light (an empty week): don't dim the rest
      };
      el.addEventListener('pointermove', show);
      el.addEventListener('pointerdown', show);
      el.addEventListener('pointerleave', () => {
        hideTip();
        root.classList.remove('has-hot');
        root.querySelectorAll('.is-hot').forEach((h) => h.classList.remove('is-hot'));
      });
    });
  }
  window.addEventListener('scroll', hideTip, { passive: true });

  /* Donut: items [{key,label,value,color}] in fixed order. */
  function donut(el, items, opts = {}) {
    const total = items.reduce((s, i) => s + i.value, 0);
    const size = 220, r = 92, w = 26, c = size / 2;
    let html = `<svg viewBox="0 0 ${size} ${size}" class="donut" role="img" aria-label="${esc(opts.label || 'Breakdown')}">`;
    html += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${w}"/>`;
    if (total > 0) {
      let a0 = -Math.PI / 2;
      const gap = items.filter((i) => i.value > 0).length > 1 ? 0.018 : 0;
      for (const it of items) {
        if (!(it.value > 0)) continue;
        const frac = it.value / total;
        const a1 = a0 + frac * Math.PI * 2;
        const s = a0 + gap / 2, e = a1 - gap / 2;
        if (e > s) {
          const large = e - s > Math.PI ? 1 : 0;
          const p = (a) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
          const d = frac >= 0.9999
            ? `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c - 0.01} ${c - r}`
            : `M ${p(s)} A ${r} ${r} 0 ${large} 1 ${p(e)}`;
          const pct = Math.round(frac * 1000) / 10;
          html += `<path d="${d}" fill="none" stroke="${it.color}" stroke-width="${w}" class="seg" data-key="${esc(it.key)}"
            data-tip="<b>${esc(it.label)}</b><br>${esc(opts.fmt(it.value))} · ${pct}%"/>`;
        }
        a0 = a1;
      }
    }
    html += `<text x="${c}" y="${c - 4}" text-anchor="middle" class="donut-num">${esc(opts.center || opts.fmt(total))}</text>`;
    html += `<text x="${c}" y="${c + 18}" text-anchor="middle" class="donut-cap">${esc(opts.caption || 'total')}</text></svg>`;
    el.innerHTML = html;
    bindTips(el);
  }

  /* Stacked columns: groups [{label, sub, values:{seriesKey:value}}], series [{key,label,color}] */
  function columns(el, groups, series, opts = {}) {
    const W = Math.max(320, el.clientWidth || 600), H = opts.height || 220;
    const padL = 44, padR = 8, padT = 14, padB = 34;
    const totals = groups.map((g) => series.reduce((s, se) => s + (g.values[se.key] || 0), 0));
    const max = niceMax(Math.max(1, ...totals));
    const ih = H - padT - padB, iw = W - padL - padR;
    const step = iw / Math.max(1, groups.length);
    const bw = Math.min(46, step * 0.56);
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" class="cols" role="img" aria-label="${esc(opts.label || 'Spending over time')}">`;
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, y = padT + ih - (v / max) * ih;
      svg += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" class="grid${i === 0 ? ' base' : ''}"/>`;
      svg += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" class="axis">${esc(opts.short(v))}</text>`;
    }
    groups.forEach((g, gi) => {
      const x = padL + step * gi + (step - bw) / 2;
      let y = padT + ih;
      const parts = series.filter((se) => (g.values[se.key] || 0) > 0);
      parts.forEach((se, pi) => {
        const v = g.values[se.key];
        const h = (v / max) * ih;
        const top = pi === parts.length - 1;
        const hh = Math.max(0, h - (pi > 0 ? 2 : 0));
        y -= h;
        const rr = top ? Math.min(4, hh) : 0;
        svg += `<path class="bar" data-col="${gi}" data-key="${esc(se.key)}" fill="${se.color}" d="${roundTop(x, y + (pi > 0 ? 0 : 0), bw, hh, rr)}"
          data-tip="<b>${esc(g.label)}</b>${g.sub ? ' · ' + esc(g.sub) : ''}<br>${esc(se.label)}: ${esc(opts.fmt(v))}<br><span class=muted>Total ${esc(opts.fmt(totals[gi]))}</span>"/>`;
      });
      // hit target over full column for empty/short bars
      svg += `<rect x="${padL + step * gi}" y="${padT}" width="${step}" height="${ih}" fill="transparent" data-col="${gi}"
        data-tip="<b>${esc(g.label)}</b>${g.sub ? ' · ' + esc(g.sub) : ''}<br>${series.map((se) => `${esc(se.label)}: ${esc(opts.fmt(g.values[se.key] || 0))}`).join('<br>')}<br><span class=muted>Total ${esc(opts.fmt(totals[gi]))}</span>" class="hit"/>`;
      const showLabel = groups.length <= 12 || gi % Math.ceil(groups.length / 12) === 0;
      if (showLabel) svg += `<text x="${padL + step * gi + step / 2}" y="${H - 12}" text-anchor="middle" class="axis">${esc(g.label)}</text>`;
    });
    svg += '</svg>';
    el.innerHTML = svg;
    // keep the bars above the hit layer visually but let hits catch hover
    el.querySelectorAll('.hit').forEach((h) => h.parentNode.appendChild(h));
    bindTips(el);
  }

  function roundTop(x, y, w, h, r) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  }

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  }

  /* Horizontal split bar: items [{key,label,value,color}] */
  function split(el, items, opts = {}) {
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    el.innerHTML = `<div class="split" role="img" aria-label="${esc(opts.label || 'Split')}">${items
      .filter((i) => i.value > 0)
      .map((i) => `<span class="split-seg" data-key="${esc(i.key)}" style="flex:${i.value};background:${i.color}"
        data-tip="<b>${esc(i.label)}</b><br>${esc(opts.fmt(i.value))} · ${Math.round((i.value / total) * 100)}%"></span>`)
      .join('')}</div>`;
    bindTips(el);
  }

  window.Charts = { donut, columns, split, hideTip };
})();
