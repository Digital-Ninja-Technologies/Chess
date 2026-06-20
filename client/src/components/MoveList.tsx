import { useEffect, useRef } from 'react';

interface MoveListProps {
  moves: string[];
}

export default function MoveList({ moves }: MoveListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [moves]);

  const pairs: Array<[string, string | undefined]> = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push([moves[i], moves[i + 1]]);
  }

  return (
    <div className="move-list">
      <div className="panel-title">Moves</div>
      <div className="moves-scroll">
        {pairs.length === 0 && (
          <p className="no-moves">No moves yet</p>
        )}
        {pairs.map(([white, black], idx) => (
          <div key={idx} className={`move-row ${idx === pairs.length - 1 ? 'last' : ''}`}>
            <span className="move-num">{idx + 1}.</span>
            <span className={`move-san white-move ${!black && idx === pairs.length - 1 ? 'current' : ''}`}>{white}</span>
            {black && (
              <span className={`move-san black-move ${idx === pairs.length - 1 ? 'current' : ''}`}>{black}</span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
