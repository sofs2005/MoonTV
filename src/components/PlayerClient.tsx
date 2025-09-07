'use client';

import Hls from 'hls.js';
import { Heart } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Plyr from 'plyr-react';
import 'plyr-react/plyr.css';

import {
  deleteFavorite,
  deletePlayRecord,
  deleteSkipConfig,
  generateStorageKey,
  getAllPlayRecords,
  getSkipConfig,
  isFavorited,
  saveFavorite,
  savePlayRecord,
  saveSkipConfig,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { Episode, Favorite, PlayRecord, SearchResult } from '@/lib/types';
import { getVideoResolutionFromM3u8, processImageUrl } from '@/lib/utils';

import EpisodeSelector from '@/components/EpisodeSelector';
import PageLayout from '@/components/PageLayout';

export default function PlayerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ... [All state and logic from the old PlayPageClient] ...
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    'searching' | 'preferring' | 'fetching' | 'ready'
  >('searching');
  const [loadingMessage, setLoadingMessage] = useState('正在搜索播放源...');
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SearchResult | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [skipConfig, setSkipConfig] = useState<{
    enable: boolean;
    intro_time: number;
    outro_time: number;
  }>({
    enable: true,
    intro_time: 0,
    outro_time: 0,
  });
  const skipConfigRef = useRef(skipConfig);
  useEffect(() => {
    skipConfigRef.current = skipConfig;
  }, [skipConfig]);

  const [mediaType] = useState(
    (searchParams.get('mediaType') as 'video' | 'audiobook' | 'music') ||
    'video'
  );
  const [videoTitle, setVideoTitle] = useState(searchParams.get('title') || '');
  const [videoYear, setVideoYear] = useState(searchParams.get('year') || '');
  const [videoCover, setVideoCover] = useState(
    searchParams.get('poster') || ''
  );
  const [videoDesc, setVideoDesc] = useState(
    searchParams.get('desc') || ''
  );
  const [currentSource, setCurrentSource] = useState(
    searchParams.get('source') || ''
  );
  const [currentId, setCurrentId] = useState(searchParams.get('id') || '');
  const [searchTitle] = useState(searchParams.get('stitle') || '');
  const [searchType] = useState(searchParams.get('stype') || '');
  const [needPrefer, setNeedPrefer] = useState(
    searchParams.get('prefer') === 'true'
  );
  const needPreferRef = useRef(needPrefer);
  useEffect(() => {
    needPreferRef.current = needPrefer;
  }, [needPrefer]);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);
  const currentSourceRef = useRef(currentSource);
  const currentIdRef = useRef(currentId);
  const videoTitleRef = useRef(videoTitle);
  const videoYearRef = useRef(videoYear);
  const detailRef = useRef<SearchResult | null>(detail);
  const currentEpisodeIndexRef = useRef(currentEpisodeIndex);

  useEffect(() => {
    currentSourceRef.current = currentSource;
    currentIdRef.current = currentId;
    detailRef.current = detail;
    currentEpisodeIndexRef.current = currentEpisodeIndex;
    videoTitleRef.current = videoTitle;
    videoYearRef.current = videoYear;
  }, [
    currentSource,
    currentId,
    detail,
    currentEpisodeIndex,
    videoTitle,
    videoYear,
  ]);

  const [videoUrl, setVideoUrl] = useState('');
  const totalEpisodes = detail?.episodes?.length || 0;
  const resumeTimeRef = useRef<number | null>(null);
  const [availableSources, setAvailableSources] = useState<SearchResult[]>([]);
  const [sourceSearchLoading, setSourceSearchLoading] = useState(false);
  const [sourceSearchError, setSourceSearchError] = useState<string | null>(
    null
  );
  const [optimizationEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('enableOptimization');
      if (saved !== null) {
        try {
          return JSON.parse(saved);
        } catch { /* ignore */ }
      }
    }
    return true;
  });
  const [precomputedVideoInfo, setPrecomputedVideoInfo] = useState<
    Map<string, { quality: string; loadSpeed: string; pingTime: number }>
  >(new Map());
  const [isEpisodeSelectorCollapsed, setIsEpisodeSelectorCollapsed] =
    useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const lastSaveTimeRef = useRef<number>(0);
  const plyrRef = useRef<any>(null);
  const hlsRef = useRef<Hls | null>(null);

  // ... All other functions (updateVideoUrl, saveProgress, etc.) go here ...
  const updateVideoUrl = async (
    detailData: SearchResult | null,
    episodeIndex: number
  ) => {
    if (
      !detailData ||
      !detailData.episodes ||
      episodeIndex >= detailData.episodes.length
    ) {
      setVideoUrl('');
      return;
    }

    const episode = detailData.episodes[episodeIndex];
    let urlToSet = typeof episode === 'string' ? episode : episode?.url || '';

    if (mediaType === 'audiobook' && urlToSet) {
      try {
        const response = await fetch(
          `/api/track-detail?source=${detailData.source}&id=${detailData.id}&trackId=${urlToSet}`
        );
        if (!response.ok) {
          throw new Error('Failed to fetch track URL');
        }
        const trackData = await response.json();
        if (trackData?.episodes?.[0]?.url) {
          urlToSet = trackData.episodes[0].url;
          if (urlToSet.startsWith('http://')) {
            urlToSet = urlToSet.replace('http://', 'https://');
          }
        } else {
          throw new Error('Invalid response format from track-detail');
        }
      } catch (error) {
        console.error('Error fetching audiobook track URL:', error);
        setError('获取音轨播放地址失败');
        setVideoUrl('');
        return;
      }
    }

    if (urlToSet !== videoUrl) {
      setVideoUrl(urlToSet);
    }
    setIsVideoLoading(false);
  };

  const saveCurrentPlayProgress = async () => {
    if (!currentSourceRef.current || !currentIdRef.current || !videoTitleRef.current || !detailRef.current?.source_name || !plyrRef.current?.plyr) {
      return;
    }
    const player = plyrRef.current.plyr;
    const currentTime = player.currentTime || 0;
    const duration = player.duration || 0;

    if (currentTime < 1 || !duration) {
      return;
    }
    // ... rest of the save logic
  };

  const handleEpisodeChange = (episodeNumber: number) => {
    if (episodeNumber >= 0 && episodeNumber < totalEpisodes) {
      saveCurrentPlayProgress();
      setCurrentEpisodeIndex(episodeNumber);
    }
  };

  const handleNextEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (d && d.episodes && idx < d.episodes.length - 1) {
      saveCurrentPlayProgress();
      setCurrentEpisodeIndex(idx + 1);
    }
  };

  const handleSetSkipTime = async (type: 'intro' | 'outro') => {
    if (!plyrRef.current?.plyr) return;
    const currentTime = plyrRef.current.plyr.currentTime;
    let newConfig = { ...skipConfigRef.current };

    if (type === 'intro') {
      newConfig.intro_time = currentTime;
    } else {
      const duration = plyrRef.current.plyr.duration;
      if (duration) {
        newConfig.outro_time = -(duration - currentTime);
      }
    }
    setSkipConfig(newConfig);
    await saveSkipConfig(currentSourceRef.current, currentIdRef.current, newConfig);
  };

  const handleClearSkipTimes = async () => {
    const newConfig = { enable: true, intro_time: 0, outro_time: 0 };
    setSkipConfig(newConfig);
    await deleteSkipConfig(currentSourceRef.current, currentIdRef.current);
  };

  useEffect(() => {
    updateVideoUrl(detail, currentEpisodeIndex);
  }, [detail, currentEpisodeIndex]);

  // ... The rest of the useEffects and logic ...

  return (
    <PageLayout activePath="/play">
      {/* ... Loading and Error states ... */}
      <div className='flex flex-col gap-3 py-4 px-5 lg:px-[3rem] 2xl:px-20'>
        {/* ... Title ... */}
        <div className='grid gap-4 ...'>
          <div className='relative w-full h-[300px] lg:h-full'>
            <Plyr
              ref={plyrRef as any}
              source={undefined as any} // Will be set in useEffect
              options={{
                controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
                settings: ['quality', 'speed', 'loop'],
                speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] }
              } as any}
            />
          </div>
          {/* ... Episode Selector ... */}
        </div>

        <div className="flex items-center justify-center space-x-4 p-4">
          <button onClick={() => handleSetSkipTime('intro')} className="px-4 py-2 bg-gray-700 text-white rounded">设置片头</button>
          <button onClick={() => handleSetSkipTime('outro')} className="px-4 py-2 bg-gray-700 text-white rounded">设置片尾</button>
          <button onClick={handleClearSkipTimes} className="px-4 py-2 bg-red-600 text-white rounded">清除设置</button>
        </div>

        {/* ... Details Display ... */}
      </div>
    </PageLayout>
  ) as any;
}