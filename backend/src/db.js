require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const file = path.resolve(process.env.DB_FILE || path.join(__dirname, '..', 'database', 'pawhaven.sqlite'));
fs.mkdirSync(path.dirname(file), { recursive: true });
const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const TS = 'created_at TEXT, updated_at TEXT';
db.exec(`
CREATE TABLE IF NOT EXISTS shelters (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, location TEXT NOT NULL, ${TS});
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', pet_id INTEGER, adoptions INTEGER NOT NULL DEFAULT 0, donations REAL NOT NULL DEFAULT 0, ${TS});
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, phone TEXT,
  position TEXT NOT NULL, shelter_id INTEGER NOT NULL REFERENCES shelters(id) ON DELETE CASCADE, ${TS});
CREATE TABLE IF NOT EXISTS pets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, photo TEXT, age INTEGER,
  shelter_id INTEGER REFERENCES shelters(id) ON DELETE CASCADE, user_id INTEGER, boarder INTEGER NOT NULL DEFAULT 0, ${TS});
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, price REAL NOT NULL, stock INTEGER NOT NULL DEFAULT 0, image TEXT, ${TS});
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, quantity INTEGER NOT NULL, ${TS});
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, quantity INTEGER NOT NULL, total_price REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','paid','cancelled')), ${TS});
CREATE TABLE IF NOT EXISTS boardings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE, shelter_id INTEGER NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL, end_date TEXT NOT NULL, daily_rate REAL NOT NULL, total_cost REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','active','completed','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')), notes TEXT, ${TS});
CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shelter_id INTEGER NOT NULL REFERENCES shelters(id) ON DELETE CASCADE, amount REAL NOT NULL, ${TS});
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shelter_id INTEGER NOT NULL REFERENCES shelters(id) ON DELETE CASCADE, description TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','resolved','rejected')),
  location TEXT NOT NULL, image TEXT, animal_type TEXT, breed TEXT, confidence REAL, visible_conditions TEXT,
  behavior_assessment TEXT, explanation TEXT, ${TS});
`);

db.exec(`CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE, ${TS}, UNIQUE (user_id, pet_id))`);
const ensure = (t, c, ddl) => {
  if (!db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${ddl}`);
};
ensure('shelters', 'status', "TEXT NOT NULL DEFAULT 'approved'");
ensure('shelters', 'status_note', 'TEXT');
ensure('shelters', 'owner_id', 'INTEGER');
ensure('pets', 'adoption_status', 'TEXT');

const now = () => new Date().toISOString();
const clean = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === undefined ? null : v]));

function get(table, id) {
  const n = Number(id);
  if (id === null || id === undefined || !Number.isInteger(n)) return undefined;
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(n);
}
function insert(table, obj) {
  const ts = now();
  const row = clean({ ...obj, created_at: ts, updated_at: ts });
  const k = Object.keys(row);
  const r = db.prepare(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map(x => '@' + x).join(',')})`).run(row);
  return get(table, r.lastInsertRowid);
}
function update(table, id, obj) {
  const row = clean({ ...obj, updated_at: now() });
  const k = Object.keys(row);
  db.prepare(`UPDATE ${table} SET ${k.map(x => `${x} = @${x}`).join(',')} WHERE id = @__id`).run({ ...row, __id: Number(id) });
  return get(table, id);
}
const del = (table, id) => db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(id));

module.exports = { db, now, get, insert, update, del };
