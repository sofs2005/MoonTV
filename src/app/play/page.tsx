import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const PlayerClient = dynamic(() => import('@/components/PlayerClient'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-black">
      <p className="text-white text-xl">正在加载播放器...</p>
    </div>
  ),
});

export default function PlayPage() {
  return (
    <Suspense>
      <PlayerClient />
    </Suspense>
  );
}