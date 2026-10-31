// Vault Clerk beta sign-up: validates the form and appends one row to a private Google Sheet.
// Secrets (Vercel environment variables only, never in the repo):
//   GOOGLE_SERVICE_ACCOUNT_JSON  the service account key JSON (editor on that one sheet only)
//   BETA_SHEET_ID                the spreadsheet ID from the sheet's URL
//   BETA_SHEET_RANGE             optional, defaults to "A1" (the first tab)
// No email is sent from here; invites are sent by hand.

const crypto = require('crypto');

const ROLES = ['Artist', 'Engineer / producer', 'Session player', 'Teacher', 'Content creator', 'Manager / label', 'Other'];
const COMPUTERS = ['Mac', 'Windows'];
const FOLDERS = ['Yes, organised', 'Yes, messy', "No, it's everywhere"];
const LIMIT = 5;               // submissions per IP
const WINDOW_MS = 60 * 60 * 1000; // per hour
const hits = new Map();        // best effort: per warm instance

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > LIMIT;
}

function clean(v, max) {
  if (Array.isArray(v)) v = v[0];
  if (typeof v !== 'string') return '';
  // strip control characters and a leading formula character so the sheet never runs it
  let s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function list(v) {
  if (v == null) return [];
  return (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim());
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function googleToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const sig = b64url(crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key.private_key));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  return (await r.json()).access_token;
}

async function appendRow(row) {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const sheet = process.env.BETA_SHEET_ID;
  const range = encodeURIComponent(process.env.BETA_SHEET_RANGE || 'A1');
  const token = await googleToken(key);
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheet}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ values: [row] }) },
  );
  if (!r.ok) throw new Error(`sheets ${r.status}`);
}

function reply(req, res, status, message) {
  const wantsJson = (req.headers.accept || '').includes('application/json');
  if (wantsJson) return res.status(status).json({ ok: status < 400, message });
  if (status < 400) { res.statusCode = 303; res.setHeader('Location', '/thanks'); return res.end(); }
  res.status(status).setHeader('content-type', 'text/html; charset=utf-8');
  return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vault Clerk beta</title><body style="font:17px/1.6 system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 24px;color:#1E1C18;background:#DFE1E0"><h1 style="font-family:Georgia,serif">Not sent yet</h1><p>${message}</p><p><a href="/#beta" style="color:#7A5C2B">Back to the form</a></p></body>`);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(req, res, 405, 'Please use the form on the page.'); }

  const b = req.body || {};
  // honeypot: people never fill this; pretend success for bots
  if (clean(b.company, 200)) return reply(req, res, 200, "Thanks, you're on the list.");

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return reply(req, res, 429, 'Too many tries from here. Please try again in an hour.');

  const name = clean(b.name, 120);
  const email = clean(b.email, 200);
  const roles = list(b.roles).filter((r) => ROLES.includes(r));
  const computer = COMPUTERS.includes(b.computer) ? b.computer : '';
  const country = clean(b.country, 80);
  const folder = FOLDERS.includes(b.folder) ? b.folder : '';
  const note = clean(b.note, 500);
  const consent = b.consent === 'yes' || b.consent === true || b.consent === 'on';
  const source = clean(b.source, 80) || 'vaultclerk.com';

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !computer || !country || !folder || !consent) {
    return reply(req, res, 400, 'Please fill in your name, a valid email, your computer, where you are based, the folder question, and tick the consent box.');
  }

  try {
    await appendRow([new Date().toISOString(), name, email, roles.join(', '), computer, country, folder, note, 'yes', source]);
  } catch (e) {
    console.error('beta signup failed:', e.message);
    return reply(req, res, 500, "Something went wrong on our side and your details weren't saved. Please try again later.");
  }
  return reply(req, res, 200, "Thanks, you're on the list.");
};
