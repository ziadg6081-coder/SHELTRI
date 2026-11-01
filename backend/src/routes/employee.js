const express = require('express');
const bcrypt = require('bcryptjs');
const { db, get, insert, update, del } = require('../db');
const { wrap, validate, must, HttpError, sign, authEmployee, upload, checkImage, saveFile, removeFile, paginate, petList } = require('../lib');
const M = require('../models');

const r = express.Router();
const E = [authEmployee];
const NOT_YOUR_PET = 'This pet does not belong to your shelter';
const NOT_YOUR_BOARDING = 'This boarding does not belong to your shelter';

r.post('/employee/login', wrap((req, res) => {
  const v = validate(req.body, { email: 'required|email', password: 'required|string' });
  const e = db.prepare('SELECT * FROM employees WHERE email = ?').get(v.email);
  if (!e || !bcrypt.compareSync(v.password, e.password)) return res.status(401).json({ message: 'Invalid email or password' });
  res.json({ message: 'Login successful', data: { token: sign('employee', e.id), employee: M.employeeOut(e) } });
}));

r.get('/employee/home', ...E, wrap((req, res) => {
  const e = req.employee, shelter = M.shelterOf(e.shelter_id);
  if (!shelter) return res.json({ employee: M.employeeOut(e, false), shelter: null, pets: [], message: 'No shelter assigned yet' });
  res.json({
    employee: M.employeeOut(e, false), shelter,
    pets: db.prepare('SELECT * FROM pets WHERE shelter_id = ? AND boarder = 0').all(shelter.id),
  });
}));

/* ----- pets (own shelter) ----- */
const ownPet = (req, id) => {
  const pet = must('pets', id, 'Pet');
  if (pet.shelter_id !== req.employee.shelter_id) throw new HttpError(403, NOT_YOUR_PET);
  return pet;
};

r.get('/employee/pets', ...E, wrap((req, res) => {
  res.json({ message: 'Pets retrieved successfully', data: petList(req, 15, { all: true, shelterId: req.employee.shelter_id, withUser: true }) });
}));

r.post('/employee/pets', ...E, upload.single('photo'), wrap((req, res) => {
  const v = validate(req.body, { name: 'required|string|max:255', type: 'required|string|max:255', age: 'nullable|integer|min:0' });
  const file = checkImage(req.file);
  const pet = insert('pets', { ...v, shelter_id: req.employee.shelter_id, photo: file ? saveFile(file, 'pets') : null });
  res.status(201).json({ message: 'Pet added successfully', data: M.petOut(pet) });
}));

r.get('/employee/pets/:id', ...E, wrap((req, res) => {
  res.json({ message: 'Pet retrieved successfully', data: M.petOut(ownPet(req, req.params.id), { user: true }) });
}));

r.put('/employee/pets/:id', ...E, wrap((req, res) => {
  const pet = ownPet(req, req.params.id);
  const v = validate(req.body, { name: 'sometimes|string|max:255', type: 'sometimes|string|max:255', age: 'nullable|integer|min:0' });
  res.json({ message: 'Pet updated successfully', data: update('pets', pet.id, v) });
}));

r.delete('/employee/pets/:id', ...E, wrap((req, res) => {
  const pet = ownPet(req, req.params.id);
  removeFile(pet.photo);
  db.transaction(() => {
    db.prepare('UPDATE users SET pet_id = NULL WHERE pet_id = ?').run(pet.id);
    del('pets', pet.id);
  })();
  res.json({ message: 'Pet deleted successfully' });
}));

/* ----- adoption review ----- */
const review = (req, res) => {
  const user = must('users', req.params.userId, 'User');
  if (!user.pet_id) throw new HttpError(404, 'This user has no pending adoption');
  if (req.method === 'PATCH') {
    update('pets', user.pet_id, { adoption_status: 'approved' });
    return res.json({ message: 'Adoption accepted successfully', data: { ...M.pub(user), pet: M.petOut(get('pets', user.pet_id)) } });
  }
  const pet = get('pets', user.pet_id);
  db.transaction(() => {
    update('users', user.id, { pet_id: null });
    if (pet) update('pets', pet.id, { user_id: null, adoption_status: null });
  })();
  res.json({ message: 'Adoption rejected successfully', data: pet ? get('pets', pet.id) : null });
};
r.patch('/employee/adoptionreview/:userId', ...E, wrap(review));
r.delete('/employee/adoptionreview/:userId', ...E, wrap(review));

/* ----- products ----- */
r.post('/employee/products', ...E, upload.single('image'), wrap((req, res) => {
  const v = validate(req.body, { name: 'required|string|max:255', description: 'nullable|string', price: 'required|numeric|min:0.01', stock: 'required|integer|min:0' });
  const file = checkImage(req.file, {}, 'image');
  const p = insert('products', { ...v, image: file ? saveFile(file, 'products') : null });
  res.status(201).json({ message: 'Product created successfully', data: p });
}));

r.put('/employee/products/:id', ...E, upload.single('image'), wrap((req, res) => {
  const p = must('products', req.params.id, 'Product');
  const v = validate(req.body, { name: 'sometimes|string|max:255', description: 'nullable|string', price: 'sometimes|numeric|min:0.01', stock: 'sometimes|integer|min:0' });
  const file = checkImage(req.file, {}, 'image');
  if (file) { removeFile(p.image); v.image = saveFile(file, 'products'); }
  res.json({ message: 'Product updated successfully', data: update('products', p.id, v) });
}));

r.delete('/employee/products/:id', ...E, wrap((req, res) => {
  const p = must('products', req.params.id, 'Product');
  removeFile(p.image);
  del('products', p.id);
  res.json({ message: 'Product deleted successfully' });
}));

/* ----- boardings (own shelter) ----- */
r.get('/employee/boardings', ...E, wrap((req, res) => {
  const rows = db.prepare('SELECT * FROM boardings WHERE shelter_id = ? ORDER BY id').all(req.employee.shelter_id)
    .map(b => M.boardingOut(b, ['user', 'pet', 'shelter']));
  res.json({ message: 'Boardings retrieved successfully', data: rows });
}));

const transition = (action, from, to, done) => r.patch(`/employee/boardings/:id/${action}`, ...E, wrap((req, res) => {
  const b = get('boardings', req.params.id);
  if (!b || b.shelter_id !== req.employee.shelter_id) throw new HttpError(403, NOT_YOUR_BOARDING);
  if (from && b.status !== from) throw new HttpError(400, `Boarding is not in ${from} status`);
  res.json({ message: `Boarding ${done} successfully`, data: update('boardings', b.id, { status: to }) });
}));
transition('approve', 'pending', 'approved', 'approved');
transition('activate', 'approved', 'active', 'activated');
transition('complete', 'active', 'completed', 'completed');
transition('reject', null, 'cancelled', 'cancelled');

module.exports = r;
