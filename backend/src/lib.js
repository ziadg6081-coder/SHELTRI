const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { db, get } = require('./db');
const M = require('./models');

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const wrap = fn => (req, res, next) => {
  try { Promise.resolve(fn(req, res, next)).catch(next); } catch (e) { next(e); }
};
const truthy = v => ['1', 'true', 'on', 'yes'].includes(String(v).toLowerCase());
const must = (table, id, label) => {
  const row = get(table, id);
  if (!row) throw new HttpError(404, `${label} not found`);
  return row;
};
const own = (row, user, message) => {
  if (!row || row.user_id !== user.id) throw new HttpError(403, message);
  return row;
};

/* ---------- validation (Laravel-style rules) ---------- */
function validate(data, rules) {
  data = data || {};
  const errors = {}, out = {};
  const fail = (f, m) => (errors[f] = errors[f] || []).push(m);
  const today = new Date().toISOString().slice(0, 10);
  for (const [f, str] of Object.entries(rules)) {
    const rs = str.split('|'), l = f.replace(/_/g, ' ');
    let v = data[f];
    if (typeof v === 'string' && f !== 'password') v = v.trim();
    if (v === '') v = null;
    if (v === undefined) { if (rs.includes('required')) fail(f, `The ${l} field is required.`); continue; }
    if (v === null) {
      if (rs.includes('required')) fail(f, `The ${l} field is required.`);
      else if (rs.includes('nullable')) out[f] = null;
      else fail(f, `The ${l} field must not be empty.`);
      continue;
    }
    for (const r of rs) {
      if (errors[f]) break;
      const [name, ...rest] = r.split(':'), arg = rest.join(':');
      if (name === 'string') { if (typeof v !== 'string') fail(f, `The ${l} field must be a string.`); }
      else if (name === 'integer') { if (!/^-?\d+$/.test(String(v))) fail(f, `The ${l} field must be an integer.`); else v = Number(v); }
      else if (name === 'numeric') { if (typeof v === 'boolean' || isNaN(Number(v))) fail(f, `The ${l} field must be a number.`); else v = Number(v); }
      else if (name === 'email') { if (typeof v !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(f, `The ${l} field must be a valid email address.`); }
      else if (name === 'in') { if (!arg.split(',').includes(String(v))) fail(f, `The selected ${l} is invalid.`); }
      else if (name === 'min' || name === 'max') {
        const isNum = typeof v === 'number', size = isNum ? v : String(v).length;
        if (name === 'min' && size < Number(arg)) fail(f, `The ${l} field must be at least ${arg}${isNum ? '.' : ' characters.'}`);
        if (name === 'max' && size > Number(arg)) fail(f, `The ${l} field must not be greater than ${arg}${isNum ? '.' : ' characters.'}`);
      }
      else if (name === 'date_format') { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || isNaN(Date.parse(v))) fail(f, `The ${l} field must match the format Y-m-d.`); }
      else if (name === 'after_or_equal') {
        const o = arg === 'today' ? today : data[arg];
        if (!(String(v) >= String(o))) fail(f, `The ${l} field must be a date after or equal to ${arg === 'today' ? 'today' : arg.replace(/_/g, ' ')}.`);
      }
      else if (name === 'exists') {
        const [t, c] = arg.split(',');
        if (!db.prepare(`SELECT 1 FROM ${t} WHERE ${c} = ?`).get(v)) fail(f, `The selected ${l} is invalid.`);
      }
      else if (name === 'approved_shelter') {
        if (!db.prepare("SELECT 1 FROM shelters WHERE id = ? AND status = 'approved'").get(v)) fail(f, `The selected ${l} is invalid.`);
      }
      else if (name === 'unique') {
        const [t, c, ignore] = arg.split(',');
        const row = db.prepare(`SELECT id FROM ${t} WHERE ${c} = ?`).get(v);
        if (row && String(row.id) !== String(ignore)) fail(f, `The ${l} has already been taken.`);
      }
    }
    if (!errors[f]) out[f] = v;
  }
  const keys = Object.keys(errors);
  if (keys.length) {
    const total = keys.reduce((a, k) => a + errors[k].length, 0);
    throw new HttpError(422, errors[keys[0]][0] + (total > 1 ? ` (and ${total - 1} more error${total > 2 ? 's' : ''})` : ''), { errors });
  }
  return out;
}

/* ---------- auth (JWT) ---------- */
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const sign = (typ, id) => jwt.sign({ sub: id, typ }, SECRET, { expiresIn: process.env.JWT_EXPIRES || '12h' });
const UNAUTH = 'Unauthenticated. Please provide a valid Bearer token.';
const authBy = (typ, table) => (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ message: UNAUTH });
  try {
    const p = jwt.verify(token, SECRET);
    const row = p.typ === typ ? get(table, p.sub) : null;
    if (!row) throw new Error('bad');
    req[typ] = row;
    next();
  } catch (e) {
    res.status(401).json({ message: e && e.name === 'TokenExpiredError' ? 'Token has expired. Please log in again.' : UNAUTH });
  }
};
const authUser = authBy('user', 'users');
const authEmployee = authBy('employee', 'employees');
const role = r => (req, res, next) =>
  req.user.role === r ? next() : res.status(403).json({ error: 'Forbidden', message: `This action requires the ${r} role.` });

/* ---------- uploads ---------- */
const STORAGE = path.join(__dirname, '..', 'storage', 'public');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });
const IMG_BASIC = ['image/jpeg', 'image/png', 'image/gif'];
const IMG_ALL = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
function checkImage(file, { required = false, max = 2048, types = IMG_BASIC } = {}, field = 'photo') {
  if (!file) {
    if (required) throw new HttpError(422, `The ${field} field is required.`, { errors: { [field]: [`The ${field} field is required.`] } });
    return null;
  }
  let msg = null;
  if (!types.includes(file.mimetype)) msg = `The ${field} field must be an image.`;
  else if (file.size > max * 1024) msg = `The ${field} field must not be greater than ${max} kilobytes.`;
  if (msg) throw new HttpError(422, msg, { errors: { [field]: [msg] } });
  return file;
}
function saveFile(file, dir) {
  fs.mkdirSync(path.join(STORAGE, dir), { recursive: true });
  let ext = path.extname(file.originalname || '').toLowerCase();
  if (!/^\.[a-z0-9]{1,5}$/.test(ext)) ext = '.jpg';
  const name = crypto.randomBytes(12).toString('hex') + ext;
  fs.writeFileSync(path.join(STORAGE, dir, name), file.buffer);
  return `${dir}/${name}`;
}
function removeFile(rel) {
  if (!rel || !rel.includes('/')) return; // seeded images live in /public/images and are never deleted
  const p = path.resolve(STORAGE, rel);
  if (p.startsWith(STORAGE + path.sep) && fs.existsSync(p)) fs.unlinkSync(p);
}

/* ---------- pagination ---------- */
function paginate(req, sql, params, per, map = x => x) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM (${sql})`).get(...params).c;
  const rows = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...params, per, (page - 1) * per).map(map);
  return {
    current_page: page, data: rows, per_page: per, total,
    last_page: Math.max(1, Math.ceil(total / per)),
    from: total ? (page - 1) * per + 1 : null,
    to: total ? (page - 1) * per + rows.length : null,
  };
}
function petList(req, per, { all = false, shelterId = null, withUser = false } = {}) {
  const w = [], p = [];
  if (!all) w.push('boarder = 0', "shelter_id IN (SELECT id FROM shelters WHERE status = 'approved')");
  if (req.query.search) { w.push('name LIKE ?'); p.push(`%${String(req.query.search)}%`); }
  if (shelterId) { w.push('shelter_id = ?'); p.push(shelterId); }
  else if (req.query.shelter_id) { w.push('shelter_id = ?'); p.push(String(req.query.shelter_id)); }
  if (req.query.type) { w.push('type = ? COLLATE NOCASE'); p.push(String(req.query.type)); }
  if (truthy(req.query.available)) w.push('user_id IS NULL');
  const sql = `SELECT * FROM pets ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id`;
  return paginate(req, sql, p, per, x => M.petOut(x, { user: withUser }));
}

/* ---------- AI microservice client ---------- */
async function callAI(file) {
  const url = (process.env.AI_URL || 'http://127.0.0.1:8001') + '/analyze';
  const timeout = Number(process.env.AI_TIMEOUT_MS) || 360000;
  const busy = new HttpError(429, 'The analysis service is currently busy. Please try again in 30 seconds.');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const fd = new FormData();
      fd.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'image.jpg');
      const r = await fetch(url, { method: 'POST', body: fd, signal: AbortSignal.timeout(timeout) });
      const body = await r.json().catch(() => ({}));
      if (r.ok && body && typeof body === 'object') return body;
      const detail = String(body.detail || '');
      if (r.status === 429 || /429|quota/i.test(detail)) throw busy;
      if (r.status === 400) throw new HttpError(422, detail || 'The image is invalid.');
    } catch (e) {
      if (e instanceof HttpError) throw e;
    }
    if (attempt < 3) await new Promise(res => setTimeout(res, 2000));
  }
  throw new HttpError(503, 'Image analysis is currently unavailable. Please try again later.');
}

module.exports = {
  HttpError, wrap, truthy, must, own, validate, sign, authUser, authEmployee, role,
  upload, checkImage, saveFile, removeFile, IMG_ALL, paginate, petList, callAI,
};
