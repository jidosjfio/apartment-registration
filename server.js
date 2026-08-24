const http = require('http');
const fs = require('fs');
const path = require('path');

// Render provides PORT env var; local dev uses 8080
const PORT = process.env.PORT || 8080;
const CSV_FILE = path.join(__dirname, 'registrations.csv');
const PUBLIC_DIR = path.join(__dirname, 'public');

// CSV headers
const CSV_HEADERS = ['提交时间', '公寓', '房间号', '姓名', '身份证号码', '备注'];

// ============ Storage Backend Selection ============
// If DATABASE_URL is set (cloud deployment), use PostgreSQL.
// Otherwise use local CSV file (local development).
const DATABASE_URL = process.env.DATABASE_URL || '';
const USE_DB = DATABASE_URL.length > 0;

// ============ PostgreSQL Storage ============
let pool = null;

async function initDB() {
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS registrations (
      id SERIAL PRIMARY KEY,
      submit_time TEXT NOT NULL,
      apartment TEXT NOT NULL,
      room TEXT NOT NULL,
      name TEXT NOT NULL,
      id_number TEXT NOT NULL,
      notes TEXT DEFAULT ''
    )
  `);
  console.log('[DB] 数据库连接成功，数据表已就绪');
}

async function dbInsert(record) {
  await pool.query(
    'INSERT INTO registrations (submit_time, apartment, room, name, id_number, notes) VALUES ($1,$2,$3,$4,$5,$6)',
    [record.submitTime, record.apartment, record.room, record.name, record.idNumber, record.notes]
  );
}

async function dbSelect() {
  const result = await pool.query(
    'SELECT submit_time, apartment, room, name, id_number, notes FROM registrations ORDER BY id'
  );
  return result.rows.map(r => ({
    '提交时间': r.submit_time,
    '公寓': r.apartment,
    '房间号': r.room,
    '姓名': r.name,
    '身份证号码': r.id_number,
    '备注': r.notes
  }));
}

// ============ CSV Storage ============

// Ensure CSV file exists with headers
function ensureCSV() {
  if (!fs.existsSync(CSV_FILE)) {
    const headerLine = CSV_HEADERS.map(h => `"${h}"`).join(',') + '\n';
    // Write with BOM for Excel compatibility
    fs.writeFileSync(CSV_FILE, '\uFEFF' + headerLine, 'utf8');
  }
}

ensureCSV();

// Escape CSV field
function escapeCSV(field) {
  if (field === null || field === undefined) field = '';
  field = String(field);
  field = field.replace(/"/g, '""');
  return `"${field}"`;
}

// Append a record to CSV
function csvAppend(record) {
  const row = [
    record.submitTime || '',
    record.apartment || '',
    record.room || '',
    record.name || '',
    record.idNumber || '',
    record.notes || ''
  ].map(escapeCSV).join(',') + '\n';
  fs.appendFileSync(CSV_FILE, row, 'utf8');
}

// Parse a single CSV line (handles quoted fields)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Read all records from CSV
function csvSelect() {
  const content = fs.readFileSync(CSV_FILE, 'utf8');
  const clean = content.replace(/^\uFEFF/, '');
  const lines = clean.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });
    records.push(obj);
  }
  return records;
}

// Convert records to CSV text (with BOM for Excel)
function recordsToCSV(records) {
  let csv = '\uFEFF' + CSV_HEADERS.map(h => `"${h}"`).join(',') + '\n';
  for (const r of records) {
    csv += [
      r['提交时间'] || r.submitTime || '',
      r['公寓'] || r.apartment || '',
      r['房间号'] || r.room || '',
      r['姓名'] || r.name || '',
      r['身份证号码'] || r.idNumber || '',
      r['备注'] || r.notes || ''
    ].map(escapeCSV).join(',') + '\n';
  }
  return csv;
}

// ============ Unified Storage API ============
async function storageInsert(record) {
  if (USE_DB) await dbInsert(record);
  else csvAppend(record);
}

async function storageSelect() {
  if (USE_DB) return await dbSelect();
  return csvSelect();
}

async function storageToCSVText() {
  if (USE_DB) {
    const records = await dbSelect();
    return recordsToCSV(records);
  }
  return fs.readFileSync(CSV_FILE, 'utf8');
}

// Escape HTML to prevent XSS
function escapeHTML(str) {
  if (str === null || str === undefined) str = '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============ HTTP Server ============

// Parse request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// Get content type
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
  };
  return types[ext] || 'application/octet-stream';
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API: Register
  if (pathname === '/api/register' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const record = {
        submitTime: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        apartment: data.apartment || '',
        room: data.room || '',
        name: data.name || '',
        idNumber: data.idNumber || '',
        notes: data.notes || ''
      };
      await storageInsert(record);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, message: '登记成功' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: '服务器错误: ' + e.message }));
    }
    return;
  }

  // API: Get all records
  if (pathname === '/api/records' && req.method === 'GET') {
    try {
      const records = await storageSelect();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, data: records, total: records.length }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: '服务器错误: ' + e.message }));
    }
    return;
  }

  // API: Download CSV
  if (pathname === '/api/download' && req.method === 'GET') {
    try {
      const csvContent = await storageToCSVText();
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="registrations.csv"'
      });
      res.end(csvContent);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: '下载失败: ' + e.message }));
    }
    return;
  }

  // Admin page: view registrations as a styled HTML table
  if (pathname === '/admin' && req.method === 'GET') {
    try {
      const records = await storageSelect();
      const rows = records.map(r => `
        <tr>
          <td>${escapeHTML(r['提交时间'])}</td>
          <td>${escapeHTML(r['公寓'])}</td>
          <td>${escapeHTML(r['房间号'])}</td>
          <td>${escapeHTML(r['姓名'])}</td>
          <td>${escapeHTML(r['身份证号码'])}</td>
          <td>${escapeHTML(r['备注'])}</td>
        </tr>`).join('');
      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>登记数据查看</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #f5f6fa; margin: 0; padding: 20px; color: #333; }
  h1 { font-size: 20px; }
  .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
  .btn { display: inline-block; background: #07c160; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-size: 14px; }
  .count { color: #666; font-size: 14px; }
  .table-wrap { overflow-x: auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  table { border-collapse: collapse; width: 100%; min-width: 700px; }
  th, td { padding: 12px 14px; text-align: left; font-size: 14px; border-bottom: 1px solid #eee; white-space: nowrap; }
  th { background: #f0f2f5; color: #555; position: sticky; top: 0; }
  tr:last-child td { border-bottom: none; }
  .empty { text-align: center; padding: 40px; color: #999; }
</style>
</head>
<body>
  <div class="toolbar">
    <h1>公寓入住登记数据（共 ${records.length} 条）</h1>
    <div>
      <a class="btn" href="/api/download">下载 Excel 表格</a>
      <a class="btn" href="/admin" style="background:#576b95">刷新</a>
    </div>
  </div>
  <div class="table-wrap">
    ${records.length ? `<table>
      <thead><tr><th>提交时间</th><th>公寓</th><th>房间号</th><th>姓名</th><th>身份证号码</th><th>备注</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<div class="empty">还没有登记记录</div>'}
  </div>
</body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('加载失败: ' + e.message);
    }
    return;
  }

  // API: Health check (for uptime monitors)
  if (pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, status: 'ok' }));
    return;
  }

  // Serve static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
  }

  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': getContentType(filePath) });
  res.end(content);
}

async function start() {
  if (USE_DB) {
    try {
      await initDB();
    } catch (e) {
      console.error('[DB] 数据库连接失败: ' + e.message);
      console.error('[DB] 请检查 DATABASE_URL 环境变量是否正确');
      process.exit(1);
    }
  }

  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    const storageType = USE_DB ? 'PostgreSQL 云端数据库' : '本地 CSV 文件';
    console.log(`公寓登记小程序已启动: http://localhost:${PORT}`);
    console.log(`存储方式: ${storageType}`);
    console.log(`数据收集表格: ${USE_DB ? '云端数据库 (通过 /api/download 导出CSV)' : CSV_FILE}`);
    console.log(`查看收集数据: http://localhost:${PORT}/api/records`);
    console.log(`下载CSV表格: http://localhost:${PORT}/api/download`);
  });
}

start();
