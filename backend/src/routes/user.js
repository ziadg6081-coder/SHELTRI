const express = require('express');
const bcrypt = require('bcryptjs');
const { db, get, insert, update, del } = require('../db');
const {
  wrap, validate, must, own, HttpError, authUser, upload, checkImage, saveFile, removeFile, IMG_ALL, paginate, callAI,
} = require('../lib');
const M = require('../models');

const r = express.Router();
const round2 = n => Math.round(n * 100) / 100;
const RISK = { safe: 'low', low: 'low', medium: 'medium', medium_risk: 'medium', high: 'high', high_risk: 'high' };
const mapRisk = v => RISK[String(v || '').trim().toLowerCase()] || 'medium';

/* ----- dashboard ----- */
r.get('/user/home', authUser, wrap((req, res) => {
  const u = req.user;
  res.json({
    user: M.pub(u),
    adoptions: db.prepare('SELECT * FROM pets WHERE user_id = ? AND boarder = 0').all(u.id).map(p => M.petOut(p)),
    reports: db.prepare('SELECT * FROM reports WHERE user_id = ?').all(u.id).map(x => M.reportOut(x)),
    donations: db.prepare('SELECT * FROM donations WHERE user_id = ?').all(u.id).map(d => M.donationOut(d)),
    favorites: db.prepare('SELECT p.* FROM pets p JOIN favorites f ON f.pet_id = p.id WHERE f.user_id = ? ORDER BY f.id DESC').all(u.id).map(p => M.petOut(p)),
  });
}));

/* ----- adoption & donations ----- */
r.post('/adopt', authUser, wrap((req, res) => {
  const v = validate(req.body, { pet_id: 'required|integer|exists:pets,id' });
  const user = req.user;
  if (user.pet_id) throw new HttpError(409, 'You have already adopted a pet');
  const pet = get('pets', v.pet_id);
  if (pet.user_id || pet.boarder) throw new HttpError(409, 'This pet has already been adopted');
  db.transaction(() => {
    update('users', user.id, { pet_id: pet.id });
    update('pets', pet.id, { user_id: user.id, adoption_status: 'pending' });
  })();
  const p = M.petOut(get('pets', pet.id));
  res.json({ message: 'Pet adopted successfully', data: { user: { ...M.pub(get('users', user.id)), pet: p }, pet: p } });
}));

r.post('/donations', authUser, wrap((req, res) => {
  const v = validate(req.body, { shelter_id: 'required|integer|approved_shelter', amount: 'required|numeric|min:1' });
  const d = insert('donations', { user_id: req.user.id, shelter_id: v.shelter_id, amount: v.amount });
  res.status(201).json({ message: 'Donation submitted successfully', data: M.donationOut(d) });
}));

/* ----- reports (AI analysis) ----- */
r.get('/reports', authUser, wrap((req, res) => {
  const w = ['user_id = ?'], p = [req.user.id];
  if (req.query.status) { w.push('status = ?'); p.push(String(req.query.status)); }
  if (req.query.risk_level) { w.push('risk_level = ?'); p.push(String(req.query.risk_level)); }
  const sql = `SELECT * FROM reports WHERE ${w.join(' AND ')} ORDER BY created_at DESC, id DESC`;
  res.json({ message: 'Reports retrieved successfully', data: paginate(req, sql, p, 10, x => M.reportOut(x)) });
}));

r.post('/reports', authUser, upload.single('image'), wrap(async (req, res) => {
  const v = validate(req.body, {
    shelter_id: 'required|integer|approved_shelter',
    description: 'required|string|max:2000',
    location: 'required|string|max:255',
  });
  const file = checkImage(req.file, { required: true, max: 5120, types: IMG_ALL }, 'image');
  const ml = await callAI(file);
  const report = insert('reports', {
    user_id: req.user.id, shelter_id: v.shelter_id, description: v.description, location: v.location,
    image: saveFile(file, 'reports'), risk_level: mapRisk(ml.risk_level), status: 'pending',
    animal_type: ml.animal_type, breed: ml.breed, confidence: ml.confidence,
    visible_conditions: JSON.stringify(Array.isArray(ml.visible_conditions) ? ml.visible_conditions : []),
    behavior_assessment: ml.behavior_assessment, explanation: ml.explanation,
  });
  res.status(201).json({ message: 'Report submitted successfully', data: { report: M.reportOut(report), ml_analysis: ml } });
}));

r.get('/reports/:id', authUser, wrap((req, res) => {
  const rep = own(must('reports', req.params.id, 'Report'), req.user, 'You do not have permission to view this report');
  res.json({ message: 'Report retrieved successfully', data: M.reportOut(rep) });
}));

r.delete('/reports/:id', authUser, wrap((req, res) => {
  const rep = own(must('reports', req.params.id, 'Report'), req.user, 'You do not have permission to delete this report');
  removeFile(rep.image);
  del('reports', rep.id);
  res.json({ message: 'Report deleted successfully' });
}));

/* ----- cart ----- */
r.get('/cart', authUser, wrap((req, res) => {
  const items = db.prepare('SELECT * FROM cart_items WHERE user_id = ? ORDER BY id').all(req.user.id).map(M.cartOut);
  const total = items.reduce((a, i) => a + i.quantity * (i.product ? i.product.price : 0), 0);
  res.json({ message: 'Cart retrieved successfully', cart_grand_total: round2(total), data: items });
}));

r.post('/cart', authUser, wrap((req, res) => {
  const v = validate(req.body, { product_id: 'required|integer|exists:products,id', quantity: 'required|integer|min:1' });
  const { stock, ...product } = get('products', v.product_id);
  const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?').get(req.user.id, v.product_id);
  if (existing) {
    const item = update('cart_items', existing.id, { quantity: existing.quantity + v.quantity });
    return res.json({ message: 'Product added to cart successfully', cart_item: item, product });
  }
  const item = insert('cart_items', { user_id: req.user.id, product_id: v.product_id, quantity: v.quantity });
  res.status(201).json({ message: 'Product added to cart successfully', cart_item: item, product });
}));

r.put('/cart/:id', authUser, wrap((req, res) => {
  const item = own(get('cart_items', req.params.id), req.user, 'This cart item does not belong to you');
  const v = validate(req.body, { quantity: 'required|integer|min:1' });
  res.json({ message: 'Cart item updated successfully', data: update('cart_items', item.id, { quantity: v.quantity }) });
}));

r.delete('/cart/:id', authUser, wrap((req, res) => {
  const item = own(get('cart_items', req.params.id), req.user, 'This cart item does not belong to you');
  del('cart_items', item.id);
  res.json({ message: 'Item removed from cart' });
}));

/* ----- orders ----- */
const NOT_YOURS_ORDER = 'This order does not belong to you';
r.get('/orders', authUser, wrap((req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id').all(req.user.id).map(M.orderOut);
  res.json({ message: 'Orders retrieved successfully', data: rows });
}));

r.get('/orders/:id', authUser, wrap((req, res) => {
  const o = own(get('orders', req.params.id), req.user, NOT_YOURS_ORDER);
  res.json({ message: 'Order retrieved successfully', data: M.orderOut(o) });
}));

r.post('/orders', authUser, wrap((req, res) => {
  const items = db.prepare('SELECT * FROM cart_items WHERE user_id = ? ORDER BY id').all(req.user.id);
  if (!items.length) throw new HttpError(400, 'Cart is empty');
  const created = db.transaction(() => items.map(i => {
    const p = get('products', i.product_id);
    const o = insert('orders', {
      user_id: req.user.id, product_id: i.product_id, quantity: i.quantity,
      total_price: round2(p.price * i.quantity), status: 'pending_payment',
    });
    del('cart_items', i.id);
    return o;
  }))();
  res.status(201).json({ message: 'Orders created successfully from cart', data: created });
}));

r.post('/orders/:id/process-payment', authUser, wrap((req, res) => {
  const o = own(get('orders', req.params.id), req.user, NOT_YOURS_ORDER);
  if (o.status !== 'pending_payment') throw new HttpError(400, 'Order is not in pending_payment status');
  const p = get('products', o.product_id);
  if (!p || p.stock < o.quantity) throw new HttpError(400, 'Insufficient product stock');
  const paid = db.transaction(() => {
    update('products', p.id, { stock: p.stock - o.quantity });
    return update('orders', o.id, { status: 'paid' });
  })();
  res.json({ message: 'Payment processed successfully', data: paid });
}));

r.delete('/orders/:id', authUser, wrap((req, res) => {
  const o = own(get('orders', req.params.id), req.user, NOT_YOURS_ORDER);
  if (o.status !== 'pending_payment') throw new HttpError(400, `Order cannot be cancelled (status: ${o.status})`);
  update('orders', o.id, { status: 'cancelled' });
  res.json({ message: 'Order cancelled successfully' });
}));

/* ----- boardings ----- */
const NOT_YOURS_BOARDING = 'This boarding does not belong to you';
r.get('/boardings', authUser, wrap((req, res) => {
  const rows = db.prepare('SELECT * FROM boardings WHERE user_id = ? ORDER BY id').all(req.user.id).map(b => M.boardingOut(b));
  res.json({ message: 'Boardings retrieved successfully', data: rows });
}));

r.get('/boardings/:id', authUser, wrap((req, res) => {
  const b = own(get('boardings', req.params.id), req.user, NOT_YOURS_BOARDING);
  res.json({ message: 'Boarding retrieved successfully', data: M.boardingOut(b) });
}));

r.post('/boardings', authUser, wrap((req, res) => {
  const v = validate(req.body, {
    pet_name: 'required|string|max:255',
    pet_type: 'required|string|max:100',
    shelter_id: 'required|integer|approved_shelter',
    start_date: 'required|date_format:Y-m-d|after_or_equal:today',
    end_date: 'required|date_format:Y-m-d|after_or_equal:start_date',
    notes: 'nullable|string',
  });
  const days = Math.max(1, Math.round((Date.parse(v.end_date) - Date.parse(v.start_date)) / 86400000));
  const rate = 25;
  const boarding = db.transaction(() => {
    // a boarder is the customer's own pet: it never appears in the adoption catalogue
    const pet = insert('pets', { name: v.pet_name, type: v.pet_type, user_id: req.user.id, boarder: 1 });
    return insert('boardings', {
      user_id: req.user.id, pet_id: pet.id, shelter_id: v.shelter_id, start_date: v.start_date, end_date: v.end_date,
      daily_rate: rate, total_cost: days * rate, status: 'pending', payment_status: 'unpaid', notes: v.notes,
    });
  })();
  res.status(201).json({
    message: 'Boarding request created successfully along with pet profile',
    data: M.boardingOut(boarding, ['pet']),
  });
}));

r.delete('/boardings/:id', authUser, wrap((req, res) => {
  const b = own(get('boardings', req.params.id), req.user, NOT_YOURS_BOARDING);
  if (b.status !== 'pending') throw new HttpError(400, `Boarding cannot be cancelled (status: ${b.status})`);
  update('boardings', b.id, { status: 'cancelled' });
  res.json({ message: 'Boarding request cancelled' });
}));

/* ----- adoption cancel, favourites, profile ----- */
r.delete('/adopt', authUser, wrap((req, res) => {
  const user = req.user, pet = get('pets', user.pet_id);
  if (!pet) throw new HttpError(404, 'You have no adoption request');
  if (pet.adoption_status === 'approved') throw new HttpError(400, 'This adoption was already approved and cannot be cancelled');
  db.transaction(() => {
    update('users', user.id, { pet_id: null });
    update('pets', pet.id, { user_id: null, adoption_status: null });
  })();
  res.json({ message: 'Adoption request cancelled' });
}));

r.get('/favorites', authUser, wrap((req, res) => {
  const rows = db.prepare('SELECT p.* FROM pets p JOIN favorites f ON f.pet_id = p.id WHERE f.user_id = ? ORDER BY f.id DESC').all(req.user.id);
  res.json({ message: 'Favorites retrieved successfully', data: rows.map(p => M.petOut(p)) });
}));

r.post('/favorites', authUser, wrap((req, res) => {
  const v = validate(req.body, { pet_id: 'required|integer|exists:pets,id' });
  if (!db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND pet_id = ?').get(req.user.id, v.pet_id)) {
    insert('favorites', { user_id: req.user.id, pet_id: v.pet_id });
  }
  res.status(201).json({ message: 'Added to favorites' });
}));

r.delete('/favorites/:petId', authUser, wrap((req, res) => {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND pet_id = ?').run(req.user.id, Number(req.params.petId));
  res.json({ message: 'Removed from favorites' });
}));

r.put('/user/profile', authUser, wrap((req, res) => {
  const v = validate(req.body, {
    name: 'sometimes|string|max:255', email: `sometimes|email|unique:users,email,${req.user.id}`,
    password: 'sometimes|string|min:6', current_password: 'sometimes|string',
  });
  const patch = {};
  if (v.name) patch.name = v.name;
  if (v.email) patch.email = v.email;
  if (v.password) {
    if (!v.current_password || !bcrypt.compareSync(v.current_password, req.user.password)) {
      throw new HttpError(422, 'The current password is incorrect.', { errors: { current_password: ['The current password is incorrect.'] } });
    }
    patch.password = bcrypt.hashSync(v.password, 10);
  }
  res.json({ message: 'Profile updated successfully', data: M.pub(update('users', req.user.id, patch)) });
}));

module.exports = r;
