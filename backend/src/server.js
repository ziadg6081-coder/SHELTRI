require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { db } = require('./db');
const { HttpError } = require('./lib');
const { seed } = require('./seed');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

fs.mkdirSync(path.join(__dirname, '..', 'storage', 'public'), { recursive: true });
app.use('/images', express.static(path.join(__dirname, '..', 'public', 'images')));
app.use('/storage', express.static(path.join(__dirname, '..', 'storage', 'public')));

app.get('/', (req, res) => res.json({ name: 'PawHaven API', status: 'running', api: '/api' }));
app.use('/api', require('./routes/public'));
app.use('/api', require('./routes/user'));
app.use('/api', require('./routes/admin'));
app.use('/api', require('./routes/employee'));
app.use('/api', require('./routes/shelter'));
app.use('/api', (req, res) => res.status(404).json({ message: 'Not Found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message, ...err.extra });
  if (err instanceof multer.MulterError) return res.status(422).json({ message: err.message });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON body' });
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

if (process.env.AUTO_SEED !== 'false' && db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0) {
  seed();
  console.log('Database was empty -> seeded demo data (user@petsapp.com / password)');
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8000;
  app.listen(port, () => console.log(`PawHaven API running on http://127.0.0.1:${port}/api`));
}
module.exports = app;
