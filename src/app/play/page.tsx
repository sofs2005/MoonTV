/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import { Heart } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import Plyr from 'plyr-react';
import 'plyr-react/dist/plyr.css';

import {
  deleteFavorite,
  deletePlayRecord,
  generateStorageKey,
  getAllPlayRecords,
  isFavorited,
  saveFavorite,
  savePlayRecord,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { Episode, Favorite, PlayRecord, SearchResult } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';

import EpisodeSelector from '@/components/EpisodeSelector';
import PageLayout from '@/components/PageLayout';

function PlayPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // -----------------------------------------------------------------------------
  // 状态变量（State）
  // -----------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    'searching' | 'fetching' | 'ready'
  >('searching');
  const [loadingMessage, setLoadingMessage] = useState('正在搜索播放源...');
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SearchResult | null>(null);
  const [favorited, setFavorited] = useState(false);

  // 媒体基本信息
  const [mediaType] = useState(
    (searchParams.get('mediaType') as 'video' | 'audiobook' | 'music') ||
    'video'
  );
  const [videoTitle, setVideoTitle] = useState(searchParams.get('title') || '');
  const [videoYear, setVideoYear] = useState(searchParams.get('year') || '');
  const [videoCover, setVideoCover] = useState(
    searchParams.get('poster') || ''
  );
  const [videoDesc, setVideoDesc] = useState(searchParams.get('desc') || '');
  const [currentSource, setCurrentSource] = useState(
    searchParams.get('source') || ''
  );
  const [currentId, setCurrentId] = useState(searchParams.get('id') || '');
  const [searchTitle] = useState(searchParams.get('stitle') || '');

  // 集数相关
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);

  // Refs
  const plyrRef = useRef<any>(null);
  const detailRef = useRef<SearchResult | null>(detail);
  const currentEpisodeIndexRef = useRef(currentEpisodeIndex);
  const videoTitleRef = useRef(videoTitle);
  const videoYearRef = useRef(videoYear);
  const currentSourceRef = useRef(currentSource);
  const currentIdRef = useRef(currentId);
  const resumeTimeRef = useRef<number | null>(null);
  const lastSaveTimeRef = useRef<number>(0);

  // 同步最新值到 refs
  useEffect(() => {
    detailRef.current = detail;
    currentEpisodeIndexRef.current = currentEpisodeIndex;
    videoTitleRef.current = videoTitle;
    videoYearRef.current = videoYear;
    currentSourceRef.current = currentSource;
    currentIdRef.current = currentId;
  }, [
    detail,
    currentEpisodeIndex,
    videoTitle,
    videoYear,
    currentSource,
    currentId,
  ]);

  // 播放地址
  const [videoUrl, setVideoUrl] = useState('');
  const totalEpisodes = detail?.episodes?.length || 0;

  // 换源相关状态
  const [availableSources, setAvailableSources] = useState<SearchResult[]>([]);
  const [sourceSearchLoading, setSourceSearchLoading] = useState(false);
  const [sourceSearchError, setSourceSearchError] = useState<string | null>(
    null
  );

  // 折叠状态
  const [isEpisodeSelectorCollapsed, setIsEpisodeSelectorCollapsed] =
    useState(false);

  // -----------------------------------------------------------------------------
  // 数据获取与处理
  // -----------------------------------------------------------------------------

  // 更新播放地址
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
        if (!response.ok) throw new Error('Failed to fetch track URL');
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
    setVideoUrl(urlToSet);
  };

  useEffect(() => {
    updateVideoUrl(detail, currentEpisodeIndex);
  }, [detail, currentEpisodeIndex]);

  // 初始化页面数据
  useEffect(() => {
    const initAll = async () => {
      if (mediaType === 'music') {
        const musicUrl = searchParams.get('id');
        if (musicUrl) {
          setVideoUrl(musicUrl);
          setLoading(false);
        } else {
          setError('缺少音乐播放地址');
        }
        return;
      }

      if (!currentSource && !currentId && !videoTitle && !searchTitle) {
        setError('缺少必要参数');
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadingStage('searching');
      setLoadingMessage('🔍 正在搜索播放源...');

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(
            searchTitle || videoTitle
          )}&type=${mediaType}`
        );
        if (!response.ok) throw new Error('搜索失败');
        const data = await response.json();
        const results = data.results.filter(
          (result: SearchResult) =>
            result.title.replaceAll(' ', '').toLowerCase() ===
            (searchTitle || videoTitle).replaceAll(' ', '').toLowerCase() &&
            (videoYear ? result.year.toLowerCase() === videoYear.toLowerCase() : true)
        );

        if (results.length === 0) {
          setError('未找到匹配结果');
          setLoading(false);
          return;
        }

        setAvailableSources(results);
        const detailData = results[0]; // 默认使用第一个源

        setCurrentSource(detailData.source);
        setCurrentId(detailData.id);
        setVideoYear(detailData.year);
        setVideoTitle(detailData.title || videoTitle);
        setVideoCover(detailData.poster || videoCover);
        setVideoDesc(detailData.desc || videoDesc);
        setDetail(detailData);
        if (currentEpisodeIndex >= detailData.episodes.length) {
          setCurrentEpisodeIndex(0);
        }

        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('source', detailData.source);
        newUrl.searchParams.set('id', detailData.id);
        window.history.replaceState({}, '', newUrl.toString());

        setLoadingStage('ready');
        setLoadingMessage('✨ 准备就绪...');
        setTimeout(() => setLoading(false), 500);

      } catch (err) {
        setError(err instanceof Error ? err.message : '初始化失败');
        setLoading(false);
      }
    };

    initAll();
  }, []);

  // 读取播放记录
  useEffect(() => {
    const initFromHistory = async () => {
      if (!currentSource || !currentId) return;
      try {
        const allRecords = await getAllPlayRecords();
        const key = generateStorageKey(currentSource, currentId);
        const record = allRecords[key];
        if (record) {
          setCurrentEpisodeIndex(record.index - 1);
          resumeTimeRef.current = record.play_time;
        }
      } catch (err) {
        console.error('读取播放记录失败:', err);
      }
    };
    initFromHistory();
  }, [currentSource, currentId]);

  // -----------------------------------------------------------------------------
  // 播放器事件处理
  // -----------------------------------------------------------------------------

  // 保存播放进度
  const saveCurrentPlayProgress = async () => {
    const player = plyrRef.current?.plyr;
    if (
      !player ||
      !currentSourceRef.current ||
      !currentIdRef.current ||
      !videoTitleRef.current ||
      !detailRef.current?.source_name
    ) {
      return;
    }

    const currentTime = player.currentTime || 0;
    const duration = player.duration || 0;

    if (currentTime < 1 || !duration) return;

    try {
      const record: PlayRecord = {
        title: videoTitleRef.current,
        source_name: detailRef.current?.source_name || '',
        year: detailRef.current?.year || '',
        cover: videoCover || detailRef.current?.poster || '',
        index: currentEpisodeIndexRef.current + 1,
        total_episodes: detailRef.current?.episodes.length || 1,
        play_time: Math.floor(currentTime),
        total_time: Math.floor(duration),
        save_time: Date.now(),
        search_title: searchTitle,
        mediaType: mediaType,
        desc: videoDesc || detailRef.current?.desc || '',
      };
      await savePlayRecord(
        currentSourceRef.current,
        currentIdRef.current,
        record
      );
      lastSaveTimeRef.current = Date.now();
    } catch (err) {
      console.error('保存播放进度失败:', err);
    }
  };

  // 播放器 `ready` 事件
  const handlePlayerReady = (player: any) => {
    // 恢复播放进度
    if (resumeTimeRef.current && resumeTimeRef.current > 0) {
      player.currentTime = resumeTimeRef.current;
      resumeTimeRef.current = null;
    }
    // 恢复音量
    const savedVolume = localStorage.getItem('plyr_volume');
    if (savedVolume) player.volume = parseFloat(savedVolume);
    // 恢复播放速度
    const savedRate = localStorage.getItem('plyr_rate');
    if (savedRate) player.speed = parseFloat(savedRate);

    player.play();
  };

  // 播放结束自动下一集
  const handlePlayerEnded = () => {
    handleNextEpisode();
  };

  // 定期保存进度
  const handleTimeUpdate = () => {
    const now = Date.now();
    if (now - lastSaveTimeRef.current > 10000) { // 每10秒保存一次
      saveCurrentPlayProgress();
    }
  };

  // 保存音量和倍速
  const handleVolumeChange = (event: any) => {
    localStorage.setItem('plyr_volume', event.detail.plyr.volume);
  };
  const handleRateChange = (event: any) => {
    localStorage.setItem('plyr_rate', event.detail.plyr.speed);
  };

  // 页面卸载/隐藏时保存进度
  useEffect(() => {
    const handleBeforeUnload = () => saveCurrentPlayProgress();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveCurrentPlayProgress();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      saveCurrentPlayProgress(); // 组件卸载时最后保存一次
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 用户交互处理
  // ---------------------------------------------------------------------------

  const handleEpisodeChange = (episodeNumber: number) => {
    if (episodeNumber >= 0 && episodeNumber < totalEpisodes) {
      saveCurrentPlayProgress();
      setCurrentEpisodeIndex(episodeNumber);
    }
  };

  const handleNextEpisode = () => {
    const idx = currentEpisodeIndexRef.current;
    if (idx < totalEpisodes - 1) {
      handleEpisodeChange(idx + 1);
    }
  };

  const handleSourceChange = async (newSource: string, newId: string) => {
    saveCurrentPlayProgress();
    const newDetail = availableSources.find(
      (s) => s.source === newSource && s.id === newId
    );
    if (newDetail) {
      await deletePlayRecord(currentSourceRef.current, currentIdRef.current);

      let targetIndex = currentEpisodeIndex;
      if (targetIndex >= newDetail.episodes.length) {
        targetIndex = 0;
      }

      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('source', newSource);
      newUrl.searchParams.set('id', newId);
      window.history.replaceState({}, '', newUrl.toString());

      setCurrentSource(newSource);
      setCurrentId(newId);
      setDetail(newDetail);
      setCurrentEpisodeIndex(targetIndex);
    }
  };

  // 收藏
  useEffect(() => {
    if (!currentSource || !currentId) return;
    const checkFavorite = async () => {
      const fav = await isFavorited(currentSource, currentId);
      setFavorited(fav);
    };
    checkFavorite();
    const unsubscribe = subscribeToDataUpdates('favoritesUpdated', () => checkFavorite());
    return unsubscribe;
  }, [currentSource, currentId]);

  const handleToggleFavorite = async () => {
    if (!detailRef.current || !currentSourceRef.current || !currentIdRef.current) return;
    try {
      if (favorited) {
        await deleteFavorite(currentSourceRef.current, currentIdRef.current);
      } else {
        const favorite: Favorite = {
          title: videoTitleRef.current,
          source_name: detailRef.current.source_name || '',
          year: detailRef.current.year || '',
          cover: videoCover || detailRef.current.poster || '',
          total_episodes: detailRef.current.episodes.length || 1,
          save_time: Date.now(),
          search_title: searchTitle,
          mediaType: mediaType,
          desc: videoDesc || detailRef.current.desc || '',
        };
        await saveFavorite(currentSourceRef.current, currentIdRef.current, favorite);
      }
    } catch (err) {
      console.error('切换收藏失败:', err);
    }
  };

  // ---------------------------------------------------------------------------
  // 渲染逻辑
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <PageLayout activePath='/play'>
        <div className='flex items-center justify-center min-h-screen'>
          <div className='text-center'>
            <div className='text-2xl font-semibold mb-4'>{loadingMessage}</div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout activePath='/play'>
        <div className='flex items-center justify-center min-h-screen'>
          <div className='text-center text-red-500'>
            <h2 className='text-2xl font-bold mb-4'>播放失败</h2>
            <p>{error}</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  const plyrSource = {
    type: mediaType === 'video' ? 'video' : 'audio',
    sources: [{ src: videoUrl }],
    poster: videoCover,
  };

  return (
    <PageLayout activePath='/play'>
      <div className='flex flex-col gap-3 py-4 px-5 lg:px-[3rem] 2xl:px-20'>
        <div className='py-1'>
          <h1 className='text-xl font-semibold'>
            {videoTitle}
            {totalEpisodes > 1 && ` > 第 ${currentEpisodeIndex + 1} 集`}
          </h1>
        </div>
        <div className='space-y-2'>
          <div className='hidden lg:flex justify-end'>
            <button
              onClick={() => setIsEpisodeSelectorCollapsed(!isEpisodeSelectorCollapsed)}
              className='px-3 py-1.5 rounded-full bg-gray-200 dark:bg-gray-800 text-xs'
            >
              {isEpisodeSelectorCollapsed ? '显示选集' : '隐藏选集'}
            </button>
          </div>
          <div
            className={`grid gap-4 lg:h-[500px] xl:h-[650px] 2xl:h-[750px] ${isEpisodeSelectorCollapsed ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-4'
              }`}
          >
            <div
              className={`h-full ${isEpisodeSelectorCollapsed ? 'col-span-1' : 'md:col-span-3'
                }`}
            >
              {videoUrl && (
                <Plyr
                  ref={plyrRef}
                  source={plyrSource as any}
                  options={{
                    autoplay: true,
                    controls: [
                      'play-large', 'play', 'progress', 'current-time', 'mute',
                      'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'
                    ],
                    settings: ['captions', 'quality', 'speed', 'loop'],
                    speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
                  }}
                  onReady={handlePlayerReady}
                  onEnded={handlePlayerEnded}
                  onTimeUpdate={handleTimeUpdate}
                  onVolumeChange={handleVolumeChange}
                  onRateChange={handleRateChange}
                />
              )}
            </div>
            <div
              className={`h-[300px] lg:h-full md:overflow-hidden ${isEpisodeSelectorCollapsed ? 'lg:hidden' : ''
                }`}
            >
              <EpisodeSelector
                totalEpisodes={totalEpisodes}
                value={currentEpisodeIndex + 1}
                mediaType={mediaType}
                onChange={handleEpisodeChange}
                onSourceChange={handleSourceChange}
                currentSource={currentSource}
                currentId={currentId}
                videoTitle={searchTitle || videoTitle}
                availableSources={availableSources}
                sourceSearchLoading={sourceSearchLoading}
                sourceSearchError={sourceSearchError}
                precomputedVideoInfo={new Map()} // Plyr doesn't need this
              />
            </div>
          </div>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          <div className='md:col-span-3 p-6'>
            <h1 className='text-3xl font-bold mb-2 flex items-center'>
              {videoTitle}
              <button onClick={handleToggleFavorite} className='ml-3'>
                <FavoriteIcon filled={favorited} />
              </button>
            </h1>
            <div className='flex items-center gap-3 text-base mb-4 opacity-80'>
              {detail?.year && <span>{detail.year}</span>}
              {detail?.source_name && (
                <span className='border px-2 py-1 rounded'>{detail.source_name}</span>
              )}
            </div>
            {detail?.desc && (
              <div style={{ whiteSpace: 'pre-line' }}>{detail.desc}</div>
            )}
          </div>
          <div className='hidden md:block md:col-span-1 p-4'>
            <img
              src={processImageUrl(videoCover)}
              alt={videoTitle}
              className='w-full h-auto object-cover rounded-xl'
            />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

const FavoriteIcon = ({ filled }: { filled: boolean }) => (
  <Heart className={`h-7 w-7 ${filled ? 'text-red-500 fill-current' : 'text-gray-600'}`} />
);

export default function PlayPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayPageClient />
    </Suspense>
  );
}
