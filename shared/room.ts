/** Types shared by every game: rooms, players, and per-player room views. */

export type GameId =
  | 'ciphergrid'
  | 'infiltrator'
  | 'spectrum'
  | 'oneword'
  | 'nightfall'
  | 'letterrush'
  | 'pairrush'
  | 'bluffdice'
  | 'wordrace';

export interface BasePlayer {
  id: string;
  name: string;
  connected: boolean;
  /** Server-controlled player added by the host to fill seats. */
  isBot?: boolean;
}

export interface Room<P extends BasePlayer = BasePlayer, S = unknown> {
  code: string;
  game: GameId;
  hostId: string;
  players: P[];
  state: S;
  createdAt: number;
}

export interface RoomView<P extends BasePlayer = BasePlayer, V = unknown> {
  code: string;
  game: GameId;
  hostId: string;
  players: P[];
  you: P;
  state: V;
}

export const GAME_INFO: Record<GameId, { name: string; minPlayers: number; maxPlayers: number }> = {
  ciphergrid: { name: 'Cipher Grid', minPlayers: 4, maxPlayers: 20 },
  infiltrator: { name: 'Infiltrator', minPlayers: 3, maxPlayers: 12 },
  spectrum: { name: 'Spectrum', minPlayers: 3, maxPlayers: 10 },
  oneword: { name: 'One Word', minPlayers: 3, maxPlayers: 8 },
  nightfall: { name: 'Nightfall', minPlayers: 4, maxPlayers: 12 },
  letterrush: { name: 'Letter Rush', minPlayers: 2, maxPlayers: 10 },
  pairrush: { name: 'Pair Rush', minPlayers: 1, maxPlayers: 10 },
  bluffdice: { name: 'Bluff Dice', minPlayers: 2, maxPlayers: 8 },
  wordrace: { name: 'Word Race', minPlayers: 1, maxPlayers: 10 },
};
