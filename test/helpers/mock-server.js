'use strict';

/**
 * Minimal loopback-only HTTP mock server for offline orchestration tests.
 * Never binds anything but 127.0.0.1, never leaves the test process, and is
 * torn down at the end of every test that starts one.
 */

const http = require('node:http');

function startMockServer(routes) {
  const calls = [];

  const server = http.createServer((req, res) => {
    const key = `${req.method} ${req.url}`;
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let bodyJson;
      try { bodyJson = rawBody ? JSON.parse(rawBody) : undefined; } catch { bodyJson = undefined; }
      calls.push({ method: req.method, url: req.url, body: bodyJson });

      const handler = routes[key];
      if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `no mock route for ${key}` }));
        return;
      }
      try {
        const result = await handler(bodyJson);
        res.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body ?? {}));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        calls,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

module.exports = { startMockServer };
