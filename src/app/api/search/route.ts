import { NextResponse } from 'next/server';

import {
  getAvailableAudioApiSites,
  getCacheTime,
  getConfig,
} from '@/lib/config';
import { searchFromApi, searchFromAudioApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const type = (searchParams.get('type') || 'video') as
    | 'video'
    | 'audiobook'
    | 'music';

  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        },
      }
    );
  }

  const config = await getConfig();
  let searchPromises;

  if (type === 'video') {
    const apiSites = config.SourceConfig.filter((site) => !site.disabled);
    searchPromises = apiSites.map((site) => searchFromApi(site, query));
  } else {
    const audioApiSites = (await getAvailableAudioApiSites()).filter(
      (site) => site.contentType === type
    );
    searchPromises = audioApiSites.map((site) =>
      searchFromAudioApi(site, query)
    );
  }

  try {
    const results = await Promise.all(searchPromises);
    let flattenedResults = results.flat();
    if (!config.SiteConfig.DisableYellowFilter) {
      flattenedResults = flattenedResults.filter((result) => {
        const typeName = result.type_name || '';
        return !yellowWords.some((word: string) => typeName.includes(word));
      });
    }
    const cacheTime = await getCacheTime();

    return NextResponse.json(
      { results: flattenedResults },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
