import { NextResponse } from 'next/server';

import { getAvailableAudioApiSites } from '@/lib/config';
import { getXimalayaTrackDetail } from '@/lib/downstream';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get('id');
  const sourceCode = searchParams.get('source');

  if (!trackId || !sourceCode) {
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

    const result = await getXimalayaTrackDetail(apiSite, trackId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}