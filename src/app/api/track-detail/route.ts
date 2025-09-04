import { NextResponse } from 'next/server';

import { getAvailableAudioApiSites } from '@/lib/config';
import { getXimalayaTrackPlayUrl } from '@/lib/downstream';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const albumId = searchParams.get('id');
  const sourceCode = searchParams.get('source');
  const trackId = searchParams.get('trackId'); // The actual track ID to play

  if (!albumId || !sourceCode || !trackId) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
  }

  if (sourceCode !== 'ximalaya') {
    return NextResponse.json({ error: '无效的音源类型' }, { status: 400 });
  }

  try {
    const apiSites = await getAvailableAudioApiSites();
    const apiSite = apiSites.find((site) => site.key === sourceCode);

    if (!apiSite) {
      return NextResponse.json({ error: '无效的API来源' }, { status: 400 });
    }

    // The 'id' from the search result is the albumId. We now need the real track URL.
    // The frontend should pass the specific trackId it wants to play.
    const playUrl = await getXimalayaTrackPlayUrl(apiSite, trackId);

    // We need to return a SearchResult-like object for the frontend player
    // The frontend expects an `episodes` array where one of the items has the url
    return NextResponse.json({
      id: albumId,
      episodes: [{ url: playUrl }],
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}