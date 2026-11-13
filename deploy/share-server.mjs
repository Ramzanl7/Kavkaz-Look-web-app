// Превью ссылок для роботов мессенджеров внутри контейнера (то же, что api/share.js на Vercel)
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { metaFor, inject } from './share.mjs';

const INDEX = '/usr/share/nginx/html/index.html';
http.createServer(async (req, res) => {
  try {
    const raw = String(req.headers['x-original-uri'] || '/');
    const path = ('/' + raw.replace(/^\/+/, '')).split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
    const m = await metaFor(path);
    const html = inject(readFileSync(INDEX, 'utf8'), m, origin + path);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' });
    res.end(html);
  } catch {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(readFileSync(INDEX, 'utf8'));
  }
}).listen(3001, '127.0.0.1');
