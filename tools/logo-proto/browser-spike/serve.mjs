// Static server for the spike. Cross-origin isolated (COOP/COEP) so the WASM runtime may use threads.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
export function serve(port = 8780) {
  const server = createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
      const file = join(ROOT, path === '/' ? 'bench.html' : path);
      if (!file.startsWith(ROOT) || !(await stat(file)).isFile()) throw new Error('nope');
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': 'no-store',
      });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { await serve(); console.log('http://127.0.0.1:8780'); }
