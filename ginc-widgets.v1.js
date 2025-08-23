// /assets/js/ginc-widgets.v1.js
(function (root) {
  const state = { cache: null, opts: null };

  async function loadCSV(url) {
    if (state.cache) return state.cache;
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`CSV ${res.status}`);
    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
    if (parsed.errors?.length) console.warn('[GINC] CSV parse issues:', parsed.errors);
    state.cache = parsed.data;
    return state.cache;
  }

  // ---- Mini “API” over the CSV
  const api = {
    async all() { return await loadCSV(state.opts.dataUrl); },
    async byISOList(isos) {
      const all = await this.all();
      const set = new Set(isos.map(x => x.toUpperCase()));
      return all.filter(r => set.has((r.ISO || '').toUpperCase()));
    },
    groupBy(rows, key) {
      return rows.reduce((m, r) => ((m[r[key]] ??= []).push(r), m), {});
    }
  };

  // ---- Rendering helpers
  function cssOnce() {
    if (document.getElementById('ginc-widgets-css')) return;
    const s = document.createElement('style');
    s.id = 'ginc-widgets-css';
    s.textContent = `
      .ginc-card{border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.04);margin:1rem 0}
      .ginc-title{background:#f8fafc;padding:12px 14px;font-weight:800}
      .ginc-table{width:100%;border-collapse:collapse;table-layout:auto}
      .ginc-table th,.ginc-table td{padding:10px 12px;border-top:1px solid #e5e7eb;vertical-align:top;text-align:left}
      .ginc-table thead th{background:#fbfdff;color:#475569;text-transform:uppercase;font-size:12px;letter-spacing:.06em}
      .ginc-sec{font-weight:900;letter-spacing:.02em}
      .ginc-grp{font-weight:800}
      .ginc-hard{background:#d6e3f6}
      .ginc-soft{background:#f0d97e}
      .ginc-econ{background:#dab8ff}
      .ginc-hard-row{background:#e7eef9}
      .ginc-soft-row{background:#f6e8b1}
      .ginc-econ-row{background:#ead6ff}
    `;
    document.head.appendChild(s);
  }

  function sectionClass(section) {
    if (/hard/i.test(section)) return ['ginc-hard','ginc-hard-row'];
    if (/soft/i.test(section)) return ['ginc-soft','ginc-soft-row'];
    return ['ginc-econ','ginc-econ-row'];
  }

  function renderCapabilityTable(el, rows, isos) {
    cssOnce();
    const wrapper = document.createElement('div');
    wrapper.className = 'ginc-card';
    const title = document.createElement('div');
    title.className = 'ginc-title';
    title.textContent = `National Capability — ${isos.join(', ')}`;
    wrapper.appendChild(title);

    const tbl = document.createElement('table');
    tbl.className = 'ginc-table';
    // Dynamic columns per ISO
    const theadRow = `<tr>
      <th>Component</th>
      ${isos.map(iso => `<th>${iso} Rating</th><th>${iso} Outlook</th><th>${iso} Date</th>`).join('')}
    </tr>`;
    tbl.innerHTML = `<thead>${theadRow}</thead><tbody></tbody>`;
    const tb = tbl.querySelector('tbody');

    // Group rows by Section -> Group -> Component
    const grouped = api.groupBy(rows, 'Section');
    for (const section of ['Hard Capability','Soft Capability','Economic Capability']) {
      const [secCls] = sectionClass(section);
      const secTr = document.createElement('tr');
      secTr.className = `ginc-sec ${secCls}`;
      secTr.innerHTML = `<td colspan="${1 + isos.length * 3}">${section.toUpperCase()}</td>`;
      tb.appendChild(secTr);

      const perGroup = api.groupBy((grouped[section]||[]), 'Group');
      for (const groupName of Object.keys(perGroup)) {
        const [, rowCls] = sectionClass(section);
        const grpTr = document.createElement('tr');
        grpTr.className = `ginc-grp ${rowCls}`;
        grpTr.innerHTML = `<td colspan="${1 + isos.length * 3}">${groupName}</td>`;
        tb.appendChild(grpTr);

        // Group by Component + ISO
        const byComponent = api.groupBy(perGroup[groupName], 'Component');
        for (const comp of Object.keys(byComponent)) {
          const tr = document.createElement('tr');
          tr.className = rowCls;
          let tds = `<td>${comp}</td>`;
          for (const iso of isos) {
            const record = byComponent[comp].find(r => (r.ISO || '').toUpperCase() === iso);
            tds += `<td>${record?.Rating ?? ''}</td><td>${record?.Outlook ?? ''}</td><td>${record?.Date ?? ''}</td>`;
          }
          tr.innerHTML = tds;
          tb.appendChild(tr);
        }
      }
    }
    wrapper.appendChild(tbl);
    el.replaceWith(wrapper);
  }

  async function bootOne(el) {
    const widget = (el.getAttribute('data-widget') || '').toLowerCase();
    const isos = (el.getAttribute('data-iso') || '')
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
    if (!isos.length) {
      console.warn('[GINC] Missing data-iso on element', el);
      return;
    }
    const rows = await api.byISOList(isos);

    switch (widget) {
      case 'capability-table':
        renderCapabilityTable(el, rows, isos);
        break;
      default:
        renderCapabilityTable(el, rows, isos);
    }
  }

  const GINC = {
    init(opts) {
      state.opts = Object.assign({ dataUrl: '/assets/data/capability.csv' }, opts || {});
      document.querySelectorAll('[data-widget]').forEach(
        el => bootOne(el).catch(err => console.error('[GINC] render error', err))
      );
    },
    api
  };

  root.GINC = GINC;
})(window);