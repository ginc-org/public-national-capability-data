(() => {
  const DEFAULT_CSV_URL = "https://ginc-org.github.io/public-national-capability-data/ginc-pillar-ratings.csv";
  const WIDGET_SELECTOR = '[data-widget="capability-table"]';
  const PREFERRED_COLUMNS = ["Name", "Rating", "Outlook", "Date"]; // used if available
  const HIDE_COLUMNS = ["Pillar"]; // usually internal filter

  // Minimal, clean styles injected once
  const injectStyles = () => {
    if (document.getElementById("ginc-capability-table-styles")) return;
    const css = `
      .ginc-cap-table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
      .ginc-cap-table th, .ginc-cap-table td { padding: 8px 10px; vertical-align: top; }
      .ginc-cap-table thead th { text-align: left; font-weight: 600; cursor: pointer; user-select: none; }
      .ginc-cap-table thead th[aria-sort="ascending"]::after { content: " ↑"; }
      .ginc-cap-table thead th[aria-sort="descending"]::after { content: " ↓"; }
      .ginc-cap-table tbody tr:nth-child(even) { background: rgba(0,0,0,0.03); }
      .ginc-cap-table .ginc-cap-error { color: #b00020; }
      .ginc-cap-table-caption { margin: 6px 0 16px; color: #666; font-size: 0.9rem; }
    `;
    const style = document.createElement("style");
    style.id = "ginc-capability-table-styles";
    style.textContent = css;
    document.head.appendChild(style);
  };

  // Robust CSV parser (handles quotes, commas, newlines)
  const parseCSV = (csvText) => {
    const rows = [];
    let i = 0, field = "", row = [], inQuotes = false;

    const pushField = () => { row.push(field); field = ""; };
    const pushRow = () => { rows.push(row); row = []; };

    while (i < csvText.length) {
      const char = csvText[i];

      if (inQuotes) {
        if (char === '"') {
          const next = csvText[i + 1];
          if (next === '"') { field += '"'; i += 2; continue; } // escaped quote
          inQuotes = false; i++; continue;
        } else {
          field += char; i++; continue;
        }
      } else { // not in quotes
        if (char === '"') { inQuotes = true; i++; continue; }
        if (char === ",") { pushField(); i++; continue; }
        if (char === "\r") { i++; continue; } // ignore CR
        if (char === "\n") { pushField(); pushRow(); i++; continue; }
        field += char; i++; continue;
      }
    }
    // trailing field/row
    pushField();
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) pushRow();
    return rows;
  };

  const toObjects = (rows) => {
    if (!rows || rows.length === 0) return [];
    const header = rows[0].map(h => (h || "").trim());
    return rows.slice(1).map(r => {
      const obj = {};
      header.forEach((h, idx) => obj[h] = (r[idx] ?? "").trim());
      return obj;
    });
  };

  const ci = (s = "") => s.trim().toLowerCase();

  const pickColumns = (data, forcedList) => {
    if (!data || data.length === 0) return [];
    const allCols = Object.keys(data[0]);

    if (forcedList && forcedList.length) {
      const want = forcedList.map(c => c.trim()).filter(Boolean);
      const normalized = allCols.reduce((acc, c) => { acc[ci(c)] = c; return acc; }, {});
      return want.map(w => normalized[ci(w)]).filter(Boolean);
    }

    // If preferred present, use them in order; else all minus HIDE_COLUMNS
    const set = new Set(allCols.map(c => c));
    const preferred = PREFERRED_COLUMNS.filter(pc => set.has(pc));
    if (preferred.length) return preferred;

    return allCols.filter(c => !HIDE_COLUMNS.includes(c));
  };

  // Simple, stable sort
  const sortData = (data, column, dir = "asc") => {
    const multiplier = dir === "desc" ? -1 : 1;
    return [...data].sort((a, b) => {
      const av = a[column] ?? "";
      const bv = b[column] ?? "";

      // try numeric sort if both are numbers
      const an = parseFloat(av.replace(/[^0-9.\-]/g, ""));
      const bn = parseFloat(bv.replace(/[^0-9.\-]/g, ""));
      const aNum = !isNaN(an) && av.match(/^\s*[\d\.\-]+/);
      const bNum = !isNaN(bn) && bv.match(/^\s*[\d\.\-]+/);

      if (aNum && bNum) return (an < bn ? -1 : an > bn ? 1 : 0) * multiplier;

      // string compare
      return av.localeCompare(bv, undefined, { sensitivity: "base", numeric: true }) * multiplier;
    });
  };

  const renderTable = (mount, data, columns, titleText) => {
    mount.innerHTML = "";

    const caption = document.createElement("div");
    caption.className = "ginc-cap-table-caption";
    caption.textContent = titleText;
    mount.appendChild(caption);

    const table = document.createElement("table");
    table.className = "ginc-cap-table";

    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    columns.forEach(col => {
      const th = document.createElement("th");
      th.textContent = col;
      th.setAttribute("role", "columnheader");
      th.dataset.col = col;
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const drawBody = (rows) => {
      tbody.innerHTML = "";
      rows.forEach(row => {
        const tr = document.createElement("tr");
        columns.forEach(col => {
          const td = document.createElement("td");
          td.innerHTML = sanitizeCell(row[col]);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    };
    drawBody(data);
    table.appendChild(tbody);
    mount.appendChild(table);

    // Sorting handlers
    let sortState = { col: null, dir: "asc" };
    trHead.querySelectorAll("th").forEach(th => {
      th.addEventListener("click", () => {
        const col = th.dataset.col;
        let dir = "asc";
        if (sortState.col === col) dir = sortState.dir === "asc" ? "desc" : "asc";
        sortState = { col, dir };
        trHead.querySelectorAll("th").forEach(h => h.removeAttribute("aria-sort"));
        th.setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");
        drawBody(sortData(data, col, dir));
      });
    });
  };

  const sanitizeCell = (val) => {
    // allow simple links/flags already embedded; otherwise escape basic HTML characters
    if (/[<>]/.test(val)) return val; // trust CSV if it intentionally includes markup (e.g., emoji flags or anchors)
    return String(val)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  };

  const renderError = (mount, message) => {
    mount.innerHTML = `<div class="ginc-cap-table ginc-cap-error">Error: ${message}</div>`;
  };

  const initOne = async (el) => {
    const pillar = (el.getAttribute("data-pillar") || "").trim();
    const csvUrl = (el.getAttribute("data-src") || DEFAULT_CSV_URL).trim();
    const requestedColumns = (el.getAttribute("data-columns") || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    if (!pillar) {
      renderError(el, "Missing required attribute: data-pillar.");
      return;
    }

    try {
      const res = await fetch(csvUrl, { mode: "cors", cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch CSV (${res.status})`);
      const text = await res.text();
      const rows = parseCSV(text);
      const objects = toObjects(rows);

      if (!objects.length) {
        renderError(el, "No data found in CSV.");
        return;
      }

      // Find pillar column (case-insensitive)
      const pillarKey = Object.keys(objects[0]).find(k => ci(k) === "pillar");
      if (!pillarKey) {
        renderError(el, "CSV missing 'Pillar' column required for filtering.");
        return;
      }

      // Filter by pillar (case-insensitive equality)
      const filtered = objects.filter(o => ci(o[pillarKey]) === ci(pillar));
      if (!filtered.length) {
        renderError(el, `No rows found for pillar: "${pillar}".`);
        return;
      }

      const columns = pickColumns(filtered, requestedColumns);
      renderTable(el, filtered, columns, `${pillar} — ${filtered.length} countries`);
    } catch (err) {
      renderError(el, err.message || String(err));
    }
  };

  const init = () => {
    injectStyles();
    const nodes = document.querySelectorAll(WIDGET_SELECTOR);
    nodes.forEach(initOne);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();