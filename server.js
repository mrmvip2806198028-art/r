const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data.json');
const UPLOADS = path.join(ROOT, 'uploads');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@nabgha.local').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'change-me-now');
const adminSessions = new Map();
const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://tlywcfgqlgbuugkhebmb.supabase.co').replace(/\/$/, '');
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || 'sb_publishable_ZpQDbZGYK80v_0sZKF5oIQ_uSnujdRS');

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function isAdmin(req) {
  const token = parseCookies(req).nabgha_admin;
  if (!token) return false;
  const exp = adminSessions.get(token);
  if (!exp || exp < Date.now()) { adminSessions.delete(token); return false; }
  return true;
}
function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  sendJson(res, 401, { error: 'غير مصرح' });
  return false;
}

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

function readRawBody(req, maxBytes = 600 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('الملف أكبر من الحد المسموح'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function safeFilename(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'file';
}
function readMaterials() {
  const d = readData();
  if (!Array.isArray(d.materials)) d.materials = [];
  return d.materials;
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
  '.woff2':'font/woff2',
  '.mp4':'video/mp4', '.webm':'video/webm', '.mov':'video/quicktime', '.pdf':'application/pdf', '.zip':'application/zip', '.doc':'application/msword', '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.ppt':'application/vnd.ms-powerpoint', '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};

async function api(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/materials') {
    const materials = readMaterials().slice().sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)));
    return sendJson(res, 200, materials);
  }

  if (req.method === 'POST' && pathname === '/api/admin/materials') {
    if (!requireAdmin(req, res)) return;
    const title = String(req.headers['x-title'] || '').trim();
    const type = String(req.headers['x-type'] || 'file');
    const description = String(req.headers['x-description'] || '').trim();
    const original = safeFilename(req.headers['x-filename']);
    if (!title || !['video','exam','test','file'].includes(type)) return sendJson(res, 400, {error:'بيانات المحتوى غير صحيحة'});
    const body = await readRawBody(req);
    if (!body.length) return sendJson(res, 400, {error:'الملف فارغ'});
    const id = crypto.randomUUID();
    const stored = `${id}-${original}`;
    fs.writeFileSync(path.join(UPLOADS, stored), body);
    const d = readData();
    if (!Array.isArray(d.materials)) d.materials = [];
    const item = { id, title, type, description, file_url:`/uploads/${encodeURIComponent(stored)}`, file_path:stored, created_at:new Date().toISOString() };
    d.materials.push(item);
    writeData(d);
    return sendJson(res, 200, item);
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/admin/materials/')) {
    if (!requireAdmin(req, res)) return;
    const id = pathname.split('/').pop();
    const d = readData();
    if (!Array.isArray(d.materials)) d.materials = [];
    const item = d.materials.find(x => x.id === id);
    if (!item) return sendJson(res, 404, {error:'المحتوى غير موجود'});
    d.materials = d.materials.filter(x => x.id !== id);
    writeData(d);
    try { fs.unlinkSync(path.join(UPLOADS, item.file_path)); } catch {}
    return sendJson(res, 200, {ok:true});
  }

  if (req.method === 'POST' && pathname === '/api/admin/supabase-session') {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return sendJson(res, 500, { error: 'إعدادات Supabase غير موجودة في السيرفر' });
    const { access_token } = await readBody(req);
    if (!access_token) return sendJson(res, 401, { error: 'جلسة Supabase غير موجودة' });
    const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` };
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers });
    if (!u.ok) return sendJson(res, 401, { error: 'جلسة Supabase غير صالحة' });
    const user = await u.json();
    const a = await fetch(`${SUPABASE_URL}/rest/v1/admin_users?select=user_id,role&user_id=eq.${encodeURIComponent(user.id)}`, { headers });
    if (!a.ok) return sendJson(res, 403, { error: 'تعذر التحقق من صلاحية الإدارة' });
    const admins = await a.json();
    if (!Array.isArray(admins) || !admins.length) return sendJson(res, 403, { error: 'هذا الحساب ليس لديه صلاحية الإدارة' });
    const token = crypto.randomBytes(32).toString('hex');
    adminSessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `nabgha_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`
    });
    return res.end(JSON.stringify({ ok: true, role: admins[0].role }));
  }

  if (req.method === 'POST' && pathname === '/api/admin/login') {
    const { email, password } = await readBody(req);
    if (String(email || '').trim().toLowerCase() !== ADMIN_EMAIL || String(password || '') !== ADMIN_PASSWORD)
      return sendJson(res, 401, { error: 'بيانات المدير غير صحيحة' });
    const token = crypto.randomBytes(32).toString('hex');
    adminSessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `nabgha_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    const token = parseCookies(req).nabgha_admin;
    if (token) adminSessions.delete(token);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': 'nabgha_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (pathname === '/api/admin/me') {
    return sendJson(res, 200, { admin: isAdmin(req) });
  }

  if (pathname === '/api/admin/data') {
    if (!requireAdmin(req, res)) return;
    const d = readData();
    const base = d.base || { students: 0, teachers: 0, schools: 0 };
    return sendJson(res, 200, {
      stats: {
        students: base.students + d.users.filter(u => u.role === 'student').length,
        teachers: base.teachers + d.users.filter(u => u.role === 'teacher').length,
        schools: base.schools + d.users.filter(u => u.role === 'school').length,
        satisfaction: d.ratings.length ? Math.round(d.ratings.reduce((a, x) => a + x, 0) / d.ratings.length / 5 * 100) : 0
      },
      users: d.users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt })),
      helpMessages: Array.isArray(d.helpMessages) ? d.helpMessages.slice().reverse().slice(0, 100) : []
    });
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/admin/users/')) {
    if (!requireAdmin(req, res)) return;
    const id = pathname.split('/').pop();
    const d = readData();
    const before = d.users.length;
    d.users = d.users.filter(u => u.id !== id);
    if (d.users.length === before) return sendJson(res, 404, { error: 'المستخدم غير موجود' });
    writeData(d);
    return sendJson(res, 200, { ok: true });
  }

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

  if (pathname === '/admin' || pathname === '/admin/') {
    const adminPath = path.join(ROOT, 'admin.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(adminPath).pipe(res);
  }
  if (pathname === '/admin.html') {
    res.writeHead(302, { Location: '/admin' });
    return res.end();
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
