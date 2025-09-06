// ginc-capability-table.js
(() => {
  // ====== Config ======
  const FRAMEWORK_URL = "https://ginc-org.github.io/public-national-capability-data/ginc-framework.csv";
  const RATINGS_URL   = "https://ginc-org.github.io/public-national-capability-data/ginc-ratings.csv";
  const GEO_URL       = "https://ginc-org.github.io/public-national-capability-data/ginc-geo.csv";
  const ASSETS_URL    = "https://ginc-org.github.io/public-national-capability-data/ginc-assets.csv"; // NEW

  const WIDGET_SELECTOR = '[data-widget="ginc-capability-table"]';
  const BASE_COUNTRY_URL = "https://www.ginc.org/"; // + country_url (relative)

  // ====== Styles ======
  function injectStyles() {
    if (document.getElementById("ginc-capability-table-styles")) return;
    const css = `
      .ginc-cap-wrap { width:100%; }
      .ginc-cap-caption { margin:6px 0 12px; color:#666; font-size:.9rem; }
      .ginc-cap-table { width:100%; border-collapse:collapse; font-size:1.5rem; }
      .ginc-cap-table th, .ginc-cap-table td { padding:8px 10px; vertical-align:top; text-align:left; }
      .ginc-cap-table thead th { font-weight:600; }
      .ginc-cap-error { color:#b00020; padding:6px 0; }
      /* Country view hierarchy (no extra left indentation for subdomain/pillar) */
      .ginc-row--domain    td:first-child { font-weight:700; padding-top:14px; }
      .ginc-row--subdomain td:first-child { font-weight:600; }
      .ginc-row--pillar td:first-child {}
      .ginc-row--pillar td { border-bottom:1px solid rgba(0,0,0,.06); }
      /* Rating separator row for domain/subdomain/pillar tables */
      .ginc-cap-sep td { background:#f2f2f2; font-weight:700; padding:10px; }
    `;
    const style = document.createElement("style");
    style.id = "ginc-capability-table-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ====== CSV Parser ======
  const parseCSV = (csvText) => {
    const rows = [];
    let i = 0, field = "", row = [], inQuotes = false;
    const pushField = () => { row.push(field); field = ""; };
    const pushRow   = () => { rows.push(row); row = []; };
    while (i < csvText.length) {
      const ch = csvText[i];
      if (inQuotes) {
        if (ch === '"') {
          const nxt = csvText[i+1];
          if (nxt === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        } else { field += ch; i++; continue; }
      } else {
        if (ch === '"') { inQuotes = true; i++; continue; }
        if (ch === ",") { pushField(); i++; continue; }
        if (ch === "\r") { i++; continue; }
        if (ch === "\n") { pushField(); pushRow(); i++; continue; }
        field += ch; i++; continue;
      }
    }
    pushField();
    if (row.length && (row.length>1 || row[0] !== "")) pushRow();
    return rows;
  };
  const toObjects = (rows) => {
    if (!rows || !rows.length) return [];
    const header = rows[0].map(h => (h||"").trim());
    return rows.slice(1).map(r => {
      const o = {};
      header.forEach((h, i) => o[h] = (r[i] ?? "").trim());
      return o;
    });
  };

  // ====== Utils ======
  const ci = (s="") => s.trim().toLowerCase();
  const slug = (s="") => ci(s).replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  const safeNum = (v) => {
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g,""));
    return Number.isFinite(n) ? n : NaN;
  };
  const pickKey = (obj, candidates) => {
    if (!obj) return null;
    const map = Object.keys(obj).reduce((a,k)=>{a[ci(k)]=k; return a;}, {});
    for (const c of candidates) {
      const k = map[ci(c)];
      if (k) return k;
    }
    return null;
  };
  const titleize = (s="") => s.split(/[-_ ]+/).map(w=>w? w[0].toUpperCase()+w.slice(1): "").join(" ");
  const escapeHTML = (v) => String(v)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  const parseWhen = (v) => { const t = Date.parse(v || ""); return Number.isNaN(t) ? NaN : t; };
  const normalizeHex = (v) => {
    let s = (v||"").trim();
    if (!s) return "";
    if (/^[0-9a-fA-F]{6}$/.test(s)) return "#"+s;
    return s;
  };

  const buildCountryHTML = (geoRow, keys) => {
    const emoji = (geoRow[keys.emojiK] || "").trim();
    const name  = (geoRow[keys.nameK]  || "").trim();
    const rel   = (geoRow[keys.urlK]   || "").trim().replace(/^\//, "");
    const flag  = emoji ? `${escapeHTML(emoji)} ` : "";
    if (rel) {
      const url = encodeURI(BASE_COUNTRY_URL + rel);
      return `${flag}<a href="${url}">${escapeHTML(name)}</a>`;
    }
    return `${flag}${escapeHTML(name)}`;
  };

  const renderError = (mount, msg) => { mount.innerHTML = `<div class="ginc-cap-error">Error: ${escapeHTML(msg)}</div>`; };

  // ====== Fetch helpers ======
  async function fetchCSVObjects(url) {
    const res = await fetch(url, { mode:"cors", cache:"no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
    const txt = await res.text();
    return toObjects(parseCSV(txt));
  }

  // ====== GEO index (exact headers provided) ======
  function buildGeoIndex(geo) {
    if (!geo.length) return { byIso:{}, list:[], keys:{} };
    const s = geo[0];
    const isoK       = pickKey(s, ["country_iso","iso3","iso_a3","iso_alpha3","iso","alpha3"]);
    const nameK      = pickKey(s, ["country_name","name","country"]);
    const emojiK     = pickKey(s, ["country_emoji","emoji"]);
    const urlK       = pickKey(s, ["country_url","path","url"]);  // relative path
    const regionK    = pickKey(s, ["region"]);
    const subregionK = pickKey(s, ["sub_region","subregion","sub-region"]);
    const groupK     = pickKey(s, ["groups","group","memberships","membership"]);
    if (!isoK || !nameK) throw new Error("ginc-geo.csv missing country_iso or country_name.");
    const byIso = {};
    geo.forEach(r => {
      const iso = (r[isoK]||"").trim().toUpperCase();
      if (!iso) return;
      byIso[iso] = r;
    });
    return { byIso, list: geo, keys:{ isoK,nameK,emojiK,urlK,regionK,subregionK,groupK } };
  }

  // ====== Framework hierarchy (correct *_name, *_url, *_var, and pillar_hex/url) ======
  function buildFrameworkHierarchy(fw) {
    if (!fw.length) return { domains: [], keys:{} };
    const s = fw[0];

    const domainNameK = pickKey(s, ["domain_name"]);
    const domainUrlK  = pickKey(s, ["domain_url"]);
    let   domainVarK  = pickKey(s, ["domain_var"]);
    const domainOrderK= pickKey(s, ["domain_order","order_domain","domain_sort"]);

    const subNameK    = pickKey(s, ["subdomain_name"]);
    const subUrlK     = pickKey(s, ["subdomain_url"]);
    let   subVarK     = pickKey(s, ["subdomain_var"]);
    const subOrderK   = pickKey(s, ["subdomain_order","order_subdomain","subdomain_sort"]);

    const pillarNameK = pickKey(s, ["pillar_name"]);
    const pillarUrlK  = pickKey(s, ["pillar_url"]);
    let   pillarVarK  = pickKey(s, ["pillar_var"]);
    const pillarOrderK= pickKey(s, ["pillar_order","order_pillar","pillar_sort","order"]);
    const pillarHexK  = pickKey(s, ["pillar_hex","hex","pillar_color","color","colour","color_hex","colour_hex"]); // prefer pillar_hex

    const getVar = (row, varK, urlK, nameK) => {
      if (varK && row[varK]) return slug(row[varK]);
      if (urlK && row[urlK]) return slug(row[urlK]);
      if (nameK && row[nameK]) return slug(row[nameK]);
      return "";
    };

    const domainMap = new Map();
    fw.forEach(r => {
      const dVar = getVar(r, domainVarK, domainUrlK, domainNameK);
      if (!dVar) return;
      if (!domainMap.has(dVar)) {
        domainMap.set(dVar, {
          slug: dVar,
          name: (r[domainNameK] || titleize(dVar)),
          order: safeNum(r[domainOrderK]),
          subdomains: new Map()
        });
      }
      const d = domainMap.get(dVar);

      const sdVar = getVar(r, subVarK, subUrlK, subNameK);
      const sdKey = sdVar || `__no_sub__:${d.subdomains.size}`;
      if (!d.subdomains.has(sdKey)) {
        d.subdomains.set(sdKey, {
          slug: sdVar,
          name: sdVar ? (r[subNameK] || titleize(sdVar)) : "",
          order: safeNum(r[subOrderK]),
          pillars: []
        });
      }
      const sd = d.subdomains.get(sdKey);

      const pVar = getVar(r, pillarVarK, pillarUrlK, pillarNameK);
      if (!pVar) return;
      const pHex = normalizeHex((r[pillarHexK] || "").trim());
      const pUrl = (r[pillarUrlK] || "").trim(); // store pillar_url for hyperlinking pillar_name
      sd.pillars.push({
        slug: pVar,
        name: (r[pillarNameK] || titleize(pVar)),
        order: safeNum(r[pillarOrderK]),
        hex: pHex,
        url: pUrl
      });
    });

    const domains = Array.from(domainMap.values())
      .sort((a,b) => (isNaN(a.order)?Infinity:a.order) - (isNaN(b.order)?Infinity:b.order))
      .map(d => {
        const subs = Array.from(d.subdomains.values())
          .sort((a,b) => (isNaN(a.order)?Infinity:a.order) - (isNaN(b.order)?Infinity:b.order))
          .map(sd => {
            sd.pillars.sort((a,b) => (isNaN(a.order)?Infinity:a.order) - (isNaN(b.order)?Infinity:b.order));
            return sd;
          });
        d.subdomains = subs;
        return d;
      });

    return {
      domains,
      keys: {
        domainNameK, domainUrlK, domainVarK, domainOrderK,
        subNameK, subUrlK, subVarK, subOrderK,
        pillarNameK, pillarUrlK, pillarVarK, pillarOrderK, pillarHexK
      }
    };
  }

  // ====== Ratings index (assessment_type; normalized IDs; dedup) ======
  function buildRatingsIndex(ratings) {
    if (!ratings.length) return { by: { domain:new Map(), subdomain:new Map(), pillar:new Map() }, keys:{} };

    const s = ratings[0];
    const isoK        = pickKey(s, ["country_iso","iso3","iso_a3","iso_alpha3","iso","alpha3"]);
    const assessK     = pickKey(s, ["assessment_type","assessment","assessment_level","level","type"]);
    const domainVarK  = pickKey(s, ["domain_var","domain_key","domain","domain_url"]);
    const subVarK     = pickKey(s, ["subdomain_var","subdomain_key","subdomain","subdomain_url"]);
    const pillarVarK  = pickKey(s, ["pillar_var","pillar_key","pillar","pillar_url","component","component_var"]);
    const ratingK     = pickKey(s, ["rating"]);
    const scoreK      = pickKey(s, ["score","value","points"]);
    const outlookK    = pickKey(s, ["outlook"]);
    const dateK       = pickKey(s, ["date","asof","as_at","as-of"]);

    if (!isoK) throw new Error("ginc-ratings.csv missing ISO column (expected 'country_iso' or equivalent).");
    if (!ratingK || !scoreK) throw new Error("ginc-ratings.csv missing rating/score columns.");

    const by = { domain:new Map(), subdomain:new Map(), pillar:new Map() };

    const better = (a, b) => {
      const as = safeNum(a?.[scoreK]); const bs = safeNum(b?.[scoreK]);
      if (Number.isFinite(as) && Number.isFinite(bs)) {
        if (bs > as) return b;
        if (as > bs) return a;
      } else if (Number.isFinite(bs)) return b;
      else if (Number.isFinite(as)) return a;

      const ad = parseWhen(a?.[dateK]); const bd = parseWhen(b?.[dateK]);
      if (Number.isFinite(bd) && Number.isFinite(ad)) return (bd > ad) ? b : a;
      if (Number.isFinite(bd)) return b;
      return a ?? b;
    };

    ratings.forEach(r => {
      const iso = (r[isoK] || "").trim().toUpperCase();
      if (!iso) return;

      // Determine level (explicit or inferred)
      let level = assessK ? ci(r[assessK] || "") : "";
      if (!by[level]) {
        level =
          (r[pillarVarK]  && r[pillarVarK].trim()) ? "pillar" :
          (r[subVarK]     && r[subVarK].trim())    ? "subdomain" :
          (r[domainVarK]  && r[domainVarK].trim()) ? "domain" : "";
      }
      if (!by[level]) return;

      // Normalized identifier
      const idRaw =
        level === "pillar"    ? (r[pillarVarK]  || "") :
        level === "subdomain" ? (r[subVarK]     || "") :
        level === "domain"    ? (r[domainVarK]  || "") : "";
      const id = slug(idRaw);
      if (!id) return;

      const key = `${iso}|${id}`;
      const prev = by[level].get(key);
      if (!prev) by[level].set(key, r);
      else by[level].set(key, better(prev, r));
    });

    return { by, keys:{ isoK, assessK, domainVarK, subVarK, pillarVarK, ratingK, scoreK, outlookK, dateK } };
  }

  // ====== Filtering (region / sub_region / groups) ======
  function countryPassesFilters(geoRow, geoKeys, filters) {
    if (!geoRow) return false;
    const { region, subregion, group } = filters;

    if (region) {
      const r = geoKeys.regionK ? ci(geoRow[geoKeys.regionK]||"") : "";
      if (ci(region) !== r) return false;
    }
    if (subregion) {
      const sr = geoKeys.subregionK ? ci(geoRow[geoKeys.subregionK]||"") : "";
      if (ci(subregion) !== sr) return false;
    }
    if (group) {
      if (!geoKeys.groupK) return false;
      const raw = (geoRow[geoKeys.groupK]||"").toLowerCase();
      const parts = raw.split(/[,;| ]+/).map(s=>s.trim()).filter(Boolean);
      if (!parts.includes(ci(group))) return false;
    }
    return true;
  }

  // ====== Rendering helpers ======
  function mkTable(cols) {
    const table = document.createElement("table");
    table.className = "ginc-cap-table";
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    cols.forEach(c => {
      const th = document.createElement("th");
      th.textContent = c.header;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    return { table, tbody };
  }
  function addRatingSeparator(tbody, colspan, ratingText) {
    const sep = document.createElement("tr");
    sep.className = "ginc-cap-sep";
    const td = document.createElement("td");
    td.colSpan = colspan;
    td.textContent = ratingText || "Unrated";
    sep.appendChild(td);
    tbody.appendChild(sep);
  }

  // ====== Dimension renderers ======
  function renderCountryTable(mount, iso, fw, ratingsIdx, geoIdx) {
    const geoRow = geoIdx.byIso[iso];
    if (!geoRow) return renderError(mount, `Unknown ISO code: ${iso}`);

    const caption = document.createElement("div");
    caption.className = "ginc-cap-caption";
    caption.innerHTML = `National Capability Ratings — ${escapeHTML(geoRow[geoIdx.keys.nameK]||iso)}`;
    const cols = [
      { key:"component", header:"Index Component" },
      { key:"rating",    header:"Rating" },
      { key:"outlook",   header:"Outlook" },
      { key:"date",      header:"Date" }
    ];
    const { table, tbody } = mkTable(cols);

    const pushRow = (cls, name, ratRow, pillarHex, pillarHref) => {
      const tr = document.createElement("tr");
      if (cls) tr.className = cls;

      // For pillar rows, use pillar_hex from framework (p.hex)
      if (cls === "ginc-row--pillar") {
        const bg = normalizeHex(pillarHex);
        if (bg) tr.setAttribute("style", `background-color:${bg};`);
      }

      const td0 = document.createElement("td");
      if (cls === "ginc-row--pillar" && pillarHref) {
        td0.innerHTML = `<a href="/${(pillarHref || "").replace(/^\//, "")}">${escapeHTML(name)}</a>`;
      } else {
        td0.textContent = name;
      }

      const td1 = document.createElement("td");
      td1.textContent = ratRow?.[ratingsIdx.keys.ratingK] ?? "";
      const td2 = document.createElement("td");
      td2.textContent = ratRow?.[ratingsIdx.keys.outlookK] ?? "";
      const td3 = document.createElement("td");
      td3.textContent = ratRow?.[ratingsIdx.keys.dateK] ?? "";

      tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      tbody.appendChild(tr);
    };

    // Walk Domain -> Subdomain -> Pillars
    fw.domains.forEach(d => {
      const dKey = `${iso}|${slug(d.slug)}`;
      const dRow = ratingsIdx.by.domain.get(dKey);
      pushRow("ginc-row--domain", d.name, dRow, "", "");

      d.subdomains.forEach(sd => {
        if (sd.slug) {
          const sdKey = `${iso}|${slug(sd.slug)}`;
          const sdRow = ratingsIdx.by.subdomain.get(sdKey);
          pushRow("ginc-row--subdomain", sd.name, sdRow, "", "");
        }

        sd.pillars.forEach(p => {
          const pKey = `${iso}|${slug(p.slug)}`;
          const pRow = ratingsIdx.by.pillar.get(pKey);
          // Link pillar_name to relative pillar_url
          pushRow("ginc-row--pillar", p.name, pRow, p.hex || "", p.url || "");
        });
      });
    });

    mount.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "ginc-cap-wrap";
    wrap.appendChild(caption);
    wrap.appendChild(table);
    mount.appendChild(wrap);
  }

  function renderOverallTable(mount, fw, ratingsIdx, geoIdx, filters) {
    // No rating separators in overall view
    const ensureDomain = (slugStr, fallbackName) => {
      const found = fw.domains.find(d => slug(d.slug)===slug(slugStr));
      return found || { slug: slug(slugStr), name: fallbackName || titleize(slugStr) };
    };
    const D = [
      ensureDomain("hard-power",     "Hard Power"),
      ensureDomain("soft-power",     "Soft Power"),
      ensureDomain("economic-power", "Economic Power")
    ];

    const caption = document.createElement("div");
    caption.className = "ginc-cap-caption";
    caption.textContent = "Overall — Domain Ratings";

    const cols = [
      { key:"country", header:"Country" },
      { key:"hard", header: D[0].name },
      { key:"soft", header: D[1].name },
      { key:"econ", header: D[2].name }
    ];
    const { table, tbody } = mkTable(cols);

    const isoList = Array.from(new Set(
      geoIdx.list
        .filter(r => countryPassesFilters(r, geoIdx.keys, filters))
        .map(r => (r[geoIdx.keys.isoK]||"").trim().toUpperCase())
        .filter(Boolean)
    ));

    const rows = isoList.map(iso => {
      const d0 = ratingsIdx.by.domain.get(`${iso}|${slug(D[0].slug)}`);
      const d1 = ratingsIdx.by.domain.get(`${iso}|${slug(D[1].slug)}`);
      const d2 = ratingsIdx.by.domain.get(`${iso}|${slug(D[2].slug)}`);
      const s0 = safeNum(d0?.[ratingsIdx.keys.scoreK]);
      const s1 = safeNum(d1?.[ratingsIdx.keys.scoreK]);
      const s2 = safeNum(d2?.[ratingsIdx.keys.scoreK]);
      const haveAll = [s0,s1,s2].every(n=>Number.isFinite(n));
      const avg = haveAll ? (s0+s1+s2)/3 : -Infinity;
      const name = (geoIdx.byIso[iso]?.[geoIdx.keys.nameK] || "").trim();
      return { iso, name, d0, d1, d2, avg };
    }).sort((a,b) => {
      if (b.avg !== a.avg) return b.avg - a.avg;
      return a.name.localeCompare(b.name, undefined, { sensitivity:"base" });
    });

    rows.forEach(r => {
      const geoRow = geoIdx.byIso[r.iso];
      const tr = document.createElement("tr");

      const tdC = document.createElement("td");
      tdC.innerHTML = buildCountryHTML(geoRow, geoIdx.keys);
      tr.appendChild(tdC);

      const tdH = document.createElement("td"); tdH.textContent = r.d0?.[ratingsIdx.keys.ratingK] ?? "";
      const tdS = document.createElement("td"); tdS.textContent = r.d1?.[ratingsIdx.keys.ratingK] ?? "";
      const tdE = document.createElement("td"); tdE.textContent = r.d2?.[ratingsIdx.keys.ratingK] ?? "";
      tr.appendChild(tdH); tr.appendChild(tdS); tr.appendChild(tdE);

      tbody.appendChild(tr);
    });

    mount.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "ginc-cap-wrap";
    wrap.appendChild(caption);
    wrap.appendChild(table);
    mount.appendChild(wrap);
  }

  function renderOneLevelTable(mount, level, focusSlug, ratingsIdx, geoIdx, filters) {
    if (!focusSlug) return renderError(mount, `Missing required attribute: data-focus for ${level} table.`);
    const focusId = slug(focusSlug);

    const caption = document.createElement("div");
    caption.className = "ginc-cap-caption";
    caption.textContent = `${titleize(level)} — ${titleize(focusId)}`;

    const cols = [
      { key:"country", header:"Country" },
      { key:"rating",  header:"Rating" },
      { key:"outlook", header:"Outlook" },
      { key:"date",    header:"Date" }
    ];
    const { table, tbody } = mkTable(cols);

    const isoList = Array.from(new Set(
      geoIdx.list
        .filter(r => countryPassesFilters(r, geoIdx.keys, filters))
        .map(r => (r[geoIdx.keys.isoK]||"").trim().toUpperCase())
        .filter(Boolean)
    ));

    const rows = isoList.map(iso => {
      const rr = ratingsIdx.by[level]?.get(`${iso}|${focusId}`);
      const score = safeNum(rr?.[ratingsIdx.keys.scoreK]);
      const name  = (geoIdx.byIso[iso]?.[geoIdx.keys.nameK] || "").trim();
      const rating= (rr?.[ratingsIdx.keys.ratingK] || "").trim();
      return { iso, name, rr, score, rating };
    }).filter(r => Number.isFinite(r.score))
      .sort((a,b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.name.localeCompare(b.name, undefined, { sensitivity:"base" });
      });

    let lastRating = null;
    rows.forEach(({ iso, rr, rating }) => {
      if (rating !== lastRating) {
        addRatingSeparator(tbody, 4, rating || "Unrated");
        lastRating = rating;
      }
      const geoRow = geoIdx.byIso[iso];
      const tr = document.createElement("tr");

      const td0 = document.createElement("td");
      td0.innerHTML = buildCountryHTML(geoRow, geoIdx.keys);
      const td1 = document.createElement("td");
      td1.textContent = rr?.[ratingsIdx.keys.ratingK] ?? "";
      const td2 = document.createElement("td");
      td2.textContent = rr?.[ratingsIdx.keys.outlookK] ?? "";
      const td3 = document.createElement("td");
      td3.textContent = rr?.[ratingsIdx.keys.dateK] ?? "";

      tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      tbody.appendChild(tr);
    });

    mount.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "ginc-cap-wrap";
    wrap.appendChild(caption);
    wrap.appendChild(table);
    mount.appendChild(wrap);
  }

  // ====== NEW: Assets renderer ======
function renderAssetsTable(mount, assets, geoIdx, category, isoFilter) {
  if (!assets || !assets.length) return renderError(mount, "No data found in ginc-assets.csv.");

  const s = assets[0];
  const isoK        = pickKey(s, ["country_iso","iso3","iso"]);
  const nameK       = pickKey(s, ["asset_name","name"]);
  const genK        = pickKey(s, ["asset_generation","generation"]);
  const serviceK    = pickKey(s, ["asset_in_service","first_service","service_entry","in_service"]);
  const typeK       = pickKey(s, ["asset_type","type"]);
  const volK        = pickKey(s, ["asset_volume","total","count","quantity"]);
  const categoryK   = pickKey(s, ["asset_category","category"]);
  const profileK    = pickKey(s, ["profile_url","asset_url","url","profile"]);      // (existing) link for Name
  const typeUrlK    = pickKey(s, ["asset_type_url","type_url","category_url"]);     // NEW: link for Type

  if (!isoK || !nameK || !serviceK) {
    return renderError(mount, "ginc-assets.csv missing required columns.");
  }

  // Apply filters
  let rows = assets.slice();
  if (category && categoryK) rows = rows.filter(r => slug(r[categoryK]||"") === slug(category));
  if (isoFilter && isoK) rows = rows.filter(r => (r[isoK]||"").toUpperCase() === isoFilter.toUpperCase());

  // Sort by asset_in_service (desc)
  rows.sort((a,b) => {
    const an = safeNum(a[serviceK]); const bn = safeNum(b[serviceK]);
    if (Number.isFinite(an) && Number.isFinite(bn)) return bn - an;
    if (Number.isFinite(an)) return 1;
    if (Number.isFinite(bn)) return -1;
    const ad = parseWhen(a[serviceK]); const bd = parseWhen(b[serviceK]);
    if (Number.isFinite(ad) && Number.isFinite(bd)) return bd - ad;
    if (Number.isFinite(ad)) return 1;
    if (Number.isFinite(bd)) return -1;
    return 0;
  });

  // Caption & table
  const caption = document.createElement("div");
  caption.className = "ginc-cap-caption";
  caption.textContent = ["Assets", category ? `Category: ${category}` : "", isoFilter ? `ISO: ${isoFilter}` : ""]
    .filter(Boolean).join(" — ");

  const cols = [
    { key:"name", header:"Name" },
    { key:"type", header:"Type" },
    { key:"gen",  header:"Gen" },
    { key:"svc",  header:"Service" },
    { key:"vol",  header:"Total" }
  ];
  const { table, tbody } = mkTable(cols);

  // Rows
  rows.forEach(r => {
    const tr = document.createElement("tr");

    // Name = emoji (from geo via country_iso) + asset_name; only NAME is linked when profile_url present
    const iso = (r[isoK]||"").trim().toUpperCase();
    const geoRow = geoIdx.byIso[iso];
    const emoji = geoRow ? (geoRow[geoIdx.keys.emojiK] || "") : "";
    const nameText = (r[nameK] || "").trim();
    const tdName = document.createElement("td");
    const relProfile = profileK ? (r[profileK] || "").trim().replace(/^\//, "") : "";
    tdName.innerHTML = relProfile
      ? `${emoji ? escapeHTML(emoji) + " " : ""}<a href="/${escapeHTML(relProfile)}">${escapeHTML(nameText)}</a>`
      : `${emoji ? escapeHTML(emoji) + " " : ""}${escapeHTML(nameText)}`;

    const tdGen = document.createElement("td");
    tdGen.textContent = r[genK] || "";

    const tdSvc = document.createElement("td");
    tdSvc.textContent = r[serviceK] || "";

    // Type: link to asset_type_url if present (root-relative)
    const tdType = document.createElement("td");
    const typeText = (r[typeK] || "").trim();
    const relTypeUrl = typeUrlK ? (r[typeUrlK] || "").trim().replace(/^\//, "") : "";
    tdType.innerHTML = relTypeUrl
      ? `<a href="/${escapeHTML(relTypeUrl)}">${escapeHTML(typeText)}</a>`
      : escapeHTML(typeText);

    const tdVol = document.createElement("td");
    tdVol.textContent = r[volK] || "";

    tr.appendChild(tdName);
    tr.appendChild(tdType);
    tr.appendChild(tdGen);
    tr.appendChild(tdSvc);
    tr.appendChild(tdVol);
    tbody.appendChild(tr);
  });

  mount.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "ginc-cap-wrap";
  wrap.appendChild(caption);
  wrap.appendChild(table);
  mount.appendChild(wrap);
}

  // ====== Init per element ======
  async function initOne(el, shared) {
    const dimension = slug(el.getAttribute("data-dimension") || "");
    const focus     = el.getAttribute("data-focus") || "";
    const isoAttr   = (el.getAttribute("data-iso") || el.getAttribute("data-country-iso") || "").trim().toUpperCase();
    const category  = el.getAttribute("data-category") || "";

    const region    = el.getAttribute("data-region")    || "";
    const subregion = el.getAttribute("data-subregion") || "";
    const group     = el.getAttribute("data-group")     || "";
    const filters   = { region, subregion, group };

    try {
      const { fwH, rtIdx, geoIdx, assets } = shared;

      if (dimension === "country") {
        if (!isoAttr) return renderError(el, "Missing required attribute: data-iso for country table.");
        return renderCountryTable(el, isoAttr, fwH, rtIdx, geoIdx);
      }
      if (dimension === "overall") {
        return renderOverallTable(el, fwH, rtIdx, geoIdx, filters);
      }
      if (["domain","subdomain","pillar"].includes(dimension)) {
        return renderOneLevelTable(el, dimension, focus, rtIdx, geoIdx, filters);
      }
      if (dimension === "assets") {
        return renderAssetsTable(el, assets, geoIdx, category, isoAttr);
      }

      return renderError(el, `Unknown data-dimension: "${dimension}".`);
    } catch (err) {
      renderError(el, err.message || String(err));
    }
  }

  // ====== Boot ======
  async function initAll() {
    injectStyles();
    const mounts = Array.from(document.querySelectorAll(WIDGET_SELECTOR));
    if (!mounts.length) return;

    const needsAssets = mounts.some(el => ci(el.getAttribute("data-dimension")||"") === "assets");

    try {
      const baseFetches = [
        fetchCSVObjects(FRAMEWORK_URL),
        fetchCSVObjects(RATINGS_URL),
        fetchCSVObjects(GEO_URL)
      ];
      if (needsAssets) baseFetches.push(fetchCSVObjects(ASSETS_URL)); else baseFetches.push(Promise.resolve([]));

      const [framework, ratings, geo, assets] = await Promise.all(baseFetches);
      const fwH   = buildFrameworkHierarchy(framework);
      const rtIdx = buildRatingsIndex(ratings);
      const geoIdx= buildGeoIndex(geo);

      const shared = { fwH, rtIdx, geoIdx, assets };
      for (const el of mounts) { await initOne(el, shared); }
    } catch (err) {
      mounts.forEach(el => renderError(el, err.message || String(err)));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();