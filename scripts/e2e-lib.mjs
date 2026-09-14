import { io } from 'socket.io-client';

export const URL = process.env.E2E_URL ?? 'http://localhost:3001';

export function connect() {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

/** Emit an ack-style event and resolve with its data, or reject with the server's error. */
export function req(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const cb = (res) => (res.ok ? resolve(res.data) : reject(new Error(`${event}: ${res.error}`)));
    payload === undefined ? socket.emit(event, cb) : socket.emit(event, payload, cb);
  });
}

/** Give broadcasts a moment to arrive. */
export const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/**
 * A player id that is unique to this process run.
 *
 * Ids used to be hardcoded, which made repeat runs against one server flaky: a
 * player from the previous run is still seated in their old room during the
 * two-minute disconnect grace period, and reusing their id makes the server
 * move them out of that room mid-test. Salting with the pid and a counter keeps
 * every run independent.
 */
let idCounter = 0;
export function playerId(prefix = 'p') {
  idCounter += 1;
  return `${prefix}-${process.pid}-${idCounter}`.slice(0, 60);
}

export function assert(condition, message) {
  if (!condition) throw new Error('ASSERT: ' + message);
}

/** Expect a request to be rejected; logs the reason. */
export async function rejects(promise, label) {
  try {
    await promise;
  } catch (e) {
    console.log(`${label} rejected:`, e.message);
    return;
  }
  throw new Error(`ASSERT: expected rejection for ${label}`);
}
