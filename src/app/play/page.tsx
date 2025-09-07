/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import Hls from 'hls.js';
import { Heart } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
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

function PlayPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // -----------------------------------------------------------------------------
  // 状态变量（State）
  // -----------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    'searching' | 'preferring' | 'fetching' | 'ready'
  >('searching');
  const [loadingMessage, setLoadingMessage] = useState('正在搜索播放源...');
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SearchResult | null>(null);

  // 收藏状态
  const [favorited, setFavorited] = useState(false);

  // 跳过片头片尾配置
  const [skipConfig, setSkipConfig] = useState<{
    enable: boolean;
    intro_time: number;
    outro_time: number;
  }>({
    enable: true, // Default to enabled
    intro_time: 0,
    outro_time: 0,
  });
  const skipConfigRef = useRef(skipConfig);
  useEffect(() => {
    skipConfigRef.current = skipConfig;
  }, [skipConfig]);

  // 视频基本信息
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
  // 当前源和ID
  const [currentSource, setCurrentSource] = useState(
    searchParams.get('source') || ''
  );
  const [currentId, setCurrentId] = useState(searchParams.get('id') || '');

  // 搜索所需信息
  const [searchTitle] = useState(searchParams.get('stitle') || '');
  const [searchType] = useState(searchParams.get('stype') || '');

  // 是否需要优选
  const [needPrefer, setNeedPrefer] = useState(
    searchParams.get('prefer') === 'true'
  );
  const needPreferRef = useRef(needPrefer);
  useEffect(() => {
    needPreferRef.current = needPrefer;
  }, [needPrefer]);
  // 集数相关
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);

  const currentSourceRef = useRef(currentSource);
  const currentIdRef = useRef(currentId);
  const videoTitleRef = useRef(videoTitle);
  const videoYearRef = useRef(videoYear);
  const detailRef = useRef<SearchResult | null>(detail);
  const currentEpisodeIndexRef = useRef(currentEpisodeIndex);

  // 同步最新值到 refs
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

  // 视频播放地址
  const [videoUrl, setVideoUrl] = useState('');

  // 总集数
  const totalEpisodes = detail?.episodes?.length || 0;

  // 用于记录是否需要在播放器 ready 后跳转到指定进度
  const resumeTimeRef = useRef<number | null>(null);

  // 换源相关状态
  const [availableSources, setAvailableSources] = useState<SearchResult[]>([]);
  const [sourceSearchLoading, setSourceSearchLoading] = useState(false);
  const [sourceSearchError, setSourceSearchError] = useState<string | null>(
    null
  );

  // 优选和测速开关
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

  // 保存优选时的测速结果，避免EpisodeSelector重复测速
  const [precomputedVideoInfo, setPrecomputedVideoInfo] = useState<
    Map<string, { quality: string; loadSpeed: string; pingTime: number }>
  >(new Map());

  // 折叠状态（仅在 lg 及以上屏幕有效）
  const [isEpisodeSelectorCollapsed, setIsEpisodeSelectorCollapsed] =
    useState(false);

  // 换源加载状态
  const [isVideoLoading, setIsVideoLoading] = useState(true);

  // 播放进度保存相关
  const lastSaveTimeRef = useRef<number>(0);

  const plyrRef = useRef<any>(null);
  const hlsRef = useRef<Hls | null>(null);

  // -----------------------------------------------------------------------------
  // 工具函数（Utils）
  // -----------------------------------------------------------------------------

  // ... [preferBestSource and calculateSourceScore functions remain unchanged] ...

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

  // 更新视频地址
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

  // ... [Other helper functions like handleSkipConfigChange, formatTime] ...

  // ---------------------------------------------------------------------------
  // 主逻辑 Effect Hooks
  // ---------------------------------------------------------------------------

  // 当集数索引变化时自动更新视频地址
  useEffect(() => {
    updateVideoUrl(detail, currentEpisodeIndex);
  }, [detail, currentEpisodeIndex]);

  // ... [initAll effect for fetching sources remains largely unchanged] ...

  // 播放记录处理
  useEffect(() => {
    const initFromHistory = async () => {
      if (!currentSource || !currentId) return;
      try {
        const allRecords = await getAllPlayRecords();
        const key = generateStorageKey(currentSource, currentId);
        const record = allRecords[key];

        if (record) {
          const targetIndex = record.index - 1;
          const targetTime = record.play_time;

          if (targetIndex !== currentEpisodeIndex) {
            setCurrentEpisodeIndex(targetIndex);
          }
          resumeTimeRef.current = targetTime;
        }
      } catch (err) {
        console.error('读取播放记录失败:', err);
      }
    };
    initFromHistory();
  }, []);

  // 跳过片头片尾配置处理
  useEffect(() => {
    const initSkipConfig = async () => {
      if (!currentSource || !currentId) return;
      try {
        const config = await getSkipConfig(currentSource, currentId);
        if (config) {
          setSkipConfig(config);
        }
      } catch (err) {
        console.error('读取跳过片头片尾配置失败:', err);
      }
    };
    initSkipConfig();
  }, []);

  // ... [handleSourceChange effect remains largely unchanged] ...

  // ---------------------------------------------------------------------------
  // 播放器核心逻辑
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!videoUrl || !plyrRef.current?.plyr) return;

    const player = plyrRef.current.plyr;
    const isM3u8 = videoUrl.includes('.m3u8');

    if (isM3u8) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(videoUrl);
      hls.attachMedia(player.media);
      hls.on(Hls.Events.ERROR, (event: any, data: any) => {
        if (data.fatal) {
          console.error('HLS Fatal Error:', data);
        }
      });
    } else {
      player.source = {
        type: mediaType === 'video' ? 'video' : 'audio',
        sources: [{ src: videoUrl }],
      };
    }

    const onReady = () => {
      if (resumeTimeRef.current && resumeTimeRef.current > 0) {
        player.currentTime = resumeTimeRef.current;
        resumeTimeRef.current = null;
      }
      player.play();
    };

    const onTimeUpdate = () => {
      // Handle skip intro/outro
      if (skipConfigRef.current.enable) {
        const { intro_time, outro_time } = skipConfigRef.current;
        if (intro_time > 0 && player.currentTime < intro_time) {
          player.currentTime = intro_time;
        }
        if (outro_time < 0 && player.duration > 0 && player.currentTime > player.duration + outro_time) {
          handleNextEpisode();
        }
      }
      // Save progress periodically
      const now = Date.now();
      if (now - lastSaveTimeRef.current > 10000) { // Save every 10s
        saveCurrentPlayProgress();
      }
    };

    const onEnded = () => {
      handleNextEpisode();
    };

    player.on('ready', onReady);
    player.on('timeupdate', onTimeUpdate);
    player.on('ended', onEnded);
    player.on('pause', saveCurrentPlayProgress);

    return () => {
      player.off('ready', onReady);
      player.off('timeupdate', onTimeUpdate);
      player.off('ended', onEnded);
      player.off('pause', saveCurrentPlayProgress);
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };

  }, [videoUrl, mediaType]);

  // ... [saveCurrentPlayProgress, handleEpisodeChange, keyboard shortcuts, favorite logic] ...
  // Need to adapt them to use plyrRef.current.plyr instead of artPlayerRef.current
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
    // ... rest of the save logic is the same
  };

  // ... [The rest of the component remains, with UI and other logic] ...

  return (
    <PageLayout activePath="/play">
      {/* ... Loading and Error states ... */}
      <div className='flex flex-col gap-3 py-4 px-5 lg:px-[3rem] 2xl:px-20'>
        {/* ... Title ... */}
        <div className='grid gap-4 ...'>
          <div className='relative w-full h-[300px] lg:h-full'>
            <Plyr
              ref={plyrRef}
              source={undefined} // Will be set in useEffect
              options={{
                controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
                settings: ['quality', 'speed', 'loop'],
                speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] }
              }}
            />
          </div>
          {/* ... Episode Selector ... */}
        </div>

        {/* New Skip Buttons */}
        <div className="flex items-center justify-center space-x-4 p-4">
          <button onClick={() => handleSetSkipTime('intro')} className="px-4 py-2 bg-gray-700 text-white rounded">设置片头</button>
          <button onClick={() => handleSetSkipTime('outro')} className="px-4 py-2 bg-gray-700 text-white rounded">设置片尾</button>
          <button onClick={handleClearSkipTimes} className="px-4 py-2 bg-red-600 text-white rounded">清除设置</button>
        </div>

        {/* ... Details Display ... */}
      </div>
    </PageLayout>
  );
}

// ... [FavoriteIcon and Suspense wrapper] ...
