import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';

const SIZES = new Set([192, 512]);

/** App icons for the install prompt and push notifications. */
export async function GET(_req: Request, { params }: { params: { size: string } }) {
  const size = Number(params.size);
  if (!SIZES.has(size)) return new Response('Not found', { status: 404 });

  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: size * 0.66, height: size * 0.66, borderRadius: size * 0.15, background: '#E10600', color: '#fff', fontSize: size * 0.3, fontWeight: 800 }}>
          PA
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
