import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol.js';
import type { BasePlayer } from '../../shared/room.js';
import { bluffdiceModule } from './games/bluffdice/module.js';
import { ciphergridModule } from './games/ciphergrid/module.js';
import { infiltratorModule } from './games/infiltrator/module.js';
import { letterrushModule } from './games/letterrush/module.js';
import type { GameModule } from './games/module.js';
import { nightfallModule } from './games/nightfall/module.js';
import { onewordModule } from './games/oneword/module.js';
import { pairrushModule } from './games/pairrush/module.js';
import { spectrumModule } from './games/spectrum/module.js';
import { wordraceModule } from './games/wordrace/module.js';
import { RoomManager } from './rooms.js';
import { setupSockets } from './socket.js';

const PORT = Number(process.env.PORT ?? 3001);
const isProd = process.env.NODE_ENV === 'production';

const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: isProd ? undefined : { origin: true },
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const rooms = new RoomManager();
// Modules are typed per game; the core treats them uniformly.
const modules = [
  ciphergridModule,
  infiltratorModule,
  spectrumModule,
  onewordModule,
  nightfallModule,
  letterrushModule,
  pairrushModule,
  bluffdiceModule,
  wordraceModule,
] as unknown as GameModule<BasePlayer, unknown>[];
setupSockets(io, rooms, modules);

if (isProd) {
  const clientDir = path.resolve(process.cwd(), 'dist/client');
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
}

server.listen(PORT, () => {
  console.log(`[party-games] server listening on http://localhost:${PORT}`);
});
