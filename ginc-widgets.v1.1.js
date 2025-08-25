(() => {
  // ====== Config ======
  const FRAMEWORK_URL = "https://ginc-org.github.io/public-national-capability-data/ginc-framework.csv";
  const RATINGS_URL   = "https://ginc-org.github.io/public-national-capability-data/ginc-ratings.csv";
  const GEO_URL       = "https://ginc-org.github.io/public-national-capability-data/ginc-geo.csv";

  const WIDGET_SELECTOR = '[data-widget="ginc-capability-table"]';
  const BASE_COUNTRY_URL = "https://www.ginc.org/"; // + country_url (relative)

  // ====== Styles ======
  function injectStyles() {
    if (document.getElementById("ginc-capability-table-styles")) return;
    const css = `
      .ginc-cap-wrap { width:100%; }
      .ginc-cap-caption { margin: 6px 0 12px; color:#666; font-size:.9rem; }
      .ginc-cap-table { width:100%; border-collapse:collapse; font-size:.95rem; }
      .ginc-cap-table th, .ginc-cap-table td { padding:8px 10px; vertical-align:top; text-align:left; }
      .ginc-cap-table thead th { font-weight:600; }
      .ginc-cap-error { color:#b00020; padding:6px 0; }
      .ginc-row--domain    td:first-child { font-weight:700; padding-top:14px; }
      .ginc-row--subdomain td:first-child { font-weight:600; padding-left:14px; }
      .ginc-row--pillar    td:first-child { padding-left:28px; }
      .ginc-row--pillar td { border-bottom: 1px solid rgba(0,0,0,.06); }
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
  const titleize = (slug="") => slug.split(/[-_ ]+/).map(w=>w? w[0].toUpperCase()+w.slice(1): "").join(" ");
  const toSlug = (s="") => ci(s).replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  const escapeHTML = (v) => String(v)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");

  const buildCountryHTML = (geoRow, keys) => {
    const emoji = (geoRow[keys.emojiK] || "").trim();
    const name  = (geoRow[keys.nameK]  || "").trim();
    const rel   = (geoRow[keys.urlK]   || "").trim().replace(/^\//, ""); // relative path (no leading slash)
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

  // ====== GEO index (uses exact headers you provided) ======
  function buildGeoIndex(geo) {
    if (!geo.length) return { byIso:{}, list:[], keys:{} };
    const s = geo[0];

    // Exact columns from ginc-geo.csv (with light fallbacks)
    const isoK   = pickKey(s, ["country_iso","iso3","iso_a3","iso_alpha3","iso","alpha3"]);
    const nameK  = pickKey(s, ["country_name","name","country"]);
    const emojiK = pickKey(s, ["country_emoji","emoji"]);
    const urlK   = pickKey(s, ["country_url","path","url"]);   // NOTE: not country_slug
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

  // ====== Framework hierarchy (correct keys: *_name, *_url, *_var) ======
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
    const pillarColorK= pickKey(s, ["pillar_color","color","hex","colour","color_hex","colour_hex"]);

    const getVar = (row, varK, urlK, nameK) => {
      if (varK && row[varK]) return ci(row[varK]);
      if (urlK && row[urlK]) return toSlug(row[urlK]);
      if (nameK && row[nameK]) return toSlug(row[nameK]);
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
      sd.pillars.push({
        slug: pVar,
        name: (r[pillarNameK] || titleize(pVar)),
        order: safeNum(r[pillarOrderK]),
        color: (r[pillarColorK] || "").trim()
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
        pillarNameK, pillarUrlK, pillarVarK, pillarOrderK, pillarColorK
      }
    };
  }

  // ====== Ratings index (keys on *_var) ======
  function buildRatingsIndex(ratings) {
    if (!ratings.length) return { by: { domain:new Map(), subdomain:new Map(), pillar:new Map() }, keys:{} };

    const s = ratings[0];
    const isoK     = pickKey(s, ["iso3","iso_a3","iso_alpha3","iso","alpha3","country_iso"]); // accept country_iso too
    const assessK  = pickKey(s, ["assessment","level","type"]);
    const domainVarK = pickKey(s, ["domain_var","domain_key"]);
    const subVarK    = pickKey(s, ["subdomain_var","subdomain_key"]);
    const pillarVarK = pickKey(s, ["pillar_var","pillar_key","component_var"]);
    const ratingK  = pickKey(s, ["rating"]);
    const scoreK   = pickKey(s, ["score","value","points"]);
    const outlookK = pickKey(s, ["outlook"]);
    const dateK    = pickKey(s, ["date","asof","as_at","as-of"]);

    if (!isoK || !assessK) throw new Error("ginc-ratings.csv missing ISO or assessment columns.");
    if (!ratingK || !scoreK) throw new Error("ginc-ratings.csv missing rating/score columns.");

    const by = { domain:new Map(), subdomain:new Map(), pillar:new Map() };

    const idFor = (level, row) => {
      if (level === "domain")    return ci(row[domainVarK] || "");
      if (level === "subdomain") return ci(row[subVarK]    || "");
      if (level === "pillar")    return ci(row[pillarVarK] || "");
      return "";
    };

    ratings.forEach(r => {
      const iso = (r[isoK]||"").trim().toUpperCase();
      const level = ci(r[assessK]||"");
      if (!iso || !by[level]) return;
      const id = idFor(level, r);
      if (!id) return;
      by[level].set(`${iso}|${id}`, r);
    });

    return { by, keys:{ isoK, assessK, domainVarK, subVarK, pillarVarK, ratingK, scoreK, outlookK, dateK } };
  }

  // ====== Filtering (maps to region / sub_region / groups) ======
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

    const pushRow = (cls, name, ratRow, extraStyle) => {
      const tr = document.createElement("tr");
      if (cls) tr.className = cls;
      if (extraStyle) tr.setAttribute("style", extraStyle);

      const td0 = document.createElement("td");
      td0.textContent = name;
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
      const dKey = `${iso}|${ci(d.slug)}`;
      const dRow = ratingsIdx.by.domain.get(dKey);
      pushRow("ginc-row--domain", d.name, dRow);

      d.subdomains.forEach(sd => {
        if (sd.slug) {
          const sdKey = `${iso}|${ci(sd.slug)}`;
          const sdRow = ratingsIdx.by.subdomain.get(sdKey);
          pushRow("ginc-row--subdomain", sd.name, sdRow);
        }

        sd.pillars.forEach(p => {
          const pKey = `${iso}|${ci(p.slug)}`;
          const pRow = ratingsIdx.by.pillar.get(pKey);
          const style = p.color ? `background-color:${p.color};` : "";
          pushRow("ginc-row--pillar", p.name, pRow, style);
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
    const ensureDomain = (slug, fallbackName) => {
      const found = fw.domains.find(d => ci(d.slug)===ci(slug));
      return found || { slug, name: fallbackName || titleize(slug) };
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

    const isoList = geoIdx.list
      .filter(r => countryPassesFilters(r, geoIdx.keys, filters))
      .map(r => (r[geoIdx.keys.isoK]||"").trim().toUpperCase());

    const rows = isoList.map(iso => {
      const d0 = ratingsIdx.by.domain.get(`${iso}|${ci(D[0].slug)}`);
      const d1 = ratingsIdx.by.domain.get(`${iso}|${ci(D[1].slug)}`);
      const d2 = ratingsIdx.by.domain.get(`${iso}|${ci(D[2].slug)}`);
      const s0 = safeNum(d0?.[ratingsIdx.keys.scoreK]);
      const s1 = safeNum(d1?.[ratingsIdx.keys.scoreK]);
      const s2 = safeNum(d2?.[ratingsIdx.keys.scoreK]);
      const haveAll = [s0,s1,s2].every(n=>Number.isFinite(n));
      const avg = haveAll ? (s0+s1+s2)/3 : -Infinity;
      return { iso, d0, d1, d2, avg };
    }).sort((a,b) => b.avg - a.avg);

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

    const caption = document.createElement("div");
    caption.className = "ginc-cap-caption";
    caption.textContent = `${titleize(level)} — ${titleize(focusSlug)}`;

    const cols = [
      { key:"country", header:"Country" },
      { key:"rating",  header:"Rating" },
      { key:"outlook", header:"Outlook" },
      { key:"date",    header:"Date" }
    ];
    const { table, tbody } = mkTable(cols);

    const isoList = geoIdx.list
      .filter(r => countryPassesFilters(r, geoIdx.keys, filters))
      .map(r => (r[geoIdx.keys.isoK]||"").trim().toUpperCase());

    const rows = isoList.map(iso => {
      const key = `${iso}|${ci(focusSlug)}`;
      const rr = ratingsIdx.by[level]?.get(key);
      const score = safeNum(rr?.[ratingsIdx.keys.scoreK]);
      return { iso, rr, score };
    }).filter(r => Number.isFinite(r.score))
      .sort((a,b) => (b.score - a.score));

    rows.forEach(({ iso, rr }) => {
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

  // ====== Init per element ======
  async function initOne(el, shared) {
    const dimension = ci(el.getAttribute("data-dimension") || "");
    const focus     = ci(el.getAttribute("data-focus") || "");
    const isoAttr   = (el.getAttribute("data-iso") || "").trim().toUpperCase();

    const region    = el.getAttribute("data-region")    || "";
    const subregion = el.getAttribute("data-subregion") || "";
    const group     = el.getAttribute("data-group")     || "";
    const filters   = { region, subregion, group };

    try {
      const { fwH, rtIdx, geoIdx } = shared;

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

    try {
      const [framework, ratings, geo] = await Promise.all([
        fetchCSVObjects(FRAMEWORK_URL),
        fetchCSVObjects(RATINGS_URL),
        fetchCSVObjects(GEO_URL)
      ]);
      const fwH   = buildFrameworkHierarchy(framework);
      const rtIdx = buildRatingsIndex(ratings);
      const geoIdx= buildGeoIndex(geo);

      const shared = { fwH, rtIdx, geoIdx };
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