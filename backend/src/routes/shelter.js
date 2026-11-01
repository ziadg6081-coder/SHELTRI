const express = require('express');
const bcrypt = require('bcryptjs');
const { db, get, insert, update, del } = require('../db');
const { wrap, validate, must, HttpError, authUser, role, upload, checkImage, saveFile, removeFile, paginate, petList } = require('../lib');
const M = require('../models');

const r = express.Router();
// every /shelter/* route: logged-in user with role "shelter" that owns a shelter
const base = [authUser, role('shelter'), (req, res, next) => {
  const s = db.prepare('SELECT * FROM shelters WHERE owner_id = ?').get(req.user.id);
  if (!s) return res.status(404).json({ message: 'No shelter is linked to this account' });
  req.shelter = s;
  next();
}];
// actions that publish things need an approved shelter
const approved = (req, res, next) => req.shelter.status === 'approved' ? next() : res.status(403).json({
  message: req.shelter.status === 'pending'
    ? 'Your shelter is waiting for admin approval.'
    : `Your shelter request was rejected.${req.shelter.status_note ? ' Reason: ' + req.shelter.status_note : ''}`,
});
const W = [...base, approved];
const n = (sql, ...p) => db.prepare(sql).get(...p).c;
const ownPet = (req, id) => {
  const pet = must('pets', id, 'Pet');
  if (pet.shelter_id !== req.shelter.id) throw new HttpError(403, 'This pet does not belong to your shelter');
  return pet;
};

r.get('/shelter/me', ...base, wrap((req, res) => {
  const id = req.shelter.id, P = 'SELECT COUNT(*) c FROM pets WHERE boarder = 0 AND shelter_id = ?';
  res.json({ data: { shelter: req.shelter, stats: {
    pets: n(P, id), available: n(`${P} AND user_id IS NULL`, id),
    pending_adoptions: n(`${P} AND adoption_status = 'pending'`, id), adopted: n(`${P} AND adoption_status = 'approved'`, id),
    employees: n('SELECT COUNT(*) c FROM employees WHERE shelter_id = ?', id),
    donations_count: n('SELECT COUNT(*) c FROM donations WHERE shelter_id = ?', id),
    donations_total: Math.round(n('SELECT COALESCE(SUM(amount), 0) c FROM donations WHERE shelter_id = ?', id) * 100) / 100,
    boardings_pending: n("SELECT COUNT(*) c FROM boardings WHERE shelter_id = ? AND status = 'pending'", id),
    reports_open: n("SELECT COUNT(*) c FROM reports WHERE shelter_id = ? AND status IN ('pending','in_progress')", id),
  } } });
}));

r.put('/shelter/me', ...base, wrap((req, res) => {
  const v = validate(req.body, { name: 'sometimes|string|max:255', location: 'sometimes|string|max:255' });
  res.json({ message: 'Shelter updated successfully', data: update('shelters', req.shelter.id, v) });
}));

/* ----- pets ----- */
r.get('/shelter/pets', ...base, wrap((req, res) => {
  res.json({ message: 'Pets retrieved successfully', data: petList(req, 12, { all: true, shelterId: req.shelter.id, withUser: true }) });
}));
r.post('/shelter/pets', ...W, upload.single('photo'), wrap((req, res) => {
  const v = validate(req.body, { name: 'required|string|max:255', type: 'required|string|max:255', age: 'nullable|integer|min:0' });
  const file = checkImage(req.file);
  const pet = insert('pets', { ...v, shelter_id: req.shelter.id, photo: file ? saveFile(file, 'pets') : null });
  res.status(201).json({ message: 'Pet added successfully', data: M.petOut(pet) });
}));
r.put('/shelter/pets/:id', ...W, upload.single('photo'), wrap((req, res) => {
  const pet = ownPet(req, req.params.id);
  const v = validate(req.body, { name: 'sometimes|string|max:255', type: 'sometimes|string|max:255', age: 'nullable|integer|min:0' });
  const file = checkImage(req.file);
  if (file) { removeFile(pet.photo); v.photo = saveFile(file, 'pets'); }
  res.json({ message: 'Pet updated successfully', data: M.petOut(update('pets', pet.id, v)) });
}));
r.delete('/shelter/pets/:id', ...W, wrap((req, res) => {
  const pet = ownPet(req, req.params.id);
  removeFile(pet.photo);
  db.transaction(() => { db.prepare('UPDATE users SET pet_id = NULL WHERE pet_id = ?').run(pet.id); del('pets', pet.id); })();
  res.json({ message: 'Pet deleted successfully' });
}));

/* ----- adoption requests ----- */
r.get('/shelter/adoptions', ...base, wrap((req, res) => {
  const sql = "SELECT * FROM pets WHERE shelter_id = ? AND boarder = 0 AND user_id IS NOT NULL ORDER BY (adoption_status = 'pending') DESC, id DESC";
  res.json({ message: 'Adoptions retrieved successfully', data: paginate(req, sql, [req.shelter.id], 15, p => M.petOut(p, { user: true })) });
}));
r.patch('/shelter/adoptions/:id', ...base, wrap((req, res) => {
  const pet = ownPet(req, req.params.id);
  if (pet.adoption_status !== 'pending') throw new HttpError(400, 'This adoption is not pending');
  res.json({ message: 'Adoption accepted successfully', data: M.petOut(update('pets', pet.id, { adoption_status: 'approved' }), { user: true }) });
}));
r.delete('/shelter/adoptions/:id', ...base, wrap((req, res) => {
  const pet = ownPet(req, req.params.id);
  if (!pet.user_id) throw new HttpError(400, 'This pet has no adoption request');
  db.transaction(() => {
    db.prepare('UPDATE users SET pet_id = NULL WHERE id = ?').run(pet.user_id);
    update('pets', pet.id, { user_id: null, adoption_status: null });
  })();
  res.json({ message: 'Adoption rejected successfully' });
}));

/* ----- donations ----- */
r.get('/shelter/donations', ...base, wrap((req, res) => {
  const d = paginate(req, 'SELECT * FROM donations WHERE shelter_id = ? ORDER BY created_at DESC, id DESC', [req.shelter.id], 15, x => M.donationOut(x, ['user']));
  d.total_amount = Math.round(n('SELECT COALESCE(SUM(amount), 0) c FROM donations WHERE shelter_id = ?', req.shelter.id) * 100) / 100;
  res.json({ message: 'Donations retrieved successfully', data: d });
}));

/* ----- staff (employees) ----- */
const ownEmp = (req, id) => {
  const e = must('employees', id, 'Employee');
  if (e.shelter_id !== req.shelter.id) throw new HttpError(403, 'This employee does not belong to your shelter');
  return e;
};
r.get('/shelter/employees', ...base, wrap((req, res) => {
  res.json({ message: 'Employees retrieved successfully', data: paginate(req, 'SELECT * FROM employees WHERE shelter_id = ? ORDER BY id', [req.shelter.id], 15, e => M.employeeOut(e, false)) });
}));
r.post('/shelter/employees', ...base, wrap((req, res) => {
  const v = validate(req.body, {
    name: 'required|string|max:255', email: 'required|email|unique:employees,email', password: 'required|string|min:6',
    phone: 'nullable|string|max:50', position: 'required|string|max:100',
  });
  const e = insert('employees', { ...v, password: bcrypt.hashSync(v.password, 10), shelter_id: req.shelter.id });
  res.status(201).json({ message: 'Employee created successfully', data: M.employeeOut(e, false) });
}));
r.put('/shelter/employees/:id', ...base, wrap((req, res) => {
  const e = ownEmp(req, req.params.id);
  const v = validate(req.body, {
    name: 'sometimes|string|max:255', email: `sometimes|email|unique:employees,email,${e.id}`, password: 'sometimes|string|min:6',
    phone: 'nullable|string|max:50', position: 'sometimes|string|max:100',
  });
  if (v.password) v.password = bcrypt.hashSync(v.password, 10);
  res.json({ message: 'Employee updated successfully', data: M.employeeOut(update('employees', e.id, v), false) });
}));
r.delete('/shelter/employees/:id', ...base, wrap((req, res) => {
  del('employees', ownEmp(req, req.params.id).id);
  res.json({ message: 'Employee deleted successfully' });
}));

/* ----- boardings ----- */
r.get('/shelter/boardings', ...base, wrap((req, res) => {
  res.json({ message: 'Boardings retrieved successfully', data: paginate(req, 'SELECT * FROM boardings WHERE shelter_id = ? ORDER BY id DESC', [req.shelter.id], 15, b => M.boardingOut(b, ['user', 'pet'])) });
}));
const STEPS = { approve: ['pending', 'approved'], activate: ['approved', 'active'], complete: ['active', 'completed'], reject: [null, 'cancelled'] };
r.patch('/shelter/boardings/:id/:action', ...base, wrap((req, res) => {
  const step = STEPS[req.params.action];
  if (!step) throw new HttpError(404, 'Unknown action');
  const b = get('boardings', req.params.id);
  if (!b || b.shelter_id !== req.shelter.id) throw new HttpError(403, 'This boarding does not belong to your shelter');
  if (step[0] && b.status !== step[0]) throw new HttpError(400, `Boarding is not in ${step[0]} status`);
  res.json({ message: `Boarding ${step[1]} successfully`, data: update('boardings', b.id, { status: step[1] }) });
}));

/* ----- reports sent to this shelter ----- */
r.get('/shelter/reports', ...base, wrap((req, res) => {
  res.json({ message: 'Reports retrieved successfully', data: paginate(req, 'SELECT * FROM reports WHERE shelter_id = ? ORDER BY id DESC', [req.shelter.id], 10, x => ({ ...M.reportOut(x), user: M.userOf(x.user_id) })) });
}));
r.patch('/shelter/reports/:id', ...base, wrap((req, res) => {
  const rep = must('reports', req.params.id, 'Report');
  if (rep.shelter_id !== req.shelter.id) throw new HttpError(403, 'This report was not sent to your shelter');
  const v = validate(req.body, { status: 'required|string|in:pending,in_progress,resolved,rejected' });
  res.json({ message: 'Report updated successfully', data: M.reportOut(update('reports', rep.id, v)) });
}));

module.exports = r;
