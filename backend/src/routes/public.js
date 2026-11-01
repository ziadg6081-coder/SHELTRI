const express = require('express');
const bcrypt = require('bcryptjs');
const { db, insert } = require('../db');
const { wrap, validate, must, HttpError, sign, upload, checkImage, paginate, petList, callAI, IMG_ALL } = require('../lib');
const M = require('../models');

const r = express.Router();
const like = q => `%${q}%`;

r.post('/signup', wrap((req, res) => {
  const v = validate(req.body, {
    name: 'required|string|max:255',
    email: 'required|email|unique:users,email',
    password: 'required|string|min:6',
    role: 'required|string|in:admin,user,shelter',
  });
  if (v.role === 'admin' && process.env.ALLOW_ADMIN_SIGNUP !== 'true') throw new HttpError(403, 'Admin sign-up is disabled.');
  const sh = v.role === 'shelter' ? validate(req.body, { shelter_name: 'required|string|max:255', location: 'required|string|max:255' }) : null;
  const out = db.transaction(() => {
    const user = insert('users', { name: v.name, email: v.email, password: bcrypt.hashSync(v.password, 10), role: v.role });
    const shelter = sh ? insert('shelters', { name: sh.shelter_name, location: sh.location, status: 'pending', owner_id: user.id }) : null;
    return { user, shelter };
  })();
  res.status(201).json({
    message: sh ? 'Account created. Your shelter is waiting for admin approval.' : 'Account created successfully',
    data: M.pub(out.user), shelter: out.shelter,
  });
}));

r.post('/login', wrap((req, res) => {
  const v = validate(req.body, { email: 'required|email', password: 'required|string' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(v.email);
  if (!user || !bcrypt.compareSync(v.password, user.password)) return res.status(401).json({ message: 'Invalid email or password' });
  res.json({ message: 'Login successful', data: { token: sign('user', user.id), user: M.pub(user) } });
}));

r.get('/', wrap((req, res) => {
  res.json({
    pets: db.prepare("SELECT * FROM pets WHERE boarder = 0 AND shelter_id IN (SELECT id FROM shelters WHERE status = 'approved') ORDER BY id").all().map(p => M.petOut(p)),
    shelters: db.prepare("SELECT * FROM shelters WHERE status = 'approved' ORDER BY id").all(),
  });
}));

r.get('/shelters-public', wrap((req, res) => {
  const q = req.query.search ? String(req.query.search) : '';
  const sql = `${M.shelterSql(false)} WHERE s.status = 'approved' ${q ? 'AND (s.name LIKE ? OR s.location LIKE ?)' : ''} ORDER BY s.id`;
  res.json({ message: 'Shelters retrieved successfully', data: paginate(req, sql, q ? [like(q), like(q)] : [], 10) });
}));

r.get('/shelters/:id', wrap((req, res) => {
  const base = must('shelters', req.params.id, 'Shelter');
  if (base.status !== 'approved') throw new HttpError(404, 'Shelter not found');
  const s = db.prepare(`${M.shelterSql(false)} WHERE s.id = ?`).get(base.id);
  s.pets = db.prepare('SELECT * FROM pets WHERE shelter_id = ? AND boarder = 0').all(base.id);
  s.employees = db.prepare('SELECT * FROM employees WHERE shelter_id = ?').all(base.id).map(e => M.employeeOut(e, false));
  res.json({ message: 'Shelter retrieved successfully', data: s });
}));

r.get('/petspublic', wrap((req, res) => {
  res.json({ message: 'Pets retrieved successfully', data: petList(req, 12) });
}));

r.get('/pets/:id', wrap((req, res) => {
  res.json({ message: 'Pet retrieved successfully', data: M.petOut(must('pets', req.params.id, 'Pet')) });
}));

r.post('/predict', upload.single('image'), wrap(async (req, res) => {
  const file = checkImage(req.file, { required: true, max: 5120, types: IMG_ALL }, 'image');
  res.json({ ml_result: await callAI(file) });
}));

r.get('/products', wrap((req, res) => {
  const q = req.query.search ? String(req.query.search) : '';
  const sql = `SELECT * FROM products ${q ? 'WHERE name LIKE ?' : ''} ORDER BY id`;
  res.json({ message: 'Products retrieved successfully', data: paginate(req, sql, q ? [like(q)] : [], 15) });
}));

r.get('/products/:id', wrap((req, res) => {
  res.json({ message: 'Product retrieved successfully', data: must('products', req.params.id, 'Product') });
}));

module.exports = r;
