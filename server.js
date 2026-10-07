const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data.json');

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch {
    return { users: [], ratings: [], base: { students: 0, teachers: 0, schools: 0 } };
  }
}
function writeData(d) {
  fs.writeFileSync(DATA, JSON.stringify(d, null, 2), 'utf8');
}
function hash(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

const mime = {
  '.html':'text/html; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.svg':'image/svg+xml',
  '.ico':'image/x-icon',
  '.woff':'font/woff',
  '.woff2':'font/woff2'
};

async function api(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/stats') {
    const d = readData();
    const base = d.base || { students: 0, teachers: 0, schools: 0 };
    const students = base.students + d.users.filter(u => u.role === 'student').length;
    const teachers = base.teachers + d.users.filter(u => u.role === 'teacher').length;
    const schools = base.schools + d.users.filter(u => u.role === 'school').length;
    const satisfaction = d.ratings.length
      ? Math.round(d.ratings.reduce((a, x) => a + x, 0) / d.ratings.length / 5 * 100)
      : 0;
    return sendJson(res, 200, { students, teachers, schools, satisfaction });
  }

  if (req.method === 'POST' && pathname === '/api/register') {
    const { name, email, password, role } = await readBody(req);
    if (!name || !email || !password || !['student','teacher','school'].includes(role))
      return sendJson(res, 400, { error: 'بيانات التسجيل غير مكتملة' });

    const d = readData();
    const e = String(email).trim().toLowerCase();
    if (d.users.some(u => u.email === e))
      return sendJson(res, 409, { error: 'هذا البريد مسجل بالفعل' });

    d.users.push({
      id: crypto.randomUUID(),
      name: String(name).trim(),
      email: e,
      role,
      password: hash(String(password)),
      createdAt: new Date().toISOString()
    });
    writeData(d);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/login') {
    const { email, password } = await readBody(req);
    const d = readData();
    const e = String(email || '').trim().toLowerCase();
    const u = d.users.find(x => x.email === e && x.password === hash(String(password || '')));
    if (!u) return sendJson(res, 401, { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    return sendJson(res, 200, { ok: true, user: { name: u.name, email: u.email, role: u.role } });
  }

  if (req.method === 'POST' && pathname === '/api/help') {
    const body = await readBody(req);
    const d = readData();
    if (!Array.isArray(d.helpMessages)) d.helpMessages = [];
    d.helpMessages.push({ id: crypto.randomUUID(), message: String(body.message || '').slice(0, 2000), user: body.user || null, createdAt: new Date().toISOString() });
    writeData(d);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/rating') {
    const { rating } = await readBody(req);
    const n = Number(rating);
    if (!Number.isInteger(n) || n < 1 || n > 5)
      return sendJson(res, 400, { error: 'التقييم غير صحيح' });
    const d = readData();
    d.ratings.push(n);
    writeData(d);
    return sendJson(res, 200, { ok: true });
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/')) {
    try {
      const handled = await api(req, res, pathname);
      if (handled !== false) return;
      return sendJson(res, 404, { error: 'API غير موجود' });
    } catch (err) {
      console.error(err);
      return sendJson(res, 500, { error: 'حدث خطأ في السيرفر' });
    }
  }

  let filePath = pathname === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error('not file');
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Nabgha running on http://localhost:${PORT}`);
});
