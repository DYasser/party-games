import type { RoundResult, InfiltratorRoomView } from '@shared/infiltrator/types';

export default function InfiltratorResults({ room }: { room: InfiltratorRoomView }) {
  const { state, players, you } = room;
  const round = state.round!;
  const result = round.result!;
  const spyName = nameOf(players, round.spyId ?? '');
  const spyWon = result.winner === 'spy';
  const youAreSpy = round.spyId === you.id;
  const youWon = round.participantIds.includes(you.id) && (youAreSpy ? spyWon : !spyWon);

  return (
    <div className="spy-results">
      <div className={`banner ${spyWon ? 'spy-win' : 'agents-win'}`}>
        <strong>{spyWon ? 'The spy wins!' : 'The agents win!'}</strong>
        <span>{describe(result, spyName, players)}</span>
        {round.participantIds.includes(you.id) && <span className="you-result">{youWon ? 'You won this round.' : 'You lost this round.'}</span>}
      </div>

      <div className="spy-grid">
        <section className="card">
          <h3>The reveal</h3>
          <p>
            The location was <strong>{round.location}</strong>. The spy was <strong>{spyName}</strong>.
          </p>
          <ul className="player-list">
            {round.participantIds.map((id) => (
              <li key={id} className="player-row">
                <span className="player-name">
                  {nameOf(players, id)}
                  {id === you.id && <span className="muted"> (you)</span>}
                </span>
                <span className={`tag ${id === round.spyId ? 'spy-tag' : ''}`}>
                  {id === round.spyId ? 'SPY' : round.roles?.[id] ?? 'agent'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3>Scores after {state.roundsPlayed} round{state.roundsPlayed === 1 ? '' : 's'}</h3>
          <ul className="score-list">
            {players
              .slice()
              .sort((a, b) => (state.scores[b.id] ?? 0) - (state.scores[a.id] ?? 0))
              .map((p) => (
                <li key={p.id}>
                  <span>
                    {p.name}
                    {p.id === you.id && <span className="muted"> (you)</span>}
                  </span>
                  <strong>{state.scores[p.id] ?? 0}</strong>
                </li>
              ))}
          </ul>
          {you.id !== room.hostId && <p className="muted small-text">Waiting for the host to start the next round…</p>}
        </section>
      </div>
    </div>
  );
}

function describe(r: RoundResult, spyName: string, players: InfiltratorRoomView['players']): string {
  switch (r.reason) {
    case 'caught':
      return r.accuserId
        ? `${nameOf(players, r.accuserId)} correctly accused ${spyName}.`
        : `The final vote correctly picked ${spyName}.`;
    case 'wrongAccusation':
      return `${nameOf(players, r.accusedId ?? '')} was convicted, but ${spyName} was the spy all along.`;
    case 'spyGuessedRight':
      return `${spyName} correctly guessed the location.`;
    case 'spyGuessedWrong':
      return `${spyName} guessed "${r.guessedLocation}" and was wrong.`;
    case 'timeUp':
      return r.accusedId
        ? `Time ran out and the vote landed on ${nameOf(players, r.accusedId)}, not the spy.`
        : 'Time ran out and the vote was split.';
    case 'spyLeft':
      return `${spyName} left the game.`;
  }
}

function nameOf(players: InfiltratorRoomView['players'], id: string): string {
  return players.find((p) => p.id === id)?.name ?? 'someone';
}
