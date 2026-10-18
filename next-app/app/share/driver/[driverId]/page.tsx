import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadDriverCard } from '@/lib/share-cards';

export async function generateMetadata({ params }: { params: { driverId: string } }) {
  const card = await loadDriverCard(params.driverId);
  if (!card) return { title: 'Driver not found' };
  return {
    title: `${card.name}`,
    description: `${card.name}: ${card.careerWins} career wins, ${card.careerPodiums} podiums, ${card.careerPoles} poles.`,
  };
}

export default async function DriverSharePage({ params }: { params: { driverId: string } }) {
  const card = await loadDriverCard(params.driverId);
  if (!card) notFound();

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', padding: '48px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ fontSize: 13, color: '#888', letterSpacing: 2, textTransform: 'uppercase' }}>{card.season} driver card</div>
        <h1 style={{ fontSize: 44, margin: '12px 0 6px' }}>{card.name}</h1>
        <div style={{ color: '#aaa' }}>
          {[card.teamName, card.nationality, card.code, card.number ? `#${card.number}` : null].filter(Boolean).join(' · ')}
        </div>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 28 }}>
          <Stat label="Career wins" value={card.careerWins} />
          <Stat label="Podiums" value={card.careerPodiums} />
          <Stat label="Poles" value={card.careerPoles} />
          <Stat label="Starts" value={card.careerStarts} />
        </dl>
        <p style={{ color: '#666', fontSize: 13, marginTop: 24 }}>Race points only. Data from Jolpica / Ergast.</p>
        <Link href={`/dashboard?tab=drivers`} style={{ display: 'inline-block', marginTop: 16, color: '#E10600', fontWeight: 700 }}>
          Open the full driver profile →
        </Link>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: '#141414', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: 12, color: '#777', letterSpacing: 1.5, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  );
}
