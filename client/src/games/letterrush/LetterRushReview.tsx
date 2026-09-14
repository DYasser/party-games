import type { AnswerCell, LetterRushRoomView } from '@shared/letterrush/types';
import type { AppSocket } from '../../lib/socket';
import type { Act } from '../../lib/useRoom';
import { Countdown } from './LetterRushWriting';

interface Props {
  room: LetterRushRoomView;
  act: Act;
  socket: AppSocket;
}

export default function LetterRushReview({ room, act, socket }: Props) {
  const { state, you, players } = room;
  const round = state.round!;
  const isHost = room.hostId === you.id;
  const active = round.activeIds.includes(you.id);
  const done = round.doneReviewing.includes(you.id);
  const doneCount = round.activeIds.filter((id) => round.doneReviewing.includes(id)).length;
  const cells = round.cells ?? [];
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? round.names[id] ?? 'someone';

  const flag = (categoryIndex: number, playerId: string) =>
    act((ack) => socket.emit('letterrush:flag', { categoryIndex, playerId }, ack));

  return (
    <div className="letterrush-stage">
      <div className="card letterrush-header">
        <div className="letterrush-letter">{round.letter}</div>
        <div className="letterrush-header-mid">
          <span className="letterrush-kicker">Round {round.number} · Review</span>
          <strong>Check everyone&apos;s answers</strong>
          <span className="letterrush-progress">
            Flag anything that is not a real {round.letter}-answer. A majority of the other players rejects it. {doneCount} of{' '}
            {round.activeIds.length} done reviewing.
          </span>
        </div>
        <div className="letterrush-header-right">
          <Countdown endsAt={round.endsAt} serverNow={state.serverNow} label="Review ends in" />
        </div>
      </div>

      <div className="letterrush-review">
        {round.categories.map((name, ci) => (
          <section key={name} className="card">
            <h4>
              <span className="letterrush-num" style={{ marginRight: '0.5rem' }}>
                {ci + 1}
              </span>
              {name}
            </h4>
            <table className="letterrush-table">
              <tbody>
                {round.participantIds.map((id) => {
                  const cell: AnswerCell | undefined = cells[ci]?.[id];
                  const left = round.leftIds.includes(id);
                  const mine = id === you.id;
                  const flagged = cell?.flaggedBy.includes(you.id) ?? false;
                  const canFlag = active && !done && !mine && !left && !!cell && cell.status !== 'blank';
                  return (
                    <tr key={id} className={`${mine ? 'me' : ''} ${left ? 'left' : ''}`}>
                      <td className="who" title={nameOf(id)}>
                        {nameOf(id)}
                        {left && ' (left)'}
                      </td>
                      <td className={`ans ${cell && cell.status !== 'ok' && cell.status !== 'blank' ? 'struck' : ''}`}>
                        {cell?.text ? cell.text : <span className="blank">—</span>}
                      </td>
                      <td className="stat">{cell && <StatusTag status={cell.status} />}</td>
                      <td className="act">
                        {cell && cell.status !== 'blank' && !mine && (
                          <button
                            className={`btn small letterrush-flag ${flagged ? 'on' : ''}`}
                            onClick={() => flag(ci, id)}
                            disabled={!canFlag}
                            title={flagged ? 'Remove your flag' : 'Flag as invalid'}
                          >
                            {flagged ? 'Flagged' : 'Flag'}
                            {cell.flaggedBy.length > 0 && ` · ${cell.flaggedBy.length}`}
                          </button>
                        )}
                        {cell && cell.status !== 'blank' && mine && cell.flaggedBy.length > 0 && (
                          <span className="muted small-text">{cell.flaggedBy.length} flag{cell.flaggedBy.length === 1 ? '' : 's'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <div className="card letterrush-actions">
        <span className="muted small-text">
          {done ? 'You are done reviewing. Scores lock when everyone is done or the clock runs out.' : 'Happy with the grid? Mark yourself done.'}
        </span>
        <span style={{ display: 'inline-flex', gap: '0.5rem' }}>
          {isHost && (
            <button className="btn" onClick={() => act((ack) => socket.emit('letterrush:finishReview', ack))}>
              Finish review
            </button>
          )}
          {active && (
            <button className="btn primary" onClick={() => act((ack) => socket.emit('letterrush:done', ack))} disabled={done}>
              {done ? 'Done' : 'Done reviewing'}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

export function StatusTag({ status }: { status: AnswerCell['status'] }) {
  switch (status) {
    case 'ok':
      return <span className="tag letterrush-ok">+1</span>;
    case 'dupe':
      return <span className="tag letterrush-dupe">dupe</span>;
    case 'rejected':
      return <span className="tag letterrush-rejected">rejected</span>;
    case 'blank':
      return <span className="tag">blank</span>;
  }
}
