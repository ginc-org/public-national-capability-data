// ginc-capability-table.js
(() => {
  const DEFAULT_CSV_URL = "https://ginc-org.github.io/public-national-capability-data/ginc-pillar-ratings.csv";
  const WIDGET_SELECTOR = '[data-widget="capability-table"]';
  const BASE_COUNTRY_URL = "https://www.ginc.org/";

  // --- Styles: plain table, no borders; add subtle rating separators ---
  const injectStyles = () => {
    if (document.getElementById("ginc-capability-table-styles")) return;
    const css = `
      .ginc-cap-table { width: 100%; border-collapse: collapse; font-size: 1.5rem; }
      .ginc-cap-table th, .ginc-cap-table td { padding: 6px 10px; vertical-align: top; }
      .ginc-cap-table thead th { text-align: left; font-weight: 600; text-transform: uppercase;}
      .ginc-cap-error { color: #b00020; }
      .ginc-cap-sep td {
        padding: 6px 10px;
        font-weight: 600;
        color: #333;
        background: #f5f5f5; /* light grey background */
      }
      /* intentionally no borders or zebra striping */
    `;
    const style = document.createElement("style");
    style.id = "ginc-capability-table-styles";
    style.textContent = css;
    document.head.appendChild(style);
  };

  // --- CSV parsing (robust for quotes/commas/newlines) ---
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
          if (next === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        } else { field += char; i++; continue; }
      } else {
        if (char === '"') { inQuotes = true; i++; continue; }
        if (char === ",") { pushField(); i++; continue; }
        if (char === "\r") { i++; continue; }
        if (char === "\n") { pushField(); pushRow(); i++; continue; }
        field += char; i++; continue;
      }
    }
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

  // --- Utils ---
  const ci = (s = "") => s.trim().toLowerCase();
  const pickKey = (obj, candidates) => {
    const map = Object.keys(obj).reduce((acc, k) => { acc[ci(k)] = k; return acc; }, {});
    for (const c of candidates) {
      const k = map[ci(c)];
      if (k) return k;
    }
    return null;
  };
  const escapeHTML = (v) => String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  // Country cell: emoji + space + linked country name (name only is linked)
  const buildCountryHTML = (row, k) => {
    const emoji = (row[k.emojiK] || "").trim();
    const name  = (row[k.nameK]  || "").trim();
    const slug  = (row[k.slugK]  || "").trim().replace(/^\/+/, "");
    const flagPart = emoji ? `${escapeHTML(emoji)} ` : "";
    if (slug) {
      // Note: slug is appended as-is (encoded) after BASE_COUNTRY_URL
      const url = BASE_COUNTRY_URL + encodeURIComponent(slug);
      return `${flagPart}<a href="${url}">${escapeHTML(name)}</a>`;
    }
    return `${flagPart}${escapeHTML(name)}`;
  };

  // --- Rendering ---
  const renderError = (mount, message) => {
    mount.innerHTML = `<div class="ginc-cap-table ginc-cap-error">Error: ${escapeHTML(message)}</div>`;
  };

  const renderTable = (mount, rows, pillar, keys) => {
    mount.innerHTML = "";

    const table = document.createElement("table");
    table.className = "ginc-cap-table";

    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    ["Country", "Rating", "Outlook", "Date"].forEach(col => {
      const th = document.createElement("th");
      th.textContent = col;
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    // Insert a rating separator row whenever Rating changes while iterating sorted rows
    let lastRating = null;
    rows.forEach(row => {
      const thisRating = (row[keys.ratingK] || "").trim();
      if (thisRating !== lastRating) {
        const sep = document.createElement("tr");
        sep.className = "ginc-cap-sep";
        const td = document.createElement("td");
        td.colSpan = 4;
        td.textContent = thisRating || "Unrated";
        sep.appendChild(td);
        tbody.appendChild(sep);
        lastRating = thisRating;
      }

      const tr = document.createElement("tr");

      // Country
      const tdCountry = document.createElement("td");
      tdCountry.innerHTML = buildCountryHTML(row, keys);
      tr.appendChild(tdCountry);

      // Rating
      const tdRating = document.createElement("td");
      tdRating.textContent = row[keys.ratingK] ?? "";
      tr.appendChild(tdRating);

      // Outlook
      const tdOutlook = document.createElement("td");
      tdOutlook.textContent = row[keys.outlookK] ?? "";
      tr.appendChild(tdOutlook);

      // Date
      const tdDate = document.createElement("td");
      tdDate.textContent = row[keys.dateK] ?? "";
      tr.appendChild(tdDate);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    mount.appendChild(table);
  };

  // --- Init per element ---
  const initOne = async (el) => {
    const pillar = (el.getAttribute("data-pillar") || "").trim();
    const csvUrl = (el.getAttribute("data-src") || DEFAULT_CSV_URL).trim();

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

      // Column keys as per provided CSV headers
      const sample   = objects[0];
      const pillarK  = pickKey(sample, ["pillar"]);
      const emojiK   = pickKey(sample, ["country_emoji"]);
      const nameK    = pickKey(sample, ["country_name"]);
      const slugK    = pickKey(sample, ["country_slug"]);
      const ratingK  = pickKey(sample, ["rating"]);
      const outlookK = pickKey(sample, ["outlook"]);
      const dateK    = pickKey(sample, ["date"]);
      const scoreK   = pickKey(sample, ["score"]);

      if (!pillarK) return renderError(el, "CSV missing 'pillar' column.");
      if (!nameK)   return renderError(el, "CSV missing 'country_name' column.");
      if (!ratingK) return renderError(el, "CSV missing 'rating' column.");
      if (!scoreK)  return renderError(el, "CSV missing 'score' column.");

      // Filter by pillar
      const filtered = objects.filter(o => ci(o[pillarK]) === ci(pillar));
      if (!filtered.length) {
        renderError(el, `No rows found for pillar: "${pillar}".`);
        return;
      }

      // Sort by numeric 'score' descending
      const ordered = [...filtered].sort((a, b) => {
        const an = parseFloat(String(a[scoreK]).replace(/[^0-9.\-]/g, ""));
        const bn = parseFloat(String(b[scoreK]).replace(/[^0-9.\-]/g, ""));
        const av = Number.isFinite(an) ? an : -Infinity;
        const bv = Number.isFinite(bn) ? bn : -Infinity;
        return bv - av;
      });

      // Render table with rating separators
      const keys = { emojiK, nameK, slugK, ratingK, outlookK, dateK };
      renderTable(el, ordered, pillar, keys);

    } catch (err) {
      renderError(el, err.message || String(err));
    }
  };

  // --- Boot ---
  const init = () => {
    injectStyles();
    document.querySelectorAll(WIDGET_SELECTOR).forEach(initOne);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();