// Krishivaas Tools — unified local server
//
// Serves the sidebar shell + both tools from ./public and proxies every
// krishivaas API call from the server side. Because these calls happen
// server-to-server (not from the browser), they are never subject to the
// browser's CORS rules and never need a preflight request.
//
// Tools:
//   1) Crop Allocation Ledger  -> /api/state, /api/submit  (+ data.json persistence)
//   2) Tree Count Checker       -> /api/tree-count, /api/crop-details
//
// Run with:  npm install && npm start
// Then open: http://localhost:5175 (or PORT=xxxx npm start for a different port)

const express = require('express');
const path = require('path');
const fs = require('fs/promises');

const app = express();
const PORT = process.env.PORT || 5175;
const DATA_FILE = path.join(__dirname, 'data.json');

const ALLOCATION_URL = 'https://api.krishivaas.in/api/v1/customer/add-crop-allocation';
const TREE_HEALTH_URL = 'https://api.krishivaas.in/api/v1/crop-health-horti';
const CROP_DETAILS_URL = 'https://api.krishivaas.in/api/v1/get-single-crop-details';

const ALLOCATION_FIELDS = [
  'flu_id', 'fmr_id', 'ccn_id', 'crop_name', 'crpdu_value', 'crop_duration',
  'crpduty_value', 'crop_duration_type', 'intercrop_ccn_id', 'intercrop_crop_name',
  'intercrop_crpdu_value', 'intercrop_crpduty_value', 'token', 'sowing_date',
  'harvest_date', 'platform',
];

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
//  Crop Allocation Ledger
// ============================================================

// ---- Local persistence (replaces the artifact's window.storage) ----
app.get('/api/state', async (req, res) => {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.json(null); // nothing saved yet
  }
});

app.post('/api/state', async (req, res) => {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(req.body));
    res.json({ ok: true });
  } catch (e) {
    console.error('Failed to write data.json:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ---- Submission proxy ----
app.post('/api/submit', async (req, res) => {
  const body = req.body || {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // 25s cap
  try {
    const fd = new FormData();
    for (const key of ALLOCATION_FIELDS) {
      fd.append(key, body[key] != null ? String(body[key]) : '');
    }
    const started = Date.now();
    const resp = await fetch(ALLOCATION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${body.token || ''}`, Accept: '*/*' },
      body: fd,
      signal: controller.signal,
    });
    const text = await resp.text();
    const ms = Date.now() - started;
    res.json({ ok: resp.ok, status: resp.status, body: text, ms });
  } catch (e) {
    const timedOut = e && e.name === 'AbortError';
    const msg = timedOut
      ? 'Timed out waiting on the krishivaas server (25s)'
      : String(e && e.message ? e.message : e);
    res.json({ ok: false, status: 0, body: msg, ms: 0 });
  } finally {
    clearTimeout(timeout);
  }
});

// ============================================================
//  Tree Count Checker
// ============================================================

// ---- tree_count proxy (crop-health-horti) ----
// NOTE: this krishivaas endpoint keeps per-user state. If it receives several
// requests under the same token at once it returns the FIRST crop's tree_count
// for all of them. The client serialises these calls (one at a time), so the
// server just forwards each one.
app.post('/api/tree-count', async (req, res) => {
  const { token, crop_id, org_id } = req.body || {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const resp = await fetch(TREE_HEALTH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token || ''}`,
        Accept: '*/*',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: `farmercropID=${encodeURIComponent(crop_id)}&orgID=${encodeURIComponent(org_id)}`,
      signal: controller.signal,
    });
    const json = await resp.json().catch(() => null);
    res.json({ ok: resp.ok, status: resp.status, data: json });
  } catch (e) {
    const timedOut = e && e.name === 'AbortError';
    res.json({
      ok: false,
      status: 0,
      error: timedOut ? 'Timed out waiting on the krishivaas server (25s)' : String(e?.message || e),
    });
  } finally {
    clearTimeout(timeout);
  }
});

// ---- acres proxy (get-single-crop-details) ----
app.post('/api/crop-details', async (req, res) => {
  const { token, crop_id, org_id, latest_date } = req.body || {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const url =
      `${CROP_DETAILS_URL}?org_id=${encodeURIComponent(org_id)}` +
      `&cfa_id=${encodeURIComponent(crop_id)}&is_state=0&appType=regular` +
      `&latest_date=${encodeURIComponent(latest_date || '')}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token || ''}`, Accept: '*/*' },
      signal: controller.signal,
    });
    const json = await resp.json().catch(() => null);
    res.json({ ok: resp.ok, status: resp.status, data: json });
  } catch (e) {
    const timedOut = e && e.name === 'AbortError';
    res.json({
      ok: false,
      status: 0,
      error: timedOut ? 'Timed out waiting on the krishivaas server (25s)' : String(e?.message || e),
    });
  } finally {
    clearTimeout(timeout);
  }
});

app.listen(PORT, () => {
  console.log(`Krishivaas Tools running — open http://localhost:${PORT}`);
});
