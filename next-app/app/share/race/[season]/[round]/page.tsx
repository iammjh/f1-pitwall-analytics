import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadRaceCard } from '@/lib/share-cards';

export async function generateMetadata({ params }: { params: { season: string; round: string } }) {
  const card = await loadRaceCard(params.season, params.round);
  if (!card) return { title: 'Race not found' };
  return {
    title: `${card.raceName} ${card.season}`,
    description: card.winner ? `${card.winner.name} won the ${card.raceName}.` : `${card.raceName} ${card.season}.`,
  };
}

export default async function RaceSharePage({ params }: { params: { season: string; round: string } }) {
  const card = await loadRaceCard(params.season, params.round);
  if (!card) notFound();

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', padding: '48px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ fontSize: 13, color: '#888', letterSpacing: 2, textTransform: 'uppercase' }}>{card.season} · Round {card.round}</div>
        <h1 style={{ fontSize: 44, margin: '12px 0 6px' }}>{card.raceName}</h1>
        <div style={{ color: '#aaa' }}>{[card.circuit, card.locality, card.country, card.date].filter(Boolean).join(' · ')}</div>
        <ol style={{ listStyle: 'none', padding: 0, marginTop: 28 }}>
          {card.podium.map((p) => (
            <li key={p.position} style={{ background: '#141414', borderRadius: 12, padding: '14px 18px', marginBottom: 10, fontSize: 20, fontWeight: 700 }}>
              <span style={{ color: '#888', marginRight: 14 }}>P{p.position}</span>{p.name}
            </li>
          ))}
        </ol>
        {card.fastestLap && (
          <p style={{ color: '#aaa' }}>Fastest lap: {card.fastestLap.name}{card.fastestLap.time ? ` · ${card.fastestLap.time}` : ''}</p>
        )}
        <Link href="/dashboard?tab=story" style={{ display: 'inline-block', marginTop: 16, color: '#E10600', fontWeight: 700 }}>
          Open the race story →
        </Link>
      </div>
    </main>
  );
}
