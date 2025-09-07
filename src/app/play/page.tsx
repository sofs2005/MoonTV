import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const PlayerClient = dynamic(() => import('@/components/PlayerClient'), {
  ssr: false,
  loading: () => <div>Loading player...</div>,
});

export default function PlayPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayerClient />
    </Suspense>
  );
}
