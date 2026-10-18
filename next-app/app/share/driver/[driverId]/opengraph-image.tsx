import { ImageResponse } from 'next/og';
import { loadDriverCard } from '@/lib/share-cards';
import { getTeamColor } from '@/lib/f1-display';

export const runtime = 'nodejs';
export const alt = 'Driver card';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const stat = (label: string, value: string | number) => (
  <div style={{ display: 'flex', flexDirection: 'column', background: '#141414', borderRadius: 14, padding: '18px 22px', width: 200 }}>
    <div style={{ display: 'flex', fontSize: 18, color: '#777', letterSpacing: 2, textTransform: 'uppercase' }}>{label}</div>
    <div style={{ display: 'flex', fontSize: 52, fontWeight: 800, color: '#fff', marginTop: 6 }}>{String(value)}</div>
  </div>
);

export default async function Image({ params }: { params: { driverId: string } }) {
  const card = await loadDriverCard(params.driverId);
  if (!card) {
    return new ImageResponse(
      <div style={{ display: 'flex', width: '100%', height: '100%', background: '#0a0a0a', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 56 }}>
        Pitwall Analytics Hub
      </div>,
      { ...size },
    );
  }
  const color = getTeamColor(card.constructorId ?? undefined);

  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#0a0a0a', color: '#fff', padding: 56, position: 'relative' }}>
        <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 14, height: '100%', background: color }} />
        <div style={{ display: 'flex', fontSize: 26, color: '#888', letterSpacing: 3, textTransform: 'uppercase' }}>
          {card.season} driver card
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 620 }}>
            <div style={{ display: 'flex', fontSize: 88, fontWeight: 800, lineHeight: 1 }}>{card.name}</div>
            <div style={{ display: 'flex', fontSize: 34, color, marginTop: 22, fontWeight: 700 }}>{card.teamName ?? 'Free agent'}</div>
            <div style={{ display: 'flex', fontSize: 26, color: '#999', marginTop: 14 }}>
              {[card.nationality, card.code, card.number ? `#${card.number}` : null].filter(Boolean).join('  ·  ')}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 40 }}>
            <div style={{ display: 'flex', fontSize: 22, color: '#777', letterSpacing: 2, textTransform: 'uppercase' }}>
              {card.seasonPosition ? `P${card.seasonPosition} · ${card.seasonPoints} pts` : `${card.season} standings`}
            </div>
            <div style={{ display: 'flex', marginTop: 14 }}>
              {stat('Career wins', card.careerWins)}
              <div style={{ display: 'flex', width: 16 }} />
              {stat('Podiums', card.careerPodiums)}
            </div>
            <div style={{ display: 'flex', marginTop: 16 }}>
              {stat('Poles', card.careerPoles)}
              <div style={{ display: 'flex', width: 16 }} />
              {stat('Starts', card.careerStarts)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 'auto', fontSize: 22, color: '#555' }}>Pitwall Analytics Hub · Jolpica / Ergast data · race points only</div>
      </div>
    ),
    { ...size },
  );
}
