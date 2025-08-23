Here’s the updated ginc-capability-table.js (only the widget code, as requested).
It renders a plain, borderless table with Country (emoji flag + space + country name), Rating, Outlook, Date, filters by the data-pillar, and orders rows by highest Score → lowest (Score is not rendered).

(() => {
  const DEFAULT_CSV_URL = "https://ginc-org.github.io/public-national-capability-data/ginc-pillar-ratings.csv";
  const WIDGET_SELECTOR = '[data-widget="capability-table"]';

  // Rating → fallback numeric score (if Score column missing)
  const RATING_SCORE = {
    "AAA": 20, "AA": 19, "A": 18,
    "BBB": 17, "BB": 16, "B": 15,
    "CCC": 14, "CC": 13, "C": 12,
    "DDD": 11, "DD": 10, "D": 9,
    "EEE": 8, "EE": 7, "E": 6,
    "FFF": 5, "FF": 4, "F": 3,
    "SP": 2, "LP": 1, "NP": 0
  };

  // Minimal, clean styles (plain table, no borders)
  const injectStyles = () => {
    if (document.getElementById("ginc-capability-table-styles")) return;
    const css = `
      .ginc-cap-table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
      .ginc-cap-table th, .ginc-cap-table td { padding: 8px 10px; vertical-align: top; }
      .ginc-cap-table thead th { text-align: left; font-weight: 600; }
      .ginc-cap-table-caption { margin: 6px 0 12px; color: #666; font-size: 0.9rem; }
      /* no borders, no zebra striping */
    `;
    const style = document.createElement("style");
    style.id = "ginc-capability-table-styles";
    style.textContent = css;
    document.head.appendChild(style);
  };

  // Robust CSV parser (quotes, commas, newlines)
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

  const ci = (s = "") => s.trim().toLowerCase();

  // Helpers to find column keys by case-insensitive name
  const pickKey = (obj, candidates) => {
    const map = Object.keys(obj).reduce((acc, k) => { acc[ci(k)] = k; return acc; }, {});
    for (const c of candidates) {
      const k = map[ci(c)];
      if (k) return k;
    }
    return null;
  };

  // Emoji flag from ISO-2 code (e.g., "US" → 🇺🇸)
  const iso2ToFlag = (code) => {
    if (!code || code.length !== 2) return "";
    const A = 127397; // 0x1F1E6 - 'A'
    const cc = code.toUpperCase();
    return String.fromCodePoint(cc.charCodeAt(0) + A, cc.charCodeAt(1) + A);
  };

  // Build "Country" cell: emoji flag + space + country name
  const buildCountryCell = (row, keys) => {
    const { nameK, countryK, flagK, iso2K } = keys;

    const rawName = (row[nameK] ?? row[countryK] ?? "").trim();
    const fromFlagCol = (flagK && row[flagK]) ? row[flagK].trim() : "";
    const fromIso2 = (iso2K && row[iso2K]) ? iso2ToFlag(row[iso2K].trim()) : "";

    // If the provided Name already starts with an emoji flag, respect it
    const looksLikeFlag = rawName && /\p{RI}\p{RI}/u.test(rawName.slice(0, 4));
    if (looksLikeFlag) return rawName;

    const flag = fromFlagCol || fromIso2 || "";
    return (flag ? `${flag} ` : "") + rawName;
  };

  // Determine numeric score for sorting: prefer Score column, else map Rating
  const getNumericScore = (row, keys) => {
    const { scoreK, ratingK } = keys;

    // Try numeric Score
    if (scoreK) {
      const val = parseFloat((row[scoreK] || "").replace(/[^0-9.\-]/g, ""));
      if (!Number.isNaN(val)) return val;
    }

    // Fallback to rating mapping
    const r = (row[ratingK] || "").toUpperCase().trim();
    if (r in RATING_SCORE) return RATING_SCORE[r];

    // Final fallback: 0
    return 0;
  };

  const renderError = (mount, message) => {
    mount.innerHTML = `<div class="ginc-cap-table ginc-cap-error">Error: ${message}</div>`;
  };

  const renderTable = (mount, rows, pillar, keys) => {
    mount.innerHTML = "";

    // Caption
    const caption = document.createElement("div");
    caption.className = "ginc-cap-table-caption";
    caption.textContent = `${pillar} — ${rows.length} countries`;
    mount.appendChild(caption);

    // Table
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
    rows.forEach(row => {
      const tr = document.createElement("tr");

      // Country (emoji flag + space + country name)
      const tdCountry = document.createElement("td");
      tdCountry.textContent = ""; // reset
      tdCountry.innerHTML = sanitizeCell(buildCountryCell(row, keys));
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

  const sanitizeCell = (val) => {
    if (/[<>]/.test(val)) return val; // trust if CSV intentionally includes markup
    return String(val)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  };

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

      // Identify column keys
      const sample = objects[0];
      const pillarK  = pickKey(sample, ["Pillar"]);
      if (!pillarK) {
        renderError(el, "CSV missing 'Pillar' column required for filtering.");
        return;
      }

      const nameK    = pickKey(sample, ["Name", "Country", "Country Name"]);
      const countryK = pickKey(sample, ["Country", "Country Name"]);
      const ratingK  = pickKey(sample, ["Rating"]);
      const outlookK = pickKey(sample, ["Outlook"]);
      const dateK    = pickKey(sample, ["Date", "Updated", "As Of"]);
      const scoreK   = pickKey(sample, ["Score", "Numeric Score", "Value"]); // optional
      const flagK    = pickKey(sample, ["Flag", "Emoji"]);
      const iso2K    = pickKey(sample, ["ISO2", "Alpha-2", "Code"]);

      if (!nameK && !countryK) {
        renderError(el, "CSV needs a 'Name' or 'Country' column.");
        return;
      }
      if (!ratingK) {
        renderError(el, "CSV missing 'Rating' column.");
        return;
      }

      // Filter by pillar
      const filtered = objects.filter(o => ci(o[pillarK]) === ci(pillar));
      if (!filtered.length) {
        renderError(el, `No rows found for pillar: "${pillar}".`);
        return;
      }

      // Sort by Score desc (fallback to Rating mapping)
      const keys = { nameK, countryK, ratingK, outlookK, dateK, scoreK, flagK, iso2K };
      const ordered = [...filtered].sort((a, b) => {
        const as = getNumericScore(a, keys);
        const bs = getNumericScore(b, keys);
        return bs - as; // descending
      });

      // Render table with fixed columns (Country, Rating, Outlook, Date)
      renderTable(el, ordered, pillar, keys);

    } catch (err) {
      renderError(el, err.message || String(err));
    }
  };

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