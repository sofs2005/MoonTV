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
} from '@/lib/db.client';
import { Favorite, PlayRecord, SearchResult } from '@/lib/types';
import { getVideoResolutionFromM3u8, processImageUrl } from '@/lib/utils';

import EpisodeSelector from '@/components/EpisodeSelector';
import PageLayout from '@/components/PageLayout';

const FavoriteIcon = ({ filled }: { filled: boolean }) => {
  if (filled) {
    return (
      <svg
        className='h-7 w-7'
        viewBox='0 0 24 24'
        xmlns='http://www.w3.org/2000/svg'
      >
        <path
          d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
          fill='#ef4444'
          stroke='#ef4444'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    );
  }
  return (
    <Heart className='h-7 w-7 stroke-[1] text-gray-600 dark:text-gray-300' />
  );
};


export default function PlayerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
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
    (searchParams.get('mediaType') as 'video' | 'audiobook') || 'video'
  );
  const [videoTitle, setVideoTitle] = useState(searchParams.get('title') || '');
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
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);

  const detailRef = useRef<SearchResult | null>(detail);
  const currentEpisodeIndexRef = useRef(currentEpisodeIndex);

  useEffect(() => {
    detailRef.current = detail;
    currentEpisodeIndexRef.current = currentEpisodeIndex;
  }, [detail, currentEpisodeIndex]);

  const [videoUrl, setVideoUrl] = useState('');
  const totalEpisodes = detail?.episodes?.length || 0;
  const resumeTimeRef = useRef<number | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const plyrRef = useRef<any>(null);
  const hlsRef = useRef<Hls | null>(null);

  const saveCurrentPlayProgress = async () => {
    if (!currentSource || !currentId || !videoTitle || !detail?.source_name || !plyrRef.current?.plyr) {
      return;
    }
    const player = plyrRef.current.plyr;
    const currentTime = player.currentTime || 0;
    const duration = player.duration || 0;

    if (currentTime < 1 || !duration) {
      return;
    }

    try {
      const record: PlayRecord = {
        title: videoTitle,
        source_name: detail.source_name,
        year: detail.year,
        cover: videoCover || detail.poster || '',
        index: currentEpisodeIndex + 1,
        total_episodes: totalEpisodes,
        play_time: Math.floor(currentTime),
        total_time: Math.floor(duration),
        save_time: Date.now(),
        search_title: searchTitle,
        mediaType: mediaType,
        desc: videoDesc || detail.desc || '',
      };
      await savePlayRecord(currentSource, currentId, record);
      lastSaveTimeRef.current = Date.now();
    } catch (err) {
      console.error('保存播放进度失败:', err);
    }
  };

  const handleEpisodeChange = (episodeNumber: number) => {
    if (episodeNumber >= 0 && episodeNumber < totalEpisodes) {
      saveCurrentPlayProgress();
      setCurrentEpisodeIndex(episodeNumber);
    }
  };

  const handleNextEpisode = () => {
    if (currentEpisodeIndex < totalEpisodes - 1) {
      handleEpisodeChange(currentEpisodeIndex + 1);
    }
  };

  const handleSetSkipTime = async (type: 'intro' | 'outro') => {
    if (!plyrRef.current?.plyr || !currentSource || !currentId) return;
    const currentTime = plyrRef.current.plyr.currentTime;
    let newConfig = { ...skipConfig };

    if (type === 'intro') {
      newConfig.intro_time = currentTime;
    } else {
      const duration = plyrRef.current.plyr.duration;
      if (duration) {
        newConfig.outro_time = -(duration - currentTime);
      }
    }
    setSkipConfig(newConfig);
    await saveSkipConfig(currentSource, currentId, newConfig);
  };

  const handleClearSkipTimes = async () => {
    if (!currentSource || !currentId) return;
    const newConfig = { enable: true, intro_time: 0, outro_time: 0 };
    setSkipConfig(newConfig);
    await deleteSkipConfig(currentSource, currentId);
  };

  useEffect(() => {
    const init = async () => {
      if (!currentSource || !currentId) {
        setError('缺少必要的播放参数');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const detailResponse = await fetch(`/api/detail?source=${currentSource}&id=${currentId}`);
        if (!detailResponse.ok) throw new Error('获取详情失败');
        const detailData = await detailResponse.json();
        setDetail(detailData);
        setVideoTitle(detailData.title);
        setVideoCover(detailData.poster || '');
        setVideoDesc(detailData.desc || '');

        const skip = await getSkipConfig(currentSource, currentId);
        if (skip) setSkipConfig(skip);

        const fav = await isFavorited(currentSource, currentId);
        setFavorited(fav);

        const records = await getAllPlayRecords();
        const key = generateStorageKey(currentSource, currentId);
        if (records[key]) {
          setCurrentEpisodeIndex(records[key].index - 1);
          resumeTimeRef.current = records[key].play_time;
        }

      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [currentSource, currentId]);

  useEffect(() => {
    const updateUrl = async () => {
      if (!detail || !detail.episodes || currentEpisodeIndex >= detail.episodes.length) return;
      const episode = detail.episodes[currentEpisodeIndex];
      let urlToSet = typeof episode === 'string' ? episode : episode?.url || '';
      if (mediaType === 'audiobook' && urlToSet) {
        // Fetch real url for audiobook
        const res = await fetch(`/api/track-detail?source=${currentSource}&id=${currentId}&trackId=${urlToSet}`);
        const data = await res.json();
        urlToSet = data?.episodes?.[0]?.url || '';
      }
      setVideoUrl(urlToSet);
    }
    updateUrl();
  }, [detail, currentEpisodeIndex, mediaType, currentSource, currentId]);

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
    }

    const onReady = () => {
      if (resumeTimeRef.current) {
        player.currentTime = resumeTimeRef.current;
        resumeTimeRef.current = null;
      }
      player.play();
    };
    const onTimeUpdate = () => {
      if (skipConfigRef.current.enable) {
        const { intro_time, outro_time } = skipConfigRef.current;
        if (intro_time > 0 && player.currentTime < intro_time) {
          player.currentTime = intro_time;
        }
        if (outro_time < 0 && player.duration > 0 && player.currentTime > player.duration + outro_time) {
          handleNextEpisode();
        }
      }
      if (Date.now() - lastSaveTimeRef.current > 10000) {
        saveCurrentPlayProgress();
      }
    };

    player.on('ready', onReady);
    player.on('timeupdate', onTimeUpdate);
    player.on('ended', handleNextEpisode);
    player.on('pause', saveCurrentPlayProgress);

    return () => {
      player.off('ready', onReady);
      player.off('timeupdate', onTimeUpdate);
      player.off('ended', handleNextEpisode);
      player.off('pause', saveCurrentPlayProgress);
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [videoUrl]);

  return (
    <PageLayout activePath="/play">
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div>Error: {error}</div>
      ) : (
        <div className='flex flex-col gap-3 py-4 px-5 lg:px-[3rem] 2xl:px-20'>
          <h1 className='text-xl font-semibold'>{videoTitle} &gt; {`第 ${currentEpisodeIndex + 1} 集`}</h1>
          <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
            <div className='md:col-span-3'>
              <Plyr
                ref={plyrRef as any}
                source={{
                  type: mediaType === 'video' ? 'video' : 'audio',
                  sources: [{ src: videoUrl, poster: videoCover }]
                } as any}
                options={{
                  controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'pip', 'fullscreen'],
                  settings: ['quality', 'speed', 'loop'],
                  speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] }
                } as any}
              />
              <div className="flex items-center justify-center space-x-4 p-4">
                <button onClick={() => handleSetSkipTime('intro')} className="px-4 py-2 bg-gray-700 text-white rounded">设置片头</button>
                <button onClick={() => handleSetSkipTime('outro')} className="px-4 py-2 bg-gray-700 text-white rounded">设置片尾</button>
                <button onClick={handleClearSkipTimes} className="px-4 py-2 bg-red-600 text-white rounded">清除设置</button>
              </div>
            </div>
            <div className='md:col-span-1'>
              <EpisodeSelector
                totalEpisodes={totalEpisodes}
                value={currentEpisodeIndex + 1}
                mediaType={mediaType}
                onChange={handleEpisodeChange}
                onSourceChange={() => { /* Implement source change */ }}
                currentSource={currentSource}
                currentId={currentId}
                videoTitle={searchTitle || videoTitle}
                availableSources={[]}
                sourceSearchLoading={false}
                sourceSearchError={null}
                precomputedVideoInfo={new Map()}
              />
            </div>
          </div>
          <div className="mt-4">
            <img src={processImageUrl(videoCover)} alt={videoTitle} width="200" className="float-left mr-4" />
            <div className="flex items-center">
              <h2 className="text-2xl font-bold">{videoTitle}</h2>
              <button onClick={() => { /* Implement favorite toggle */ }} className="ml-4">
                <FavoriteIcon filled={favorited} />
              </button>
            </div>
            <p className="mt-2">{videoDesc}</p>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
