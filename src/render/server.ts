/**
 * Local studio server: static files for the browser host + one WebSocket
 * channel that carries raw RGBA frames.
 *
 * Routes:
 *   /                 host.html
 *   /host/*           src/render/*   (host.js is plain JS)
 *   /dist/*           dist/*         (compiled engine + styles)
 *   /vendor/*         node_modules/@fontsource/* (OFL fonts)
 *   /project/*        the project folder (plan.json, audio, figures)
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.md': 'text/markdown; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
};

function inside(base: string, target: string): boolean {
  const b = resolve(base);
  const t = resolve(target);
  return t === b || t.startsWith(b + sep);
}

export interface StudioServer {
  url: string;
  port: number;
  /** Resolves once the export page has opened its channel. */
  channel(): Promise<FrameChannel>;
  close(): Promise<void>;
}

export class FrameChannel {
  private queue: { ok: (buf: Buffer) => void; bad: (err: Error) => void; timer: NodeJS.Timeout }[] = [];
  closed = false;

  constructor(
    private readonly ws: WebSocket,
    private readonly onClose: () => void,
  ) {
    ws.on('message', (data, isBinary) => {
      if (!isBinary) return;
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      const next = this.queue.shift();
      if (next) {
        clearTimeout(next.timer);
        next.ok(buf);
      }
    });
    ws.on('close', () => {
      this.closed = true;
      this.onClose();
      this.failAll(new Error('export channel closed'));
    });
    ws.on('error', (err) => {
      this.failAll(err instanceof Error ? err : new Error(String(err)));
    });
  }

  private failAll(err: Error): void {
    const pending = this.queue.splice(0);
    for (const entry of pending) {
      clearTimeout(entry.timer);
      entry.bad(err);
    }
  }

  /** Ask the host to render `t` and return its RGBA bytes. */
  request(t: number, timeoutMs = 30_000): Promise<Buffer> {
    if (this.closed) return Promise.reject(new Error('export channel closed'));
    return new Promise<Buffer>((ok, bad) => {
      const entry = {
        ok,
        bad,
        timer: setTimeout(() => {
          const at = this.queue.indexOf(entry);
          if (at >= 0) this.queue.splice(at, 1);
          bad(new Error(`frame timeout at t=${t.toFixed(3)} (${timeoutMs}ms)`));
        }, timeoutMs),
      };
      this.queue.push(entry);
      this.ws.send(JSON.stringify({ type: 'frame', t }));
    });
  }

  send(msg: unknown): void {
    if (!this.closed) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.closed = true;
    this.ws.close();
  }
}

export async function startServer(opts: {
  projectDir: string;
  rootDir: string;
  port?: number;
}): Promise<StudioServer> {
  const root = resolve(opts.rootDir);
  const project = resolve(opts.projectDir);
  let wsServer: WebSocketServer | null = null;
  let pending: ((ch: FrameChannel) => void) | null = null;
  let current: FrameChannel | null = null;
  let resolveChannel: (ch: FrameChannel) => void = () => {};
  const channelPromise = new Promise<FrameChannel>((ok) => {
    resolveChannel = ok;
  });

  const sendFile = (file: string, req: IncomingMessage, res: ServerResponse): void => {
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end(`not found: ${file}`);
      return;
    }
    const stat = statSync(file);
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
    const range = req.headers.range;
    if (range && type.startsWith('audio/')) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? Number(m[1]) : 0;
      const end = m && m[2] ? Number(m[2]) : stat.size - 1;
      res.writeHead(206, {
        'content-type': type,
        'content-range': `bytes ${start}-${end}/${stat.size}`,
        'accept-ranges': 'bytes',
        'content-length': end - start + 1,
      });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      'content-type': type,
      'content-length': stat.size,
      'cache-control': 'no-store',
      'accept-ranges': 'bytes',
    });
    createReadStream(file).pipe(res);
  };

  const server: Server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = decodeURIComponent(url.pathname);
      if (path === '/' || path === '/index.html') {
        return sendFile(join(root, 'src/render/host.html'), req, res);
      }
      if (path === '/favicon.ico') {
        res.writeHead(204).end();
        return;
      }
      const route = (prefix: string, base: string): boolean => {
        if (!path.startsWith(prefix)) return false;
        const rel = normalize(path.slice(prefix.length)).replace(/^[/\\]+/, '');
        const file = join(base, rel);
        if (!inside(base, file)) {
          res.writeHead(403).end('forbidden');
          return true;
        }
        sendFile(file, req, res);
        return true;
      };
      if (route('/host/', join(root, 'src/render'))) return;
      if (route('/dist/', join(root, 'dist'))) return;
      if (route('/vendor/', join(root, 'node_modules'))) return;
      if (route('/project/', project)) return;
      if (path === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, project, channel: current !== null }));
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(err));
    }
  });

  wsServer = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wsServer!.handleUpgrade(req, socket, head, (ws) => {
      wsServer!.emit('connection', ws, req);
    });
  });
  wsServer.on('connection', (ws: WebSocket) => {
    current = new FrameChannel(ws, () => {
      current = null;
    });
    if (pending) pending(current);
    resolveChannel(current);
    pending = (ch) => {
      /* only the first connection is used */
      void ch;
    };
  });

  await new Promise<void>((ok) => server.listen(opts.port ?? 0, '127.0.0.1', () => ok()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    channel: () => channelPromise,
    close: async () => {
      current?.close();
      wsServer?.close();
      await new Promise<void>((ok) => server.close(() => ok()));
    },
  };
}
