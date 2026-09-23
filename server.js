const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 10000;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA, 'users.json');
const ORDERS_FILE = path.join(DATA, 'orders.json');
const BOOKS_FILE = path.join(DATA, 'books.json');
const SESSIONS_FILE = path.join(DATA, 'sessions.json');

if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
function ensureFile(file, fallback) { if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2)); }
ensureFile(USERS_FILE, []);
ensureFile(ORDERS_FILE, []);
ensureFile(BOOKS_FILE, []);
ensureFile(SESSIONS_FILE, []);
function read(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; } }
function write(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function safeUser(u) { return { id: u.id, name: u.name, email: u.email, address: u.address || null, createdAt: u.createdAt }; }

const sessions = new Map(read(SESSIONS_FILE).map(s => [s.token, s.userId]));
function saveSessions() { write(SESSIONS_FILE, [...sessions.entries()].map(([token, userId]) => ({ token, userId }))); }
const appSessions = new Map();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT, 'public')));

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const userId = sessions.get(token);
  if (!token || !userId) return res.status(401).json({ message: 'Please sign in first.' });
  const user = read(USERS_FILE).find(x => x.id === userId);
  if (!user) return res.status(401).json({ message: 'Session expired. Please sign in again.' });
  req.user = user; req.token = token; next();
}

app.get('/api/books', (req, res) => {
  const books = read(BOOKS_FILE);
  res.json(books);
});

app.post('/api/auth/signup', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (name.length < 2) return res.status(400).json({ message: 'Enter your full name.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email.' });
  if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  const users = read(USERS_FILE);
  if (users.some(u => u.email === email)) return res.status(409).json({ message: 'An account with this email already exists. Please log in.' });
  const user = { id: uuidv4(), name, email, passwordHash: await bcrypt.hash(password, 10), likedBookIds: [], createdAt: new Date().toISOString() };
  users.push(user); write(USERS_FILE, users);
  const token = uuidv4(); sessions.set(token, user.id); saveSessions();
  res.status(201).json({ message: 'Account created successfully.', token, user: safeUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = read(USERS_FILE).find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Incorrect email or password.' });
  const token = uuidv4(); sessions.set(token, user.id); saveSessions();
  res.json({ message: 'Login successful.', token, user: safeUser(user) });
});

app.post('/api/auth/logout', auth, (req, res) => { sessions.delete(req.token); saveSessions(); res.json({ message: 'Logged out successfully.' }); });
app.get('/api/auth/me', auth, (req, res) => res.json({ user: safeUser(req.user) }));

app.get('/api/orders', auth, (req, res) => {
  const orders = read(ORDERS_FILE).filter(o => o.userId === req.user.id).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  res.json(orders);
});

app.post('/api/orders', auth, (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const address = req.body.address || {};
  if (!items.length) return res.status(400).json({ message: 'Your cart is empty.' });
  if (!address.name || !address.phone || !address.line || !address.city || !address.pincode) return res.status(400).json({ message: 'Please complete the delivery address.' });
  const books = read(BOOKS_FILE);
  const cleanItems = [];
  let total = 0;
  for (const item of items) {
    const book = books.find(b => b.id === item.id);
    const qty = Math.max(1, Math.min(10, Number(item.qty) || 1));
    if (!book) return res.status(400).json({ message: 'One of the selected books is no longer available.' });
    if (book.stock < qty) return res.status(400).json({ message: `${book.title} has only ${book.stock} copy/copies left.` });
    cleanItems.push({ id: book.id, title: book.title, author: book.author, price: book.price, qty, image: book.image });
    total += book.price * qty;
  }
  cleanItems.forEach(item => { const b = books.find(x => x.id === item.id); b.stock -= item.qty; });
  write(BOOKS_FILE, books);
  const users = read(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (user) { user.address = { name: address.name, phone: address.phone, line: address.line, city: address.city, pincode: address.pincode }; write(USERS_FILE, users); }
  const order = { id: 'BN-' + Date.now().toString().slice(-8), userId: req.user.id, items: cleanItems, total, payment: req.body.payment || 'COD', address, status: 'Confirmed', createdAt: new Date().toISOString(), estimatedDelivery: new Date(Date.now()+4*86400000).toISOString().slice(0,10) };
  const orders = read(ORDERS_FILE); orders.push(order); write(ORDERS_FILE, orders);
  res.status(201).json({ message: 'Order placed successfully.', order });
});

app.post('/api/orders/:id/return', auth, (req, res) => {
  const orders = read(ORDERS_FILE);
  const order = orders.find(o => o.id === req.params.id && o.userId === req.user.id);
  if (!order) return res.status(404).json({ message: 'Order not found.' });
  if (!['Confirmed', 'Shipped', 'Delivered', 'Partially Requested'].includes(order.status)) return res.status(400).json({ message: 'This order is not eligible for a new return or exchange request.' });

  const itemIndex = Number(req.body.itemIndex);
  if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= order.items.length) return res.status(400).json({ message: 'Please select a valid book.' });
  const item = order.items[itemIndex];
  const purchasedQty = Math.max(1, Number(item.qty) || 1);
  const alreadyRequested = Math.max(0, Number(item.requestedQty) || 0);
  const remainingQty = purchasedQty - alreadyRequested;
  if (remainingQty <= 0) return res.status(400).json({ message: 'This book has already been requested for return or exchange.' });

  const requestedQty = Math.max(1, Math.min(remainingQty, Number(req.body.quantity) || 1));
  const type = String(req.body.type || 'Return') === 'Exchange' ? 'Exchange' : 'Return';
  const reason = String(req.body.reason || 'Changed my mind');
  const now = new Date().toISOString();

  // Keep every request separately so Return and Exchange are always visible
  // for the exact book/quantity that the customer selected.
  if (!Array.isArray(item.requests)) item.requests = [];
  item.requests.push({ type, quantity: requestedQty, reason, requestedAt: now });
  item.requestedQty = alreadyRequested + requestedQty;
  item.requestType = type;
  item.requestReason = reason;
  item.requestedAt = now;
  item.updatedAt = now;

  const allItemsFullyRequested = order.items.length > 0 && order.items.every(i => Number(i.requestedQty || 0) >= Number(i.qty || 0));
  const anyItemRequested = order.items.some(i => Number(i.requestedQty || 0) > 0);
  const allSameType = order.items.filter(i => Number(i.requestedQty || 0) > 0).every(i => i.requestType === type);
  order.status = allItemsFullyRequested ? (allSameType ? `${type} Requested` : 'Partially Requested') : (anyItemRequested ? 'Partially Requested' : 'Confirmed');
  order.updatedAt = now;
  write(ORDERS_FILE, orders);
  res.json({ message: `${type} request submitted for ${item.title} (${requestedQty} ${requestedQty === 1 ? 'book' : 'books'}).`, order });
});

app.post('/api/likes', auth, (req, res) => {
  const id = String(req.body.bookId || '');
  if (!id) return res.status(400).json({ message: 'Book ID is required.' });
  const users = read(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });
  const likes = new Set(Array.isArray(user.likedBookIds) ? user.likedBookIds : []);
  if (likes.has(id)) likes.delete(id); else likes.add(id);
  user.likedBookIds = [...likes];
  write(USERS_FILE, users);
  res.json({ liked: likes.has(id), likes: [...likes] });
});
app.get('/api/likes', auth, (req, res) => {
  const user = read(USERS_FILE).find(u => u.id === req.user.id);
  res.json({ likes: Array.isArray(user?.likedBookIds) ? user.likedBookIds : [] });
});

app.get('/admin', (req,res) => res.sendFile(path.join(ROOT,'public','admin.html')));
app.get('*', (req,res) => res.sendFile(path.join(ROOT,'public','index.html')));

app.listen(PORT, () => console.log(`BookNest running on port ${PORT}`));
