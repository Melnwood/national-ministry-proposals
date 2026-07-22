// netlify/functions/data.js
// Reads the JV Country Proposals base via the Airtable REST API, auto-detects the
// latest grant cycle, and returns a compact JSON payload for the dashboard to render.
// The Airtable token is read from the AIRTABLE_TOKEN environment variable and never
// leaves the server. Scope the token to READ ONLY.

const BASE_ID = process.env.AIRTABLE_BASE_ID || "appLRSKHHakcaW0X9";
const TOKEN = process.env.AIRTABLE_TOKEN;

const T = {
  CYCLE: "tbl8cMmxsPBWP8Iwt",
  GOALS: "tblmsBWCZxEKjsQdH",
  PROPOSAL: "tblloFNzGSdio6zWS",
  COUNTRIES: "tblPjsYGcbLPfZzCq",
};

// Field IDs (stable even if you rename the columns in Airtable)
const F = {
  // Grant Cycle
  cyName: "fld4xy7sYr8vl8dNj",
  cyFoundation: "fldnNt8n0RNqdSccO",
  cyStart: "fldXSxdJ4gP4M0Fu3",
  cyEnd: "fldurrroPZwlr7XwL",
  cyTotal: "fldw0BPZ4mU0GwiXz",
  cyProjects: "fld4GE2gj9YRXIrQv",
  cyTotalProjectAmt: "fldDaw2upcRpPgPSF", // sum of per-project Grant Amount Awarded
  cyAward: "fldH1cWVAE20ntcob",           // Project Award Amount (drives the balance)
  cyRemaining: "fld4okEdltEh2vWmL",
  cyPctUsed: "fld5doasbSyXzsl0I",
  // Grant Goals
  glType: "fldynRy5JVc8MHzmn",             // Goal Type (single select)
  glTarget: "fldC8KQzgngaBtmmL",
  glActual: "fldrzoRt4JsDZb8gQ",          // Total Actual (rolls up from reports)
  glCycleLink: "fldvzwukj9URXZoG7",
  // Grant Proposal
  prName: "fld1qi35letQtg6yC",
  prCountry: "fldaHnvEM4RokRDth",
  prStatus: "fld1iHtOAuGDPvLVZ",
  prAwarded: "fldeeQMQPRVyXbklW",
  prRequesting: "fld3bvuKr1SIXAwUf",
  prCoach: "fldstKKgW2SeCjYxG",
  prCycles: "flda02NPGg4TFd8wp",
  prPeople: "fld8CdQ8Ens5m3NDs",
  prLeaders: "fldc2XplvqvAX8NlX",
  prChurches: "fld6ZWqZuuK9gcfab",
  prReqType: "fldvmIx5iytXPIgve",
  // Countries
  coName: "fldzgWM7sqaFDM4Cl",
  coPhase: "flduog58oXfNq2aEt",
};

// --- helpers ---------------------------------------------------------------

async function fetchAll(table) {
  const out = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${table}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable ${table} responded ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    out.push(...json.records);
    offset = json.offset;
  } while (offset);
  return out;
}

const num = (v) => (typeof v === "number" ? v : 0);
const selName = (v) => (v && typeof v === "object" ? v.name : v || "");
const linkName = (v) => (Array.isArray(v) && v[0] && v[0].name ? v[0].name : "");
const yearOf = (rec) => {
  const d = rec.fields[F.cyStart];
  if (d) { const y = parseInt(String(d).slice(0, 4), 10); if (!isNaN(y)) return y; }
  const n = rec.fields[F.cyName] || "";
  const m = String(n).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
};

// --- handler ---------------------------------------------------------------

exports.handler = async () => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (!TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({
      error: "Missing AIRTABLE_TOKEN. Add it as an environment variable in Netlify, then redeploy." }) };
  }

  try {
    const [cycles, goals, proposals, countryRecs] = await Promise.all([
      fetchAll(T.CYCLE), fetchAll(T.GOALS), fetchAll(T.PROPOSAL), fetchAll(T.COUNTRIES),
    ]);

    if (!cycles.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: "No grant cycles found." }) };
    }

    // The REST API returns linked-record fields as arrays of record IDs (e.g. ["rec…"]),
    // not {id,name} objects. Build an id→name map for Countries so proposals resolve to
    // the right country. (Falls back to .name in case the shape ever includes it.)
    const countryNameById = {};
    countryRecs.forEach((c) => { countryNameById[c.id] = (c.fields[F.coName] || "").trim(); });
    const countryName = (v) => {
      if (!Array.isArray(v) || !v.length) return "";
      const first = v[0];
      const id = first && first.id ? first.id : first;
      return countryNameById[id] || (first && first.name) || "";
    };

    // Auto-detect the latest cycle year, then take every foundation in that year.
    const maxYear = Math.max(...cycles.map(yearOf));
    const selected = cycles.filter((c) => yearOf(c) === maxYear);
    const cycleLabel = selected[0].fields[F.cyName] || String(maxYear);

    const foundations = selected.map((cy) => {
      const id = cy.id;
      const f = cy.fields;

      const projs = proposals
        .filter((p) => (p.fields[F.prCycles] || []).includes(id))
        .map((p) => ({
          name: (p.fields[F.prName] || "Untitled").trim(),
          country: countryName(p.fields[F.prCountry]),
          coach: selName(p.fields[F.prCoach]) || "Unassigned",
          amt: num(p.fields[F.prAwarded]),
          status: selName(p.fields[F.prStatus]) || "",
        }))
        .sort((a, b) => b.amt - a.amt);

      const gls = goals
        .filter((g) => (g.fields[F.glCycleLink] || []).includes(id))
        .map((g) => ({
          type: selName(g.fields[F.glType]) || "Goal",
          target: num(g.fields[F.glTarget]),
          actual: num(g.fields[F.glActual]),
        }));

      return {
        name: selName(f[F.cyFoundation]) || "Foundation",
        cycleName: f[F.cyName] || cycleLabel,
        start: f[F.cyStart] || null,
        end: f[F.cyEnd] || null,
        totalGrant: num(f[F.cyTotal]),
        awarded: num(f[F.cyAward]),            // basis for the balance
        remaining: num(f[F.cyRemaining]),
        pctUsed: num(f[F.cyPctUsed]),
        projectCount: num(f[F.cyProjects]),
        perProjectAwardedSum: num(f[F.cyTotalProjectAmt]),
        goals: gls,
        projects: projs,
      };
    }).sort((a, b) => b.totalGrant - a.totalGrant);

    const combined = foundations.reduce((a, f) => ({
      totalGrant: a.totalGrant + f.totalGrant,
      awarded: a.awarded + f.awarded,
      remaining: a.remaining + f.remaining,
      projectCount: a.projectCount + f.projectCount,
    }), { totalGrant: 0, awarded: 0, remaining: 0, projectCount: 0 });

    // Pipeline: proposals submitted but not yet approved. In this base, pending
    // proposals carry a "Submitted" status and aren't linked to a cycle yet.
    const isPending = (s) => /submit|review|pending|awaiting/i.test(s || "");
    const isDistributed = (s) => /distribut/i.test(s || "");
    const pipeline = proposals
      .filter((p) => isPending(selName(p.fields[F.prStatus])))
      .map((p) => ({
        name: (p.fields[F.prName] || "Untitled").trim(),
        country: countryName(p.fields[F.prCountry]),
        coach: selName(p.fields[F.prCoach]) || "Unassigned",
        requested: num(p.fields[F.prRequesting]),
        submitted: p.createdTime || null,
      }))
      .sort((a, b) => b.requested - a.requested);

    // Per-cycle anticipated "people reached", split so digital/media and
    // infrastructure/admin projects are pulled OUT of the in-person headline.
    const reachByCycle = {};
    proposals.forEach((p) => {
      if (!isDistributed(selName(p.fields[F.prStatus]))) return;
      const ppl = num(p.fields[F.prPeople]);
      if (!ppl) return;
      const rt = selName(p.fields[F.prReqType]);
      const bucket = /digital|media/i.test(rt) ? "digital"
        : /infrastructure|facilit/i.test(rt) ? "infra" : "direct";
      (p.fields[F.prCycles] || []).forEach((id) => {
        reachByCycle[id] = reachByCycle[id] || { direct: 0, digital: 0, infra: 0 };
        reachByCycle[id][bucket] += ppl;
      });
    });

    // Every cycle/foundation, for the reconciliation view (did each cycle use its money?)
    const allCycles = cycles.map((cy) => {
      const f = cy.fields;
      return {
        name: f[F.cyName] || "",
        foundation: selName(f[F.cyFoundation]) || "",
        start: f[F.cyStart] || null,
        end: f[F.cyEnd] || null,
        committed: num(f[F.cyTotal]),
        awardedGrant: num(f[F.cyTotalProjectAmt]), // sum of Grant Amount Awarded
        awardedFunded: num(f[F.cyAward]),          // sum of Funded Amount (base's balance basis)
        remainingStored: num(f[F.cyRemaining]),
        pctUsed: num(f[F.cyPctUsed]),
        projectCount: num(f[F.cyProjects]),
        reach: reachByCycle[cy.id] || { direct: 0, digital: 0, infra: 0 },
      };
    });

    // Full country roster, so the dashboard can show every country even at $0
    const allCountries = countryRecs
      .map((c) => (c.fields[F.coName] || "").trim())
      .filter(Boolean);

    // Per-country money picture for the priorities view:
    //  - phase (development stage), this-cycle given, all-time given, pending requests.
    const phaseOf = {};
    countryRecs.forEach((c) => {
      const n = (c.fields[F.coName] || "").trim();
      if (n) phaseOf[n] = selName(c.fields[F.coPhase]) || "";
    });
    const selectedIds = new Set(selected.map((c) => c.id));
    const cmap = {};
    const ensure = (n) => {
      const key = n || "Not specified";
      if (!cmap[key]) cmap[key] = { country: key, phase: phaseOf[key] || "", tcGiven: 0, atGiven: 0, pending: 0, pendingProps: [], antPeople: 0, antLeaders: 0, antChurches: 0 };
      return cmap[key];
    };
    allCountries.forEach((n) => ensure(n));
    proposals.forEach((p) => {
      const st = selName(p.fields[F.prStatus]);
      const e = ensure(countryName(p.fields[F.prCountry]));
      if (isDistributed(st)) {
        const amt = num(p.fields[F.prAwarded]);
        e.atGiven += amt;
        if ((p.fields[F.prCycles] || []).some((id) => selectedIds.has(id))) e.tcGiven += amt;
      } else if (isPending(st)) {
        const req = num(p.fields[F.prRequesting]);
        const ppl = num(p.fields[F.prPeople]), ldr = num(p.fields[F.prLeaders]), chr = num(p.fields[F.prChurches]);
        e.pending += req;
        e.antPeople += ppl; e.antLeaders += ldr; e.antChurches += chr;
        e.pendingProps.push({ name: (p.fields[F.prName] || "Untitled").trim(), coach: selName(p.fields[F.prCoach]) || "Unassigned", requested: req, people: ppl, leaders: ldr, churches: chr });
      }
    });
    const countries = Object.values(cmap).map((c) => {
      c.pendingProps.sort((a, b) => b.requested - a.requested);
      return { ...c, hasPending: c.pending > 0 };
    });

    return { statusCode: 200, headers, body: JSON.stringify({
      generatedAt: new Date().toISOString(),
      cycleLabel, foundations, combined, pipeline, allCycles, allCountries, countries,
    }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
