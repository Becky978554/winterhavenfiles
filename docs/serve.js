// Minimal static file server for local LAN access
// Usage: node serve.js [port]
// Binds to 0.0.0.0 so it can be reached from other devices on your network.

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const port = parseInt(process.argv[2] || process.env.PORT || '8000', 10) || 8000;
const host = '0.0.0.0';
const root = process.cwd();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

function send404(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('404 Not Found');
}

function safeJoin(base, p) {
  const resolved = path.resolve(base, '.' + p);
  if (resolved.indexOf(base) !== 0) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  try {
    const u = url.parse(req.url || '/');
    let pathname = u.pathname || '/';

    // Default to index.html for root or if path ends with '/'
    if (pathname.endsWith('/')) pathname += 'index.html';

    const safe = safeJoin(root, pathname);
    if (!safe) return send404(res);

    fs.stat(safe, (err, stat) => {
      if (err) return send404(res);
      if (stat.isDirectory()) {
        const idx = path.join(safe, 'index.html');
        fs.stat(idx, (ie, is) => {
          if (ie || !is.isFile()) return send404(res);
          streamFile(idx, res);
        });
      } else if (stat.isFile()) {
        streamFile(safe, res);
      } else {
        send404(res);
      }
    });
  } catch (e) {
    console.error('Request handling error', e);
    res.statusCode = 500; res.end('Internal Server Error');
  }
});

function streamFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const ct = mime[ext] || 'application/octet-stream';
  res.statusCode = 200;
  res.setHeader('Content-Type', ct);
  const rs = fs.createReadStream(filePath);
  rs.on('error', (e) => { console.error('Stream error', e); try { send404(res); } catch (err) { } });
  rs.pipe(res);
}

server.listen(port, host, () => {
  console.log(`Static server running at http://${host}:${port}/`);
  console.log(`Serving directory: ${root}`);
  console.log('Accessible on LAN via your machine IP, e.g. http://192.168.1.10:' + port + '/');
});

server.on('error', (e) => {
  console.error('Server error', e);
  process.exit(1);
});
