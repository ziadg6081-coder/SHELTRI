require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, insert, update } = require('./db');

const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const pickN = (a, n) => [...a].sort(() => Math.random() - 0.5).slice(0, n);
const money = (min, max) => Math.round((min + Math.random() * (max - min)) * 100) / 100;

const TABLES = ['favorites', 'cart_items', 'orders', 'boardings', 'donations', 'reports', 'pets', 'employees', 'products', 'users', 'shelters'];
const SHELTERS = [
  ['Happy Paws', 'Cairo, Egypt'], ['Safe Haven', 'Giza, Egypt'], ['Whisker Lane', 'Alexandria, Egypt'],
  ['Second Chance', 'Mansoura, Egypt'], ['Golden Heart', 'Hurghada, Egypt'], ['Furry Friends', 'Luxor, Egypt'],
  ['Nile Strays Rescue', 'Aswan, Egypt'], ['Sunny Tails', 'Tanta, Egypt'], ['Rainbow Bridge', 'Port Said, Egypt'],
  ['Desert Paws', 'Sharm El-Sheikh, Egypt'],
].map(([n, l]) => [`${n} Animal Shelter`, l]);
const PET_NAMES = ['Rocky', 'Max', 'Buddy', 'Charlie', 'Bella', 'Luna', 'Cooper', 'Milo', 'Daisy', 'Simba', 'Nala', 'Oscar', 'Coco', 'Lucy', 'Toby',
  'Zoe', 'Leo', 'Ruby', 'Jack', 'Molly', 'Teddy', 'Lola', 'Bruno', 'Pepper', 'Ginger', 'Shadow', 'Misty', 'Biscuit', 'Peanut', 'Willow'];
const PERSONS = ['Ahmed Samir', 'Sara Hassan', 'Omar Khaled', 'Nour Ali', 'Mona Adel', 'Youssef Ibrahim', 'Hana Mostafa', 'Karim Fathy',
  'Laila Nabil', 'Mahmoud Reda', 'Salma Tarek', 'Adam Magdy'];
const TYPES = ['Dog', 'Cat', 'Dog', 'Cat', 'Rabbit', 'Bird', 'Hamster'];
const DOG_PHOTOS = ['adorable-brown-white-basenji-dog-smiling-giving-high-five-isolated-white.jpg', 'lovely-pet-portrait-isolated.jpg',
  'lucioliu-dog-4988985_1280.jpg', 'pexels-alexandru-rotariu-230845-733416.jpg', 'pexels-garfield-besa-95119-686094.jpg',
  'pexels-pixabay-97082.jpg', 'pexels-poodles2doodles-1458925.jpg'];
const PRODUCTS = ['Cat Food', 'Dog Food', 'Dog Leash', 'Cat Toy', 'Pet Shampoo', 'Bird Cage', 'Pet Bed', 'Dog Bowl'];
const ADJ = ['Premium', 'Classic', 'Deluxe', 'Organic', 'Cozy', 'Royal'];
const DESC = ['Premium food for healthy pets.', 'Durable toy for active cats.', 'Comfortable bed for dogs and cats.',
  'High-quality leash for daily walks.', 'Gentle shampoo suitable for all breeds.'];

function seed(fresh = false) {
  if (fresh) {
    db.exec('PRAGMA foreign_keys = OFF');
    TABLES.forEach(t => db.exec(`DELETE FROM ${t}`));
    db.exec(`DELETE FROM sqlite_sequence`);
    db.exec('PRAGMA foreign_keys = ON');
  }
  const pw = bcrypt.hashSync('password', 10);
  db.transaction(() => {
    const shelters = SHELTERS.map(([name, location]) => insert('shelters', { name, location }));

    const owner = insert('users', { name: 'Shelter Owner', email: 'shelter@petsapp.com', password: pw, role: 'shelter' });
    update('shelters', shelters[0].id, { owner_id: owner.id });
    const hope = insert('users', { name: 'Hope Founder', email: 'hope@petsapp.com', password: pw, role: 'shelter' });
    insert('shelters', { name: 'Hope Rescue (waiting approval)', location: 'Damietta, Egypt', status: 'pending', owner_id: hope.id });

    insert('users', { name: 'Admin User', email: 'admin@petsapp.com', password: pw, role: 'admin' });
    const testUser = insert('users', { name: 'Test User', email: 'user@petsapp.com', password: pw, role: 'user' });
    const users = PERSONS.map((name, i) => insert('users', { name, email: `${name.toLowerCase().replace(' ', '.')}${i}@example.com`, password: pw, role: 'user' }));

    insert('employees', { name: 'Test Employee', email: 'employee@petsapp.com', password: pw, phone: '555-0100', position: 'Manager', shelter_id: shelters[0].id });
    shelters.forEach((s, i) => ['Caretaker', 'Veterinarian'].forEach((position, j) => insert('employees', {
      name: `${pick(PERSONS).split(' ')[0]} ${pick(PERSONS).split(' ')[1]}`, email: `staff${i}${j}@petsapp.com`, password: pw,
      phone: `555-02${i}${j}`, position, shelter_id: s.id,
    })));

    const pets = [];
    let n = 0;
    shelters.forEach((s, i) => { for (let j = 0; j < 5; j++, n++) {
      const type = TYPES[(i * 5 + j) % TYPES.length];
      pets.push(insert('pets', {
        name: PET_NAMES[n % PET_NAMES.length], type, age: 1 + rnd(9), shelter_id: s.id,
        photo: type === 'Dog' ? DOG_PHOTOS[n % DOG_PHOTOS.length] : null,
      }));
    } });

    pickN(pets, 12).forEach((pet, i) => {
      update('pets', pet.id, { user_id: users[i].id, adoption_status: i < 8 ? 'approved' : 'pending' });
      update('users', users[i].id, { pet_id: pet.id });
    });

    [testUser, ...users].forEach(u => pickN(shelters, 1 + rnd(3)).forEach(s => insert('donations', {
      user_id: u.id, shelter_id: s.id, amount: pick([10, 25, 50, 100, 200]),
    })));

    const REPORTS = [
      ['Dog', 'Mixed Breed', ['visible ribs', 'matted fur'], 'high', 'pending', 'Skinny stray near the market.'],
      ['Cat', 'Egyptian Mau', ['injured paw'], 'high', 'in_progress', 'Cat limping on the street.'],
      ['Dog', 'Beagle', [], 'low', 'resolved', 'Friendly dog looking for its owner.'],
      ['Cat', 'Abyssinian', ['dirty coat'], 'medium', 'pending', 'Kitten alone in a parking lot.'],
      ['Dog', 'Pug', ['eye discharge'], 'medium', 'rejected', 'Dog with watery eyes at the park.'],
    ];
    REPORTS.forEach(([animal_type, breed, cond, risk_level, status, description], i) => insert('reports', {
      user_id: users[i].id, shelter_id: pick(shelters).id, description, location: `${pick(SHELTERS)[1].split(',')[0]} city center`,
      risk_level, status, animal_type, breed, confidence: money(0.6, 0.99),
      visible_conditions: JSON.stringify(cond), behavior_assessment: 'Calm but cautious.',
      explanation: 'Seeded demo report.',
    }));

    for (let i = 0; i < 40; i++) insert('products', {
      name: `${ADJ[i % ADJ.length]} ${PRODUCTS[i % PRODUCTS.length]}`, description: pick(DESC), price: money(10, 200), stock: 5 + rnd(46),
    });
  })();
}

if (require.main === module) {
  const fresh = process.argv.includes('--fresh');
  const has = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (has && !fresh) console.log('Database already has data. Use: npm run seed:fresh  (wipes everything first)');
  else {
    seed(fresh);
    console.log('Seeded.\n  Admin    -> admin@petsapp.com / password\n  Shelter  -> shelter@petsapp.com / password   (hope@petsapp.com = pending approval)\n  User     -> user@petsapp.com / password\n  Employee -> employee@petsapp.com / password');
  }
}
module.exports = { seed };
