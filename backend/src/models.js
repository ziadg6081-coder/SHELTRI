const { db, get } = require('./db');

const pub = u => { if (!u) return u; const { password, ...rest } = u; return rest; };
const shelterOf = id => (id ? get('shelters', id) || null : null);
const userOf = id => pub(get('users', id)) || null;

const petOut = (p, o = {}) => p && ({ ...p, shelter: shelterOf(p.shelter_id), ...(o.user ? { user: userOf(p.user_id) } : {}) });
const reportOut = r => r && ({
  ...r,
  visible_conditions: r.visible_conditions ? JSON.parse(r.visible_conditions) : [],
  shelter: shelterOf(r.shelter_id),
});
const cartOut = i => ({ ...i, product: get('products', i.product_id) || null });
const orderOut = o => ({ ...o, product: get('products', o.product_id) || null });
const boardingOut = (b, rel = ['pet', 'shelter']) => ({
  ...b,
  ...(rel.includes('pet') ? { pet: get('pets', b.pet_id) || null } : {}),
  ...(rel.includes('shelter') ? { shelter: shelterOf(b.shelter_id) } : {}),
  ...(rel.includes('user') ? { user: userOf(b.user_id) } : {}),
});
const donationOut = (d, rel = ['shelter']) => ({
  ...d,
  ...(rel.includes('shelter') ? { shelter: shelterOf(d.shelter_id) } : {}),
  ...(rel.includes('user') ? { user: userOf(d.user_id) } : {}),
});
const employeeOut = (e, withShelter = true) => {
  const { password, ...rest } = e;
  return withShelter ? { ...rest, shelter: shelterOf(rest.shelter_id) } : rest;
};
const shelterOut = s => s && ({ ...s, owner: s.owner_id ? userOf(s.owner_id) : null });
const shelterSql = admin => `SELECT s.*,
  (SELECT COUNT(*) FROM pets p WHERE p.shelter_id = s.id AND p.boarder = 0) AS pets_count,
  (SELECT COUNT(*) FROM employees e WHERE e.shelter_id = s.id) AS employees_count
  ${admin ? ', (SELECT COALESCE(SUM(amount), 0) FROM donations d WHERE d.shelter_id = s.id) AS total_donations' : ''}
  FROM shelters s`;

module.exports = { pub, shelterOf, userOf, petOut, reportOut, cartOut, orderOut, boardingOut, donationOut, employeeOut, shelterOut, shelterSql };
