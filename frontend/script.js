const API = 'http://127.0.0.1:8000/api';          // <-- change if your Laravel runs elsewhere
const ORIGIN = API.replace(/\/api$/, '');
const EMO = {dog:'🐶',cat:'🐱',rabbit:'🐰',bird:'🦜',parrot:'🦜',hamster:'🐹',fish:'🐠',horse:'🐴',turtle:'🐢',product:'🦴'};
const emo = t => EMO[(t || '').toLowerCase()] || '🐾';
const S = {token: localStorage.tok || '', user: JSON.parse(localStorage.usr || 'null'), type: '', avail: false, page: 1, q: '', favs: new Set()};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(m, bad) {
  const t = $('#toast'); t.textContent = m; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', 3500);
}
async function api(p, o = {}) {
  const h = {Accept: 'application/json'}; let body;
  if (S.token) h.Authorization = 'Bearer ' + S.token;
  if (o.form) body = o.form; else if (o.body) { h['Content-Type'] = 'application/json'; body = JSON.stringify(o.body); }
  const r = await fetch(API + p, {method: o.method || 'GET', headers: h, body});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && S.token) logout();
    throw new Error(j.errors ? Object.values(j.errors)[0][0] : j.message || 'Something went wrong');
  }
  return j;
}
const img = (p, t, c = '') => {
  if (!p) return `<div class="ph ${c}">${emo(t)}</div>`;
  const u = /^http/.test(p) ? p : ORIGIN + (p.includes('/') ? '/storage/' : '/images/') + p;
  return `<img class="${c}" src="${esc(u)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;ph ${c}&quot;>${emo(t)}</div>'">`;
};
const modal = h => { $('#mb').innerHTML = h; $('#modal').classList.add('on'); };
const closeM = () => $('#modal').classList.remove('on');
const need = () => S.token || (authModal(), toast('Please sign in first 🐾', 1), false);
const fail = (s, e) => $(s).innerHTML = `<p class="empty">⚠️ ${esc(e.message)}<br><small>Is the backend running on ${ORIGIN} ?</small></p>`;
const A = {}, def = (k, f) => A[k] = async (...a) => { try { await f(...a); } catch (e) { toast(e.message, 1); } };
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (el) { if (el.tagName === 'A') e.preventDefault(); A[el.dataset.a]?.(el.dataset.v, el); }
  else if (e.target.id === 'modal') closeM();
});
document.addEventListener('keydown', e => e.key === 'Escape' && closeM());

/* ---------- auth ---------- */
function ui() {
  const b = $('#authBtn');
  b.textContent = S.token ? '🐾 ' + S.user.name.split(' ')[0] : 'Sign in';
  b.dataset.a = S.token ? 'me' : 'auth';
  const rl = S.user && S.user.role; $('#admBtn').hidden = !(rl === 'admin' || rl === 'shelter'); $('#admBtn').textContent = rl === 'admin' ? '⚙️ Admin' : '🏡 My Shelter';
}
function logout() {
  S.token = ''; S.user = null; S.favs = new Set(); localStorage.removeItem('tok'); localStorage.removeItem('usr');
  ui(); $('#cartN').textContent = 0;
}
function authModal(mode = 'login') {
  const s = mode === 'signup';
  modal(`<h2>${s ? 'Join the pack 🐾' : 'Welcome back 🐕'}</h2><form id="aF" class="form">${s ? '<div class="two"><label class="sw"><input type="radio" name="role" value="user" checked> 🐶 Adopter</label><label class="sw"><input type="radio" name="role" value="shelter"> 🏡 Shelter</label></div><input name="name" placeholder="Full name" required><div id="shF" class="form" style="display:none"><input name="shelter_name" placeholder="Shelter name"><input name="location" placeholder="Shelter location (city)"></div>' : ''}<input name="email" type="email" placeholder="Email" required><input name="password" type="password" placeholder="Password" minlength="6" required><button class="gold full">${s ? 'Create account' : 'Sign in'}</button></form><p class="mut c">${s ? 'Already a member?' : 'New here?'} <a href="#" data-a="auth" data-v="${s ? 'login' : 'signup'}"><b>${s ? 'Sign in' : 'Create account'}</b></a></p>`);
  if (s) document.querySelectorAll('#aF [name=role]').forEach(i => i.onchange = () => {
    const sh = i.value === 'shelter' && i.checked; $('#shF').style.display = sh ? 'grid' : 'none';
    $('#shF').querySelectorAll('input').forEach(x => x.required = sh);
  });
  $('#aF').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    try {
      if (s) await api('/signup', {method: 'POST', body: f});
      const j = await api('/login', {method: 'POST', body: {email: f.email, password: f.password}});
      S.token = j.data.token; S.user = j.data.user;
      localStorage.tok = S.token; localStorage.usr = JSON.stringify(S.user);
      closeM(); ui(); cartCount(); loadFavs();
      toast(s && f.role === 'shelter' ? 'Shelter registered — waiting for admin approval ⏳' : 'Welcome, ' + S.user.name + ' 🐾');
    } catch (x) { toast(x.message, 1); }
  };
}
def('auth', v => authModal(v));
def('close', closeM);
def('out', () => { logout(); closeM(); $('#adm').classList.remove('on'); toast('See you soon 👋'); });

/* ---------- home / pets ---------- */
async function home() {
  try {
    const j = await api('/'), P = j.pets || [], Sh = j.shelters || [];
    $('#sP').textContent = P.length; $('#sA').textContent = P.filter(p => !p.user_id).length; $('#sS').textContent = Sh.length;
    const f = P.find(p => p.photo && !p.user_id) || P[0];
    $('#feat').innerHTML = f
      ? `<div data-a="pet" data-v="${f.id}" style="cursor:pointer">${img(f.photo, f.type)}<div class="cap"><small>Featured friend</small><h3>${emo(f.type)} ${esc(f.name)}</h3></div></div>`
      : '<div class="ph" style="height:420px;border-radius:20px">🐕</div>';
    const opt = Sh.map(s => `<option value="${s.id}">${esc(s.name)} — ${esc(s.location)}</option>`).join('');
    document.querySelectorAll('select[name=shelter_id]').forEach(s => s.innerHTML = opt);
  } catch (e) { $('#feat').innerHTML = '<div class="ph" style="height:420px;border-radius:20px">🐕</div>'; }
}
const petCard = p => `<article class="card pet" data-a="pet" data-v="${p.id}">${img(p.photo, p.type, 'cimg')}<span class="tag ${p.user_id ? (p.adoption_status === 'pending' ? 'wait' : 'off') : ''}">${p.user_id ? (p.adoption_status === 'pending' ? 'Pending' : 'Adopted') : 'Available'}</span>${S.token ? `<button class="hrt" data-a="fav" data-v="${p.id}">${S.favs.has(p.id) ? '♥' : '♡'}</button>` : ''}<div class="cb"><h3>${emo(p.type)} ${esc(p.name)}</h3><p>${esc(p.type)} · ${esc(p.shelter?.name || 'Independent')}</p></div></article>`;
async function loadPets() {
  const q = new URLSearchParams({page: S.page}); if (S.type) q.set('type', S.type); if (S.avail) q.set('available', 'true'); if (S.q) q.set('search', S.q);
  try {
    const d = (await api('/petspublic?' + q)).data;
    $('#petGrid').innerHTML = d.data.length ? d.data.map(petCard).join('') : '<p class="empty">No pets found here yet 🐾</p>';
    $('#pager').innerHTML = d.last_page > 1 ? `<button ${d.current_page < 2 ? 'disabled' : ''} data-a="page" data-v="${d.current_page - 1}">‹</button><span>${d.current_page} / ${d.last_page}</span><button ${d.current_page >= d.last_page ? 'disabled' : ''} data-a="page" data-v="${d.current_page + 1}">›</button>` : '';
  } catch (e) { fail('#petGrid', e); }
}
$('#chips').innerHTML = ['', 'Dog', 'Cat', 'Rabbit', 'Bird', 'Hamster'].map(t => `<button class="chip${t ? '' : ' on'}" data-a="type" data-v="${t}">${t ? emo(t) + ' ' + t : '🐾 All'}</button>`).join('');
def('type', (v, el) => { S.type = v; S.page = 1; document.querySelectorAll('#chips .chip').forEach(c => c.classList.toggle('on', c === el)); loadPets(); });
def('page', v => { S.page = +v; loadPets(); $('#pets').scrollIntoView(); });
$('#av').onchange = e => { S.avail = e.target.checked; S.page = 1; loadPets(); };
def('pet', async id => {
  const p = (await api('/pets/' + id)).data;
  modal(`<div class="pd">${img(p.photo, p.type, 'big')}<div><h2>${emo(p.type)} ${esc(p.name)}</h2><p class="mut">${esc(p.type)}</p><p>📍 ${esc(p.shelter?.name || '—')}<br><span class="mut">${esc(p.shelter?.location || '')}</span></p><span class="tag st ${p.user_id ? 'off' : ''}">${p.user_id ? 'Already adopted' : 'Ready for a home'}</span>${p.user_id ? '' : `<button class="gold full" data-a="adopt" data-v="${p.id}">Adopt ${esc(p.name)} 💛</button>`}</div></div>`);
});
def('adopt', async id => {
  if (!need()) return;
  await api('/adopt', {method: 'POST', body: {pet_id: +id}});
  closeM(); toast('Adoption request sent 🎉'); loadPets(); home();
});

/* ---------- shelters ---------- */
async function loadShelters() {
  try {
    const d = (await api('/shelters-public')).data.data;
    $('#shelterGrid').innerHTML = d.map(s => `<article class="card sh"><div class="ico">🏡</div><h3>${esc(s.name)}</h3><p class="mut">📍 ${esc(s.location)}</p><p>🐾 ${s.pets_count} pets · 👩‍⚕️ ${s.employees_count} caretakers</p><button class="ghost" data-a="shel" data-v="${s.id}">View pets 🐾</button> <button class="ghost" data-a="donate" data-v="${s.id}" data-n="${esc(s.name)}">Donate 💝</button></article>`).join('') || '<p class="empty">No shelters yet</p>';
  } catch (e) { fail('#shelterGrid', e); }
}
def('donate', (id, el) => {
  if (!need()) return;
  modal(`<h2>Donate to ${esc(el.dataset.n)} 💝</h2><div class="chips" style="margin-bottom:14px">${[10, 25, 50, 100].map(n => `<button class="chip" data-a="amt" data-v="${n}">$${n}</button>`).join('')}</div><input id="amt" type="number" min="1" value="25"><button class="gold full" data-a="pay" data-v="${id}">Send donation</button>`);
});
def('amt', v => $('#amt').value = v);
def('pay', async id => {
  await api('/donations', {method: 'POST', body: {shelter_id: +id, amount: +$('#amt').value}});
  closeM(); toast('Thank you — you made a tail wag 💛');
});

/* ---------- shop & cart ---------- */
async function loadShop() {
  try {
    const d = (await api('/products?search=' + encodeURIComponent($('#q').value))).data.data;
    $('#shopGrid').innerHTML = d.map(p => `<article class="card"><div class="pimg">${img(p.image, 'product', 'cimg')}</div><div class="cb"><h3>${esc(p.name)}</h3><p>${esc(p.description || '')}</p><div class="row sp"><b class="price">$${(+p.price).toFixed(2)}</b>${p.stock > 0 ? `<button class="gold sm" data-a="add" data-v="${p.id}">Add 🛒</button>` : '<span class="tag off">Sold out</span>'}</div></div></article>`).join('') || '<p class="empty">No products found 🦴</p>';
  } catch (e) { fail('#shopGrid', e); }
}
$('#q').oninput = () => { clearTimeout(S.t); S.t = setTimeout(loadShop, 350); };
async function cartCount() {
  if (!S.token) return;
  try { $('#cartN').textContent = (await api('/cart')).data.reduce((a, i) => a + i.quantity, 0); } catch (e) {}
}
def('add', async id => { if (!need()) return; await api('/cart', {method: 'POST', body: {product_id: +id, quantity: 1}}); toast('Added to cart 🛍️'); cartCount(); });
def('cart', async () => {
  if (!need()) return;
  const j = await api('/cart');
  modal('<h2>Your cart 🛒</h2>' + (j.data.length
    ? j.data.map(i => `<div class="line"><span>${esc(i.product.name)}</span><span class="qty"><button data-a="qty" data-v="${i.id}:${i.quantity - 1}">−</button>${i.quantity}<button data-a="qty" data-v="${i.id}:${i.quantity + 1}">+</button></span><b>$${(i.quantity * i.product.price).toFixed(2)}</b><button class="x2" data-a="rm" data-v="${i.id}">✕</button></div>`).join('') + `<div class="line tot"><span>Total</span><b>$${j.cart_grand_total}</b></div><button class="gold full" data-a="checkout">Checkout &amp; pay</button>`
    : '<p class="empty">Your cart is empty 🐾</p>'));
});
def('qty', async v => { const [id, q] = v.split(':'); if (+q < 1) return A.rm(id); await api('/cart/' + id, {method: 'PUT', body: {quantity: +q}}); A.cart(); cartCount(); });
def('rm', async id => { await api('/cart/' + id, {method: 'DELETE'}); A.cart(); cartCount(); });
def('checkout', async () => {
  const o = await api('/orders', {method: 'POST'});
  for (const r of o.data) await api(`/orders/${r.id}/process-payment`, {method: 'POST'});
  closeM(); toast('Order paid — thank you! 🎉'); $('#cartN').textContent = 0; loadShop();
});
def('payo', async id => { await api(`/orders/${id}/process-payment`, {method: 'POST'}); toast('Paid ✅'); A.me(); });
def('cano', async id => { await api('/orders/' + id, {method: 'DELETE'}); toast('Order cancelled'); A.me(); });
def('canb', async id => { await api('/boardings/' + id, {method: 'DELETE'}); toast('Request cancelled'); A.me(); });

/* ---------- boarding & report ---------- */
$('#bForm').onsubmit = async e => {
  e.preventDefault(); if (!need()) return;
  try {
    const f = Object.fromEntries(new FormData(e.target)); f.shelter_id = +f.shelter_id;
    await api('/boardings', {method: 'POST', body: f}); e.target.reset(); toast('Stay requested 🏨 — awaiting approval');
  } catch (x) { toast(x.message, 1); }
};
$('#rForm').onsubmit = async e => {
  e.preventDefault(); if (!need()) return;
  const b = e.submitter, out = $('#rOut'); b.disabled = true; out.className = 'panel dark';
  out.innerHTML = '<div class="spin">🐾 Analysing the photo… this can take a minute</div>';
  try {
    const j = await api('/reports', {method: 'POST', form: new FormData(e.target)}), m = j.data.ml_analysis || {}, r = j.data.report;
    const c = m.confidence || 0;
    out.innerHTML = `<div class="ai"><h3>🤖 AI assessment</h3><div class="grid3"><div><small>Animal</small><b>${esc(m.animal_type || '—')}</b></div><div><small>Breed</small><b>${esc(m.breed || '—')}</b></div><div><small>Confidence</small><b>${Math.round(c > 1 ? c : c * 100)}%</b></div></div><span class="risk ${esc(r.risk_level)}">Risk: ${esc(r.risk_level)}</span><p>${esc(m.explanation || '')}</p>${(m.visible_conditions || []).map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>`;
    e.target.reset(); toast('Report sent to the shelter 🚑');
  } catch (x) { out.innerHTML = `<div class="big-e">⚠️</div><h3>Couldn't analyse</h3><p>${esc(x.message)}</p>`; }
  b.disabled = false;
};

/* ---------- profile ---------- */
def('me', async () => {
  const [h, o, b] = await Promise.all([api('/user/home'), api('/orders'), api('/boardings')]);
  const sec = (t, a) => `<h4>${t}</h4>` + (a.length ? a.join('') : '<p class="mut">Nothing yet</p>');
  const tot = h.donations.reduce((a, d) => a + d.amount, 0);
  modal(`<div class="prof"><div class="av">${esc(h.user.name[0])}</div><div><h2>${esc(h.user.name)}</h2><p class="mut">${esc(h.user.email)} · ${esc(h.user.role)}</p></div></div><button class="ghost sm" data-a="prof">✏️ Edit profile</button>`
    + sec('🐶 My adopted pets', h.adoptions.map(p => `<div class="line"><span>${emo(p.type)} ${esc(p.name)} <span class="mut">${esc(p.shelter?.name || '')}</span></span>${p.adoption_status === 'pending' ? '<span class="tag wait">Awaiting shelter approval</span><button class="ghost sm" data-a="canad">Cancel</button>' : '<span class="tag">Approved ✓</span>'}</div>`))
    + sec('❤️ Favorites', h.favorites.map(p => `<div class="line"><span data-a="pet" data-v="${p.id}" style="cursor:pointer">${emo(p.type)} ${esc(p.name)}</span><button class="ghost sm x2" data-a="unfav" data-v="${p.id}">Remove</button></div>`))
    + sec('🛍️ Orders', o.data.map(x => `<div class="line"><span>${esc(x.product?.name)} ×${x.quantity}</span><b>$${x.total_price}</b><span class="tag ${x.status === 'paid' ? '' : 'off'}">${x.status.replace('_', ' ')}</span>${x.status === 'pending_payment' ? `<button class="gold sm" data-a="payo" data-v="${x.id}">Pay</button><button class="ghost sm" data-a="cano" data-v="${x.id}">Cancel</button>` : ''}</div>`))
    + sec('🏨 Boardings', b.data.map(x => `<div class="line"><span>${emo(x.pet?.type)} ${esc(x.pet?.name)} · ${String(x.start_date).slice(0, 10)} → ${String(x.end_date).slice(0, 10)}</span><b>$${x.total_cost}</b><span class="tag">${x.status}</span>${x.status === 'pending' ? `<button class="ghost sm" data-a="canb" data-v="${x.id}">Cancel</button>` : ''}</div>`))
    + sec(`💝 Donations ($${tot} total)`, h.donations.map(d => `<div class="line"><span>${esc(d.shelter?.name)}</span><b>$${d.amount}</b></div>`))
    + sec('🚑 Reports', h.reports.map(r => `<div class="line"><span>${esc(r.animal_type || 'Report')} · ${esc(r.location)}</span><span class="risk ${r.risk_level}">${r.risk_level}</span><span class="tag">${r.status}</span></div>`))
    + '<button class="ghost full" data-a="out">Sign out</button>');
});
def('canad', async () => { await api('/adopt', {method: 'DELETE'}); toast('Adoption request cancelled'); A.me(); loadPets(); home(); });
def('unfav', async id => { await api('/favorites/' + id, {method: 'DELETE'}); S.favs.delete(+id); A.me(); loadPets(); });
def('fav', async id => {
  if (!need()) return; id = +id;
  if (S.favs.has(id)) { await api('/favorites/' + id, {method: 'DELETE'}); S.favs.delete(id); }
  else { await api('/favorites', {method: 'POST', body: {pet_id: id}}); S.favs.add(id); toast('Saved to favorites ❤️'); }
  loadPets();
});
async function loadFavs() {
  S.favs = new Set();
  if (S.token) try { (await api('/favorites')).data.forEach(p => S.favs.add(p.id)); } catch (e) {}
  loadPets();
}
def('prof', () => {
  const u = S.user;
  modal(`<h2>Edit profile ✏️</h2><form id="pfF" class="form"><input name="name" value="${esc(u.name)}" required><input name="email" type="email" value="${esc(u.email)}" required><p class="mut">Change password (optional)</p><input name="current_password" type="password" placeholder="Current password"><input name="password" type="password" minlength="6" placeholder="New password"><button class="gold full">Save</button></form>`);
  $('#pfF').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries([...new FormData(e.target)].filter(([, v]) => v));
    try { S.user = (await api('/user/profile', {method: 'PUT', body: f})).data; localStorage.usr = JSON.stringify(S.user); ui(); closeM(); toast('Profile updated ✅'); } catch (x) { toast(x.message, 1); }
  };
});
def('shel', async id => {
  const s = (await api('/shelters/' + id)).data;
  modal(`<h2>🏡 ${esc(s.name)}</h2><p class="mut">📍 ${esc(s.location)} · ${s.pets.length} pets · ${s.employees_count} caretakers</p><div class="grid mini">${s.pets.map(p => petCard({...p, shelter: s})).join('') || '<p class="empty">No pets yet</p>'}</div><button class="gold full" data-a="donate" data-v="${s.id}" data-n="${esc(s.name)}">Donate to this shelter 💝</button>`);
});
$('#ps').oninput = () => { clearTimeout(S.t2); S.t2 = setTimeout(() => { S.q = $('#ps').value; S.page = 1; loadPets(); }, 350); };

/* ---------- dashboards (admin + shelter) ---------- */
const D = {tab: 'overview', page: 1, f: '', rows: {}}, TAB = {};
const R = () => S.user && S.user.role, isA = () => R() === 'admin';
const TABS = {
  admin: [['overview', '📊 Overview'], ['shelters', '🏡 Shelters'], ['pets', '🐾 Pets'], ['users', '👥 Users'], ['donations', '💝 Donations'], ['reports', '🚑 Reports'], ['orders', '🛍️ Orders'], ['boardings', '🏨 Boardings'], ['products', '🦴 Products']],
  shelter: [['overview', '📊 Overview'], ['pets', '🐾 My pets'], ['adoptions', '💛 Adoptions'], ['donations', '💝 Donations'], ['staff', '👩‍⚕️ Staff'], ['boardings', '🏨 Boardings'], ['reports', '🚑 Reports']],
};
const bt = (l, a, v, c = '') => `<button class="ghost sm ${c}" data-a="${a}" data-v="${v ?? ''}">${l}</button>`;
const add = (a, l) => `<button class="gold sm" data-a="${a}">${l}</button>`;
const arow = (cells, ...b) => `<div class="tr">${cells}<span class="acts2">${b.join('')}</span></div>`;
const tbl = rows => `<div class="tbl">${rows.join('') || '<p class="empty">Nothing here yet 🐾</p>'}</div>`;
const head = (t, btn = '') => `<div class="row sp"><h3>${t}</h3>${btn}</div>`;
const sc = (i, l, v, c = '') => `<div class="sc ${c}"><span>${i}</span><b>${v}</b><small>${l}</small></div>`;
const stag = s => `<span class="tag ${['approved', 'resolved', 'paid', 'completed', 'active'].includes(s) ? '' : ['pending', 'pending_payment', 'in_progress'].includes(s) ? 'wait' : 'off'}">${esc(String(s).replace('_', ' '))}</span>`;
const bars = rows => { const m = Math.max(1, ...rows.map(r => +r[1])); return rows.length ? `<div class="bars">${rows.map(([k, v]) => `<div class="bc"><b>${v}</b><i style="height:${Math.max(4, v / m * 70)}%"></i><small>${esc(k)}</small></div>`).join('')}</div>` : '<p class="mut">No data yet</p>'; };
const apager = d => d.last_page > 1 ? `<div class="pager"><button ${d.current_page < 2 ? 'disabled' : ''} data-a="apage" data-v="${d.current_page - 1}">‹</button><span>${d.current_page} / ${d.last_page}</span><button ${d.current_page >= d.last_page ? 'disabled' : ''} data-a="apage" data-v="${d.current_page + 1}">›</button></div>` : '';
const pub = () => { loadPets(); loadShelters(); home(); };
const list = (path, title, row, addBtn = '', extra = () => '') => async () => {
  const d = (await api(`${path}${path.includes('?') ? '&' : '?'}page=${D.page}`)).data;
  d.data.forEach(x => D.rows[x.id] = x);
  return head(`${d.total} ${title}`, addBtn) + extra(d) + tbl(d.data.map(row)) + apager(d);
};
async function dash() {
  $('#adm').innerHTML = `<div class="ah"><h2>${isA() ? '⚙️ Admin Dashboard' : '🏡 Shelter Dashboard'}</h2><button class="ghost" data-a="admx">✕ Close</button></div><div class="at">${TABS[R()].map(([k, t]) => `<button class="chip${D.tab === k ? ' on' : ''}" data-a="atab" data-v="${k}">${t}</button>`).join('')}</div><div id="ab" class="ab"><div class="spin">Loading…</div></div>`;
  try { $('#ab').innerHTML = await TAB[R() + '.' + D.tab](); } catch (e) { $('#ab').innerHTML = `<p class="empty">⚠️ ${esc(e.message)}</p>`; }
}
def('dash', async () => { if (!TABS[R()]) return; D.tab = 'overview'; D.page = 1; D.f = ''; $('#adm').classList.add('on'); await dash(); });
def('admx', () => $('#adm').classList.remove('on'));
def('atab', async v => { D.tab = v; D.page = 1; D.f = ''; await dash(); });
def('apage', async v => { D.page = +v; await dash(); });
def('afilt', async v => { D.f = v; D.page = 1; await dash(); });
def('adel', async v => {
  const [t, id] = v.split(':');
  if (!confirm('Delete this item? This cannot be undone.')) return;
  await api(`/${t}/${id}`, {method: 'DELETE'}); toast('Deleted 🗑️'); dash(); pub();
});

/* --- admin tabs --- */
TAB['admin.overview'] = async () => {
  const s = (await api('/admin/stats')).data;
  return (s.shelters.pending ? `<div class="ban"><span>⏳ ${s.shelters.pending} shelter request(s) waiting for your approval.</span>${bt('Review now', 'atab', 'shelters')}</div>` : '')
    + `<div class="cards">${sc('👥', 'Adopters', s.users.total)}${sc('🏡', 'Approved shelters', s.shelters.approved)}${sc('⏳', 'Pending shelters', s.shelters.pending, 'warn')}${sc('🐾', 'Pets available', s.pets.available)}${sc('💛', 'Adopted', s.pets.adopted)}${sc('📨', 'Adoption requests', s.pets.pending_adoption)}${sc('👩‍⚕️', 'Shelter staff', s.employees)}${sc('💝', 'Donations', '$' + s.donations.total)}${sc('🛍️', 'Shop revenue', '$' + s.orders.revenue)}${sc('🏨', 'Boardings pending', s.boardings.pending)}${sc('🚑', 'Open reports', s.reports.pending + s.reports.in_progress)}${sc('🚨', 'High-risk open', s.reports.high_open, s.reports.high_open ? 'warn' : '')}${sc('📦', 'Low stock items', s.products.low_stock)}</div>`
    + `<div class="two2"><div class="panel"><h4>New accounts / month</h4>${bars(s.trends.signups)}</div><div class="panel"><h4>Donations / month ($)</h4>${bars(s.trends.donations)}</div></div>`
    + `<div class="two2"><div class="panel"><h4>Top shelters by donations ($)</h4>${bars(s.top_shelters.map(x => [x.name.split(' ')[0], x.total]))}</div><div class="panel"><h4>Latest accounts</h4>${s.recent.users.map(u => `<div class="line"><span>${esc(u.name)}</span><span class="mut">${esc(u.role)}</span></div>`).join('')}<h4>Latest reports</h4>${s.recent.reports.map(x => `<div class="line"><span>${esc(x.animal_type || '?')} · ${esc(x.location)}</span><span class="risk ${x.risk_level}">${x.risk_level}</span></div>`).join('') || '<p class="mut">None</p>'}</div></div>`;
};
TAB['admin.shelters'] = async () => {
  const d = (await api(`/shelters?page=${D.page}${D.f ? '&status=' + D.f : ''}`)).data;
  d.data.forEach(x => D.rows[x.id] = x);
  return head(`${d.total} shelters`, add('ash', '+ Add shelter')) + `<div class="chips">${['', 'pending', 'approved', 'rejected'].map(s => `<button class="chip${D.f === s ? ' on' : ''}" data-a="afilt" data-v="${s}">${s || 'All'}</button>`).join('')}</div>`
    + tbl(d.data.map(s => arow(`<b>🏡 ${esc(s.name)}</b><span class="mut">📍 ${esc(s.location)}${s.owner ? ' · ' + esc(s.owner.email) : ''}</span>${stag(s.status)}<span class="mut">🐾 ${s.pets_count} · 👩‍⚕️ ${s.employees_count} · 💝 $${s.total_donations}</span>`,
      s.status !== 'approved' ? bt('✓ Approve', 'sapp', s.id, 'ok') : '', s.status !== 'rejected' ? bt('✕ Reject', 'srej', s.id, 'x2') : '', bt('Edit', 'ash', s.id), bt('Delete', 'adel', 'shelters:' + s.id, 'x2')))) + apager(d);
};
def('sapp', async id => { await api(`/shelters/${id}/approve`, {method: 'PATCH'}); toast('Shelter approved ✅'); dash(); pub(); });
def('srej', async id => {
  const note = prompt('Reason for rejection (optional):'); if (note === null) return;
  await api(`/shelters/${id}/reject`, {method: 'PATCH', body: {note}}); toast('Shelter rejected'); dash();
});
const petRow = p => arow(`<span class="th">${img(p.photo, p.type, 'tn')}</span><b>${emo(p.type)} ${esc(p.name)}</b><span class="mut">${esc(p.type)}${p.age != null ? ' · ' + p.age + 'y' : ''}${isA() ? ' · ' + esc(p.shelter?.name || 'Boarder') : ''}</span>${p.user_id ? stag(p.adoption_status || 'approved') : '<span class="tag">Available</span>'}`, bt('Edit', 'apet', p.id), bt('Delete', 'adel', (isA() ? 'pets:' : 'shelter/pets:') + p.id, 'x2'));
TAB['admin.pets'] = list('/pets', 'pets', petRow, add('apet', '+ Add pet'));
TAB['shelter.pets'] = list('/shelter/pets', 'pets', petRow, add('apet', '+ Add pet'));
TAB['admin.users'] = list('/users', 'accounts', u => arow(`<b>${esc(u.name)}</b><span class="mut">${esc(u.email)}</span><span class="tag ${u.role === 'user' ? 'off' : ''}">${esc(u.role)}</span>`, u.id === S.user.id ? '' : bt('Delete', 'adel', 'users:' + u.id, 'x2')), add('ausr', '+ Add user / admin'));
TAB['admin.donations'] = list('/donations', 'donations', x => arow(`<b>$${x.amount}</b><span>${esc(x.user?.name)} → ${esc(x.shelter?.name)}</span><span class="mut">${String(x.created_at).slice(0, 10)}</span>`, bt('Delete', 'adel', 'donations:' + x.id, 'x2')));
TAB['shelter.donations'] = list('/shelter/donations', 'donations', x => arow(`<b>$${x.amount}</b><span>${esc(x.user?.name)} <span class="mut">${esc(x.user?.email)}</span></span><span class="mut">${String(x.created_at).slice(0, 10)}</span>`), '', d => `<div class="ban ok">💝 Total received: <b>$${d.total_amount}</b></div>`);
const repRow = x => arow(`<b>${emo(x.animal_type)} ${esc(x.animal_type || 'Unknown')}${x.breed ? ' · ' + esc(x.breed) : ''}</b><span class="mut">📍 ${esc(x.location)} · ${esc(x.user?.name || '')}${isA() ? ' · ' + esc(x.shelter?.name || '') : ''}</span><span class="risk ${esc(x.risk_level)}">${esc(x.risk_level)}</span>${stag(x.status)}`, bt('In progress', 'rst', x.id + ':in_progress'), bt('Resolve', 'rst', x.id + ':resolved', 'ok'), bt('Reject', 'rst', x.id + ':rejected', 'x2'));
TAB['admin.reports'] = list('/admin/reports', 'reports', repRow);
TAB['shelter.reports'] = list('/shelter/reports', 'reports', repRow);
def('rst', async v => { const [id, st] = v.split(':'); await api(`${isA() ? '/admin' : '/shelter'}/reports/${id}`, {method: 'PATCH', body: {status: st}}); toast('Updated ✅'); dash(); });
TAB['admin.orders'] = list('/admin/orders', 'orders', o => arow(`<b>#${o.id} ${esc(o.product?.name)} ×${o.quantity}</b><span class="mut">${esc(o.user?.name)}</span><b>$${o.total_price}</b>${stag(o.status)}`));
const bdRow = x => arow(`<b>${emo(x.pet?.type)} ${esc(x.pet?.name)}</b><span class="mut">${esc(x.user?.name)}${isA() ? ' → ' + esc(x.shelter?.name) : ''} · ${String(x.start_date).slice(0, 10)} → ${String(x.end_date).slice(0, 10)}</span><b>$${x.total_cost}</b>${stag(x.status)}`,
  ...(isA() ? [] : x.status === 'pending' ? [bt('Approve', 'bact', x.id + ':approve', 'ok'), bt('Reject', 'bact', x.id + ':reject', 'x2')] : x.status === 'approved' ? [bt('Check-in', 'bact', x.id + ':activate')] : x.status === 'active' ? [bt('Complete', 'bact', x.id + ':complete', 'ok')] : []));
TAB['admin.boardings'] = list('/admin/boardings', 'boardings', bdRow);
TAB['shelter.boardings'] = list('/shelter/boardings', 'boardings', bdRow);
def('bact', async v => { const [id, a] = v.split(':'); await api(`/shelter/boardings/${id}/${a}`, {method: 'PATCH'}); toast('Updated ✅'); dash(); });
TAB['admin.products'] = list('/products', 'products', p => arow(`<span class="th">${img(p.image, 'product', 'tn')}</span><b>${esc(p.name)}</b><span class="mut">$${p.price}</span><span class="tag ${p.stock <= 5 ? 'wait' : ''}">${p.stock} in stock</span>`, bt('Edit', 'aprod', p.id), bt('Delete', 'adel', 'products:' + p.id, 'x2')), add('aprod', '+ Add product'));

/* --- shelter-only tabs --- */
TAB['shelter.overview'] = async () => {
  const {shelter: sh, stats: s} = (await api('/shelter/me')).data;
  const ban = sh.status === 'pending' ? '<div class="ban">⏳ Your shelter is waiting for admin approval. You can set up your staff meanwhile — adding pets unlocks once approved.</div>'
    : sh.status === 'rejected' ? `<div class="ban bad">❌ Your shelter request was rejected.${sh.status_note ? ' Reason: ' + esc(sh.status_note) : ''}</div>` : '';
  return `${head(`🏡 ${esc(sh.name)} ${stag(sh.status)}`, bt('✏️ Edit info', 'shinfo'))}<p class="mut">📍 ${esc(sh.location)}</p>${ban}<div class="cards">${sc('🐾', 'Pets', s.pets)}${sc('✅', 'Available', s.available)}${sc('📨', 'Adoption requests', s.pending_adoptions, s.pending_adoptions ? 'warn' : '')}${sc('💛', 'Adopted', s.adopted)}${sc('👩‍⚕️', 'Staff', s.employees)}${sc('💝', 'Donations', '$' + s.donations_total)}${sc('🧾', 'Donation count', s.donations_count)}${sc('🏨', 'Boardings pending', s.boardings_pending)}${sc('🚑', 'Open reports', s.reports_open)}</div>`;
};
def('shinfo', async () => {
  const sh = (await api('/shelter/me')).data.shelter;
  modal(`<h2>Shelter info 🏡</h2><form id="siF" class="form"><input name="name" value="${esc(sh.name)}" required><input name="location" value="${esc(sh.location)}" required><button class="gold full">Save</button></form>`);
  $('#siF').onsubmit = async e => { e.preventDefault(); try { await api('/shelter/me', {method: 'PUT', body: Object.fromEntries(new FormData(e.target))}); closeM(); toast('Saved ✅'); dash(); pub(); } catch (x) { toast(x.message, 1); } };
});
TAB['shelter.adoptions'] = list('/shelter/adoptions', 'adoption records', p => arow(`<span class="th">${img(p.photo, p.type, 'tn')}</span><b>${emo(p.type)} ${esc(p.name)}</b><span class="mut">${esc(p.user?.name)} · ${esc(p.user?.email)}</span>${stag(p.adoption_status || 'approved')}`, ...(p.adoption_status === 'pending' ? [bt('✓ Accept', 'aacc', p.id, 'ok')] : []), bt(p.adoption_status === 'pending' ? '✕ Reject' : 'Revoke', 'arej', p.id, 'x2')));
def('aacc', async id => { await api('/shelter/adoptions/' + id, {method: 'PATCH'}); toast('Adoption accepted 💛'); dash(); pub(); });
def('arej', async id => { if (!confirm('Reject / revoke this adoption?')) return; await api('/shelter/adoptions/' + id, {method: 'DELETE'}); toast('Done'); dash(); pub(); });
TAB['shelter.staff'] = list('/shelter/employees', 'staff members', e => arow(`<b>👩‍⚕️ ${esc(e.name)}</b><span class="mut">${esc(e.email)}${e.phone ? ' · ' + esc(e.phone) : ''}</span><span class="tag off">${esc(e.position)}</span>`, bt('Edit', 'astf', e.id), bt('Delete', 'adel', 'shelter/employees:' + e.id, 'x2')), add('astf', '+ Add staff'));
def('astf', id => {
  const e = id ? D.rows[id] : {};
  const P = [...new Set(['Manager', 'Veterinarian', 'Caretaker', 'Volunteer', e.position].filter(Boolean))];
  modal(`<h2>${id ? 'Edit' : 'Add'} staff member 👩‍⚕️</h2><form id="stF" class="form"><input name="name" placeholder="Full name" value="${esc(e.name || '')}" required><input name="email" type="email" placeholder="Login email" value="${esc(e.email || '')}" required><input name="password" type="password" minlength="6" placeholder="${id ? 'New password (leave empty to keep)' : 'Password (min 6)'}" ${id ? '' : 'required'}><input name="phone" placeholder="Phone" value="${esc(e.phone || '')}"><select name="position">${P.map(p => `<option${p === e.position ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select><button class="gold full">Save</button></form>`);
  $('#stF').onsubmit = async e2 => {
    e2.preventDefault(); const f = Object.fromEntries([...new FormData(e2.target)].filter(([k, v]) => v || k === 'phone'));
    try { await api(id ? '/shelter/employees/' + id : '/shelter/employees', {method: id ? 'PUT' : 'POST', body: f}); closeM(); toast('Saved ✅'); dash(); } catch (x) { toast(x.message, 1); }
  };
});

/* --- forms (pets, shelters, users, products) --- */
def('apet', async id => {
  const pet = id ? D.rows[id] : {}, T = [...new Set(['Dog', 'Cat', 'Rabbit', 'Bird', 'Hamster', 'Other', pet.type].filter(Boolean))];
  const sh = isA() ? (await api('/')).shelters : [];
  modal(`<h2>${id ? 'Edit' : 'Add'} pet 🐾</h2><form id="pF" class="form"><input name="name" placeholder="Name" value="${esc(pet.name || '')}" required><select name="type">${T.map(t => `<option${t === pet.type ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>${isA() ? `<select name="shelter_id" required>${sh.map(s => `<option value="${s.id}"${s.id === pet.shelter_id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}<input name="age" type="number" min="0" placeholder="Age (years)" value="${pet.age ?? ''}"><label class="mut">Photo ${id ? '(leave empty to keep the current one)' : ''}</label><input name="photo" type="file" accept="image/*"><button class="gold full">${id ? 'Save changes' : 'Add pet'}</button></form>`);
  $('#pF').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target); if (!f.get('photo').size) f.delete('photo');
    const base = isA() ? '/pets' : '/shelter/pets';
    try { await api(id ? `${base}/${id}` : base, {method: id ? 'PUT' : 'POST', form: f}); closeM(); toast('Saved ✅'); dash(); pub(); } catch (x) { toast(x.message, 1); }
  };
});
def('ash', id => {
  const s = id ? D.rows[id] : {};
  modal(`<h2>${id ? 'Edit' : 'Add'} shelter 🏡</h2><form id="sF" class="form"><input name="name" placeholder="Shelter name" value="${esc(s.name || '')}" required><input name="location" placeholder="Location" value="${esc(s.location || '')}" required><button class="gold full">Save</button></form>`);
  $('#sF').onsubmit = async e => {
    e.preventDefault();
    try { await api(id ? '/shelters/' + id : '/shelters', {method: id ? 'PUT' : 'POST', body: Object.fromEntries(new FormData(e.target))}); closeM(); toast('Saved ✅'); dash(); pub(); } catch (x) { toast(x.message, 1); }
  };
});
def('ausr', () => {
  modal('<h2>Add account 👤</h2><form id="uF" class="form"><input name="name" placeholder="Full name" required><input name="email" type="email" placeholder="Email" required><input name="password" type="password" minlength="6" placeholder="Password (min 6)" required><select name="role"><option value="user">User</option><option value="admin">Admin</option></select><button class="gold full">Create</button></form>');
  $('#uF').onsubmit = async e => {
    e.preventDefault();
    try { await api('/users', {method: 'POST', body: Object.fromEntries(new FormData(e.target))}); closeM(); toast('Created ✅'); dash(); } catch (x) { toast(x.message, 1); }
  };
});
def('aprod', id => {
  const p = id ? D.rows[id] : {};
  modal(`<h2>${id ? 'Edit' : 'Add'} product 🦴</h2><form id="prF" class="form"><input name="name" placeholder="Name" value="${esc(p.name || '')}" required><textarea name="description" rows="2" placeholder="Description">${esc(p.description || '')}</textarea><div class="two"><input name="price" type="number" step="0.01" min="0.01" placeholder="Price" value="${p.price ?? ''}" required><input name="stock" type="number" min="0" placeholder="Stock" value="${p.stock ?? ''}" required></div><label class="mut">Image ${id ? '(leave empty to keep)' : ''}</label><input name="image" type="file" accept="image/*"><button class="gold full">Save</button></form>`);
  $('#prF').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target); if (!f.get('image').size) f.delete('image');
    try { await api(id ? '/products/' + id : '/products', {method: id ? 'PUT' : 'POST', form: f}); closeM(); toast('Saved ✅'); dash(); loadShop(); } catch (x) { toast(x.message, 1); }
  };
});

/* ---------- init ---------- */
document.querySelectorAll('input[type=date]').forEach(i => i.min = new Date().toISOString().slice(0, 10));
const io = new IntersectionObserver(es => es.forEach(x => x.isIntersecting && x.target.classList.add('in')), {threshold: .08});
document.querySelectorAll('.sec').forEach(s => io.observe(s));
ui(); home(); loadShelters(); loadShop(); cartCount(); loadFavs();
