const express = require('express');
const bcrypt = require('bcryptjs');
const { db, get, insert, update, del } = require('../db');
const { wrap, validate, must, HttpError, authUser, role, upload, checkImage, saveFile, removeFile, paginate, petList } = require('../lib');
const M = require('../models');

const r = express.Router();
const A = [authUser, role('admin')];
const like = q => `%${q}%`;

/* ----- shelters ----- */
r.get('/shelters', ...A, wrap((req, res) => {
  const w = [], p = [];
  if (req.query.search) { w.push('(s.name LIKE ? OR s.location LIKE ?)'); p.push(like(req.query.search), like(req.query.search)); }
  if (req.query.status) { w.push('s.status = ?'); p.push(String(req.query.status)); }
  const sql = `${M.shelterSql(true)} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY (s.status = 'pending') DESC, s.id`;
  res.json({ message: 'Shelters retrieved successfully', data: paginate(req, sql, p, 10, M.shelterOut) });
}));

r.patch('/shelters/:id/approve', ...A, wrap((req, res) => {
  const s = must('shelters', req.params.id, 'Shelter');
  res.json({ message: 'Shelter approved successfully', data: update('shelters', s.id, { status: 'approved', status_note: null }) });
}));

r.patch('/shelters/:id/reject', ...A, wrap((req, res) => {
  const s = must('shelters', req.params.id, 'Shelter');
  const v = validate(req.body, { note: 'nullable|string|max:500' });
  res.json({ message: 'Shelter rejected', data: update('shelters', s.id, { status: 'rejected', status_note: v.note || null }) });
}));

r.post('/shelters', ...A, wrap((req, res) => {
  const v = validate(req.body, { name: 'required|string|max:255', location: 'required|string|max:255' });
  res.status(201).json({ message: 'Shelter created successfully', data: insert('shelters', v) });
}));

r.put('/shelters/:id', ...A, wrap((req, res) => {
  const s = must('shelters', req.params.id, 'Shelter');
  const v = validate(req.body, { name: 'sometimes|string|max:255', location: 'sometimes|string|max:255' });
  res.json({ message: 'Shelter updated successfully', data: update('shelters', s.id, v) });
}));

r.delete('/shelters/:id', ...A, wrap((req, res) => {
  const s = must('shelters', req.params.id, 'Shelter');
  db.transaction(() => {
    db.prepare('UPDATE users SET pet_id = NULL WHERE pet_id IN (SELECT id FROM pets WHERE shelter_id = ?)').run(s.id);
    del('shelters', s.id);
  })();
  res.json({ message: 'Shelter deleted successfully' });
}));

/* ----- pets ----- */
r.get('/pets', ...A, wrap((req, res) => {
  res.json({ message: 'Pets retrieved successfully', data: petList(req, 12, { all: true }) });
}));

r.post('/pets', ...A, upload.single('photo'), wrap((req, res) => {
  const v = validate(req.body, {
    name: 'required|string|max:255', type: 'required|string|max:255',
    age: 'nullable|integer|min:0', shelter_id: 'required|integer|exists:shelters,id',
  });
  const file = checkImage(req.file);
  const pet = insert('pets', { ...v, photo: file ? saveFile(file, 'pets') : null });
  res.status(201).json({ message: 'Pet created successfully', data: M.petOut(pet) });
}));

r.put('/pets/:id', ...A, upload.single('photo'), wrap((req, res) => {
  const pet = must('pets', req.params.id, 'Pet');
  const v = validate(req.body, {
    name: 'sometimes|string|max:255', type: 'sometimes|string|max:255',
    age: 'nullable|integer|min:0', shelter_id: 'sometimes|integer|exists:shelters,id',
  });
  const file = checkImage(req.file);
  if (file) { removeFile(pet.photo); v.photo = saveFile(file, 'pets'); }
  res.json({ message: 'Pet updated successfully', data: M.petOut(update('pets', pet.id, v)) });
}));

r.delete('/pets/:id', ...A, wrap((req, res) => {
  const pet = must('pets', req.params.id, 'Pet');
  removeFile(pet.photo);
  db.transaction(() => {
    db.prepare('UPDATE users SET pet_id = NULL WHERE pet_id = ?').run(pet.id);
    del('pets', pet.id);
  })();
  res.json({ message: 'Pet deleted successfully' });
}));

/* ----- users ----- */
r.get('/users', ...A, wrap((req, res) => {
  const w = [], p = [];
  if (req.query.search) { w.push('(name LIKE ? OR email LIKE ?)'); p.push(like(req.query.search), like(req.query.search)); }
  if (req.query.role) { w.push('role = ?'); p.push(String(req.query.role)); }
  const sql = `SELECT * FROM users ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id`;
  res.json({ message: 'Users retrieved successfully', data: paginate(req, sql, p, 15, M.pub) });
}));

r.post('/users', ...A, wrap((req, res) => {
  const v = validate(req.body, {
    name: 'required|string|max:255', email: 'required|email|unique:users,email',
    password: 'required|string|min:6', role: 'required|string|in:admin,user',
  });
  const u = insert('users', { ...v, password: bcrypt.hashSync(v.password, 10) });
  res.status(201).json({ message: 'User created successfully', data: M.pub(u) });
}));

r.get('/users/:id', ...A, wrap((req, res) => {
  res.json({ message: 'User retrieved successfully', data: M.pub(must('users', req.params.id, 'User')) });
}));

r.put('/users/:id', ...A, wrap((req, res) => {
  const u = must('users', req.params.id, 'User');
  const v = validate(req.body, { name: 'sometimes|string|max:255', email: `sometimes|email|unique:users,email,${u.id}`, role: 'sometimes|string|in:admin,user,shelter' });
  if (v.role && v.role !== u.role && u.id === req.user.id) throw new HttpError(400, 'You cannot change your own role');
  res.json({ message: 'User updated successfully', data: M.pub(update('users', u.id, v)) });
}));

r.delete('/users/:id', ...A, wrap((req, res) => {
  const u = must('users', req.params.id, 'User');
  db.transaction(() => {
    db.prepare('UPDATE pets SET user_id = NULL WHERE user_id = ? AND boarder = 0').run(u.id);
    db.prepare('DELETE FROM pets WHERE user_id = ? AND boarder = 1').run(u.id);
    del('users', u.id);
  })();
  res.json({ message: 'User deleted successfully' });
}));

/* ----- employees ----- */
r.get('/employees', ...A, wrap((req, res) => {
  const w = [], p = [];
  if (req.query.shelter_id) { w.push('shelter_id = ?'); p.push(String(req.query.shelter_id)); }
  if (req.query.position) { w.push('position = ?'); p.push(String(req.query.position)); }
  const sql = `SELECT * FROM employees ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id`;
  res.json({ message: 'Employees retrieved successfully', data: paginate(req, sql, p, 15, e => M.employeeOut(e)) });
}));

r.post('/employees', ...A, wrap((req, res) => {
  const v = validate(req.body, {
    name: 'required|string|max:255', email: 'required|email|unique:employees,email', password: 'required|string|min:6',
    phone: 'nullable|string|max:50', position: 'required|string|max:100', shelter_id: 'required|integer|exists:shelters,id',
  });
  const e = insert('employees', { ...v, password: bcrypt.hashSync(v.password, 10) });
  res.status(201).json({ message: 'Employee created successfully', data: M.employeeOut(e) });
}));

r.get('/employees/:id', ...A, wrap((req, res) => {
  res.json({ message: 'Employee retrieved successfully', data: M.employeeOut(must('employees', req.params.id, 'Employee')) });
}));

r.put('/employees/:id', ...A, wrap((req, res) => {
  const e = must('employees', req.params.id, 'Employee');
  const v = validate(req.body, {
    name: 'sometimes|string|max:255', email: `sometimes|email|unique:employees,email,${e.id}`, password: 'sometimes|string|min:6',
    phone: 'nullable|string|max:50', position: 'sometimes|string|max:100', shelter_id: 'sometimes|integer|exists:shelters,id',
  });
  if (v.password) v.password = bcrypt.hashSync(v.password, 10);
  res.json({ message: 'Employee updated successfully', data: M.employeeOut(update('employees', e.id, v)) });
}));

r.delete('/employees/:id', ...A, wrap((req, res) => {
  del('employees', must('employees', req.params.id, 'Employee').id);
  res.json({ message: 'Employee deleted successfully' });
}));

/* ----- donations ----- */
r.get('/donations', ...A, wrap((req, res) => {
  const w = [], p = [];
  if (req.query.shelter_id) { w.push('shelter_id = ?'); p.push(String(req.query.shelter_id)); }
  const sql = `SELECT * FROM donations ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY created_at DESC, id DESC`;
  res.json({ message: 'Donations retrieved successfully', data: paginate(req, sql, p, 15, d => M.donationOut(d, ['user', 'shelter'])) });
}));

r.get('/donations/:id', ...A, wrap((req, res) => {
  const d = must('donations', req.params.id, 'Donation');
  res.json({ message: 'Donation retrieved successfully', data: M.donationOut(d, ['user', 'shelter']) });
}));

r.delete('/donations/:id', ...A, wrap((req, res) => {
  del('donations', must('donations', req.params.id, 'Donation').id);
  res.json({ message: 'Donation deleted successfully' });
}));

/* ----- dashboard stats ----- */
const monthly = sql => db.prepare(sql).all().reverse().map(x => [x.m.slice(2), Math.round(x.v * 100) / 100]);
r.get('/admin/stats', ...A, wrap((req, res) => {
  const n = (sql, ...p) => db.prepare(sql).get(...p).c;
  const by = (table, col, vals) => Object.fromEntries(vals.map(v => [v, n(`SELECT COUNT(*) c FROM ${table} WHERE ${col} = ?`, v)]));
  const sumOf = sql => Math.round(db.prepare(sql).get().c * 100) / 100;
  res.json({ data: {
    users: { total: n("SELECT COUNT(*) c FROM users WHERE role = 'user'"), admins: n("SELECT COUNT(*) c FROM users WHERE role = 'admin'"), shelter_owners: n("SELECT COUNT(*) c FROM users WHERE role = 'shelter'") },
    shelters: { total: n('SELECT COUNT(*) c FROM shelters'), ...by('shelters', 'status', ['pending', 'approved', 'rejected']) },
    pets: {
      total: n('SELECT COUNT(*) c FROM pets WHERE boarder = 0'), available: n('SELECT COUNT(*) c FROM pets WHERE boarder = 0 AND user_id IS NULL'),
      adopted: n("SELECT COUNT(*) c FROM pets WHERE boarder = 0 AND adoption_status = 'approved'"), pending_adoption: n("SELECT COUNT(*) c FROM pets WHERE boarder = 0 AND adoption_status = 'pending'"),
    },
    employees: n('SELECT COUNT(*) c FROM employees'),
    donations: { count: n('SELECT COUNT(*) c FROM donations'), total: sumOf('SELECT COALESCE(SUM(amount), 0) c FROM donations') },
    orders: { count: n('SELECT COUNT(*) c FROM orders'), paid: n("SELECT COUNT(*) c FROM orders WHERE status = 'paid'"), revenue: sumOf("SELECT COALESCE(SUM(total_price), 0) c FROM orders WHERE status = 'paid'") },
    boardings: by('boardings', 'status', ['pending', 'approved', 'active', 'completed', 'cancelled']),
    reports: { ...by('reports', 'status', ['pending', 'in_progress', 'resolved', 'rejected']), high_open: n("SELECT COUNT(*) c FROM reports WHERE risk_level = 'high' AND status IN ('pending','in_progress')") },
    products: { total: n('SELECT COUNT(*) c FROM products'), low_stock: n('SELECT COUNT(*) c FROM products WHERE stock <= 5') },
    trends: {
      signups: monthly('SELECT substr(created_at, 1, 7) m, COUNT(*) v FROM users GROUP BY m ORDER BY m DESC LIMIT 6'),
      donations: monthly('SELECT substr(created_at, 1, 7) m, SUM(amount) v FROM donations GROUP BY m ORDER BY m DESC LIMIT 6'),
    },
    top_shelters: db.prepare('SELECT s.name, COALESCE(SUM(d.amount), 0) total FROM shelters s LEFT JOIN donations d ON d.shelter_id = s.id GROUP BY s.id ORDER BY total DESC LIMIT 5').all(),
    recent: {
      users: db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY id DESC LIMIT 5').all(),
      reports: db.prepare('SELECT id, animal_type, location, risk_level, status FROM reports ORDER BY id DESC LIMIT 5').all(),
    },
  } });
}));

/* ----- overview lists ----- */
r.get('/admin/reports', ...A, wrap((req, res) => {
  const w = [], p = [];
  if (req.query.status) { w.push('status = ?'); p.push(String(req.query.status)); }
  if (req.query.risk_level) { w.push('risk_level = ?'); p.push(String(req.query.risk_level)); }
  const sql = `SELECT * FROM reports ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC`;
  res.json({ message: 'Reports retrieved successfully', data: paginate(req, sql, p, 10, x => ({ ...M.reportOut(x), user: M.userOf(x.user_id) })) });
}));
r.patch('/admin/reports/:id', ...A, wrap((req, res) => {
  const rep = must('reports', req.params.id, 'Report');
  const v = validate(req.body, { status: 'required|string|in:pending,in_progress,resolved,rejected' });
  res.json({ message: 'Report updated successfully', data: M.reportOut(update('reports', rep.id, v)) });
}));
r.get('/admin/orders', ...A, wrap((req, res) => {
  res.json({ message: 'Orders retrieved successfully', data: paginate(req, 'SELECT * FROM orders ORDER BY id DESC', [], 15, o => ({ ...M.orderOut(o), user: M.userOf(o.user_id) })) });
}));
r.get('/admin/boardings', ...A, wrap((req, res) => {
  res.json({ message: 'Boardings retrieved successfully', data: paginate(req, 'SELECT * FROM boardings ORDER BY id DESC', [], 15, b => M.boardingOut(b, ['pet', 'shelter', 'user'])) });
}));

/* ----- products (admin) ----- */
const PRODUCT_RULES = { name: 'required|string|max:255', description: 'nullable|string', price: 'required|numeric|min:0.01', stock: 'required|integer|min:0' };
r.post('/products', ...A, upload.single('image'), wrap((req, res) => {
  const v = validate(req.body, PRODUCT_RULES);
  const file = checkImage(req.file, {}, 'image');
  res.status(201).json({ message: 'Product created successfully', data: insert('products', { ...v, image: file ? saveFile(file, 'products') : null }) });
}));
r.put('/products/:id', ...A, upload.single('image'), wrap((req, res) => {
  const p = must('products', req.params.id, 'Product');
  const v = validate(req.body, { ...PRODUCT_RULES, name: 'sometimes|string|max:255', price: 'sometimes|numeric|min:0.01', stock: 'sometimes|integer|min:0' });
  const file = checkImage(req.file, {}, 'image');
  if (file) { removeFile(p.image); v.image = saveFile(file, 'products'); }
  res.json({ message: 'Product updated successfully', data: update('products', p.id, v) });
}));
r.delete('/products/:id', ...A, wrap((req, res) => {
  const p = must('products', req.params.id, 'Product');
  removeFile(p.image);
  del('products', p.id);
  res.json({ message: 'Product deleted successfully' });
}));

module.exports = r;
