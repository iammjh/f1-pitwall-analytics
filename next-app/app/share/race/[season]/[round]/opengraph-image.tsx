import { ImageResponse } from 'next/og';
import { loadRaceCard } from '@/lib/share-cards';
import { getTeamColor } from '@/lib/f1-display';

export const runtime = 'nodejs';
export const alt = 'Race card';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { season: string; round: string } }) {
  const card = await loadRaceCard(params.season, params.round);
  if (!card) {
    return new ImageResponse(
      <div style={{ display: 'flex', width: '100%', height: '100%', background: '#0a0a0a', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 56 }}>
        Pitwall Analytics Hub
      </div>,
      { ...size },
    );
  }
  const winnerColor = getTeamColor(card.winner?.constructorId ?? undefined);
  const medals = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#0a0a0a', color: '#fff', padding: 56, position: 'relative' }}>
        <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: '100%', height: 12, background: winnerColor }} />
        <div style={{ display: 'flex', fontSize: 26, color: '#888', letterSpacing: 3, textTransform: 'uppercase' }}>
          {card.season} · Round {card.round}
        </div>
        <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, marginTop: 18, lineHeight: 1.05 }}>{card.raceName}</div>
        <div style={{ display: 'flex', fontSize: 26, color: '#999', marginTop: 12 }}>
          {[card.circuit, [card.locality, card.country].filter(Boolean).join(', '), card.date].filter(Boolean).join('  ·  ')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
          {card.podium.map((p, i) => (
            <div key={p.position} style={{ display: 'flex', alignItems: 'center', marginTop: i ? 14 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 28, background: medals[i] ?? '#333', color: '#000', fontSize: 28, fontWeight: 800 }}>
                {p.position}
              </div>
              <div style={{ display: 'flex', width: 10, height: 40, marginLeft: 18, marginRight: 18, background: getTeamColor(p.constructorId ?? undefined) }} />
              <div style={{ display: 'flex', fontSize: 40, fontWeight: 700 }}>{p.name}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: 'auto', fontSize: 24, color: '#999' }}>
          {card.fastestLap ? `Fastest lap: ${card.fastestLap.name}${card.fastestLap.time ? ` · ${card.fastestLap.time}` : ''}` : 'Pitwall Analytics Hub'}
        </div>
      </div>
    ),
    { ...size },
  );
}
