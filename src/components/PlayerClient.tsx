/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

// Core Imports
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// Player Imports
import Plyr, { APITypes, PlyrSource } from 'plyr-react';
import 'plyr-react/plyr.css';

// UI Imports
import PageLayout from '@/components/PageLayout';
import EpisodeSelector from '@/components/EpisodeSelector';

// Lib Imports
import { PlayRecord, SearchResult } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';
import { generateStorageKey, getAllPlayRecords, savePlayRecord } from '@/lib/db.client';

// --- Helper Components ---
const PlayerLoader = ({ message }: { message: string }) => (
  <PageLayout activePath='/play'>
    <div className='flex items-center justify-center min-h-screen'>
      <p>{message}</p>
    </div>
  </PageLayout>
);

const PlayerError = ({ error }: { error: string }) => (
  <PageLayout activePath='/play'>
    <div className='flex items-center justify-center min-h-screen'>
      <p className="text-red-500">{error}</p>
    </div>
  </PageLayout>
);

// --- Main Player Component ---
export default function PlayerClient() {
  const searchParams = useSearchParams();
  const ref = useRef<APITypes>(null);
  const lastSaveTimeRef = useRef<number>(0);

  // --- State ---
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('正在初始化...');
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<SearchResult | null>(null);
  const [availableSources, setAvailableSources] = useState<SearchResult[]>([]);

  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);
  const [source, setSource] = useState<PlyrSource | null>(null);

  const mediaType = (searchParams.get('mediaType') as 'video' | 'audiobook' | 'music') || 'video';

  // --- Data Fetching and State Logic ---
  useEffect(() => {
    const initialize = async () => {
      const sourceParam = searchParams.get('source');
      const idParam = searchParams.get('id');
      const titleParam = searchParams.get('title');
      const stitleParam = searchParams.get('stitle');
      const yearParam = searchParams.get('year');

      if (!sourceParam && !idParam && !titleParam && !stitleParam) {
        setError('缺少必要参数'); setLoading(false); return;
      }

      try {
        setLoadingMessage('🔍 正在搜索播放源...');
        let sources: SearchResult[] = [];
        if (sourceParam && idParam) {
          const res = await fetch(`/api/detail?source=${sourceParam}&id=${idParam}`);
          if (res.ok) sources = [await res.json()];
        } else {
          const res = await fetch(`/api/search?q=${encodeURIComponent(stitleParam || titleParam || '')}&type=${mediaType}`);
          if (!res.ok) throw new Error('搜索失败');
          const data = await res.json();
          sources = data.results.filter(
            (r: SearchResult) => r.title.replaceAll(' ', '').toLowerCase() === (titleParam || '').replaceAll(' ', '').toLowerCase() && (yearParam ? r.year === yearParam : true)
          );
        }

        if (sources.length === 0) throw new Error('未找到匹配结果');

        const initialDetail = sources[0];
        setAvailableSources(sources);
        setDetail(initialDetail);

        const key = generateStorageKey(initialDetail.source, initialDetail.id);
        const allRecords = await getAllPlayRecords();
        const record = allRecords[key];
        const episodeIndex = record ? Math.max(0, record.index - 1) : 0;
        console.log('Setting initial episode index:', episodeIndex, 'from record:', record);
        setCurrentEpisodeIndex(episodeIndex);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, []);

  useEffect(() => {
    if (!detail) return;
    const updateSource = async () => {
      console.log('updateSource called with currentEpisodeIndex:', currentEpisodeIndex);

      // 验证索引有效性
      if (!detail || !detail.episodes || currentEpisodeIndex < 0 || currentEpisodeIndex >= detail.episodes.length) {
        console.error('Invalid episode index:', currentEpisodeIndex, 'episodes length:', detail?.episodes?.length);
        setError('剧集索引无效');
        return;
      }

      const episode = detail.episodes[currentEpisodeIndex];
      console.log('Episode found:', !!episode, 'Episode data:', episode);
      if (!episode) return;
      let url = typeof episode === 'string' ? episode : episode.url;
      try {
        if ((mediaType === 'audiobook' || mediaType === 'music') && url) {
          const res = await fetch(`/api/track-detail?source=${detail.source}&id=${detail.id}&trackId=${url}`);
          if (res.ok) {
            const trackData = await res.json();
            url = trackData?.episodes?.[0]?.url;
          }
        }
        if (url) {
          const isM3u8 = url.includes('.m3u8');
          const isAudio = mediaType === 'music' || mediaType === 'audiobook';

          let sourceType: string;
          if (isAudio) {
            sourceType = url.includes('.mp3') ? 'audio/mpeg' :
              url.includes('.m4a') ? 'audio/mp4' :
                url.includes('.ogg') ? 'audio/ogg' :
                  url.includes('.wav') ? 'audio/wav' : 'audio/mpeg';
          } else {
            sourceType = isM3u8 ? 'application/x-mpegURL' :
              url.includes('.mp4') ? 'video/mp4' :
                url.includes('.webm') ? 'video/webm' :
                  url.includes('.ogg') ? 'video/ogg' : 'video/mp4';
          }

          console.log('Setting source:', {
            url,
            isM3u8,
            sourceType,
            mediaType,
            isAudio
          });

          setSource({
            type: isAudio ? 'audio' : 'video',
            sources: [{
              src: url,
              type: sourceType
            }],
          });
        } else {
          console.log('No URL found, clearing source');
          setSource(null);
        }
      } catch (err: any) {
        setError(err.message);
        setSource(null);
      }
    };
    updateSource();
  }, [detail, currentEpisodeIndex]);

  // 简化的播放记录管理 - 使用 DOM 事件
  useEffect(() => {
    if (!source || !detail) return;

    // 延迟获取媒体元素，确保 Plyr 已经渲染
    const timer = setTimeout(() => {
      const mediaElement = document.querySelector('.plyr video, .plyr audio') as HTMLVideoElement | HTMLAudioElement;

      if (!mediaElement) {
        console.warn('Media element not found');
        return;
      }

      console.log('Media element found:', mediaElement.tagName);

      const onLoadedMetadata = async () => {
        console.log('Media loaded, duration:', mediaElement.duration);

        // 恢复播放位置
        const key = generateStorageKey(detail.source, detail.id);
        const records = await getAllPlayRecords();
        const record = records[key];
        if (record && record.index - 1 === currentEpisodeIndex && record.play_time > 0) {
          console.log('Restoring play position:', record.play_time);
          mediaElement.currentTime = record.play_time;
        }
      };

      const onTimeUpdate = () => {
        // 每10秒保存一次播放进度
        if (Date.now() - lastSaveTimeRef.current > 10000 &&
          mediaElement.currentTime > 0 &&
          mediaElement.duration > 0) {
          const safeEpisodeIndex = Math.max(1, currentEpisodeIndex + 1);
          const record: PlayRecord = {
            title: detail.title, source_name: detail.source_name, year: detail.year,
            cover: detail.poster, index: safeEpisodeIndex, total_episodes: detail.episodes.length,
            play_time: Math.floor(mediaElement.currentTime), total_time: Math.floor(mediaElement.duration),
            save_time: Date.now(), search_title: searchParams.get('stitle') || detail.title,
            mediaType: mediaType, desc: detail.desc,
          };
          console.log('Saving play record:', record);
          savePlayRecord(detail.source, detail.id, record);
          lastSaveTimeRef.current = Date.now();
        }
      };

      const onEnded = () => {
        if (detail && currentEpisodeIndex < detail.episodes.length - 1) {
          setCurrentEpisodeIndex(prev => prev + 1);
        }
      };

      // 绑定事件
      mediaElement.addEventListener('loadedmetadata', onLoadedMetadata);
      mediaElement.addEventListener('timeupdate', onTimeUpdate);
      mediaElement.addEventListener('ended', onEnded);

      // 清理函数
      return () => {
        mediaElement.removeEventListener('loadedmetadata', onLoadedMetadata);
        mediaElement.removeEventListener('timeupdate', onTimeUpdate);
        mediaElement.removeEventListener('ended', onEnded);
      };
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [source, detail, currentEpisodeIndex]);

  // --- Component Handlers ---
  const handleEpisodeChange = (episodeNumber: number) => {
    console.log('Episode change requested:', episodeNumber);

    // 验证剧集号是否有效
    if (!detail || episodeNumber < 1 || episodeNumber > detail.episodes.length) {
      console.error('Invalid episode number:', episodeNumber, 'total episodes:', detail?.episodes?.length);
      return;
    }

    const newIndex = episodeNumber - 1;
    console.log('Setting currentEpisodeIndex to:', newIndex);

    // 先清空当前源，确保 Plyr 组件重置
    setSource(null);

    // 延迟设置新索引，确保组件完全重置
    setTimeout(() => {
      setCurrentEpisodeIndex(newIndex);
    }, 100);
  };

  const handleSourceChange = (newSource: string, newId: string) => {
    const newDetail = availableSources.find(s => s.source === newSource && s.id === newId);
    if (newDetail) {
      console.log('Source change requested:', newSource, newId);

      // 先清空当前源，确保 Plyr 组件重置
      setSource(null);

      // 延迟设置新的源和索引
      setTimeout(() => {
        setDetail(newDetail);
        setCurrentEpisodeIndex(0);
      }, 100);
    }
  };

  // --- Render ---
  console.log('Render state:', { loading, error: !!error, detail: !!detail, currentEpisodeIndex });
  if (loading) return <PlayerLoader message={loadingMessage} />;
  if (error) return <PlayerError error={error} />;
  if (!detail) return <PlayerError error="无法加载媒体详情" />;

  const { title, poster, desc, source_name, year, class: category } = detail;

  return (
    <PageLayout activePath='/play'>
      {(mediaType === 'music' || mediaType === 'audiobook') ? (
        <div className='flex items-center justify-center min-h-screen'>
          <div className='w-full max-w-md mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8'>
            <img src={processImageUrl(poster)} alt={title} className='w-full h-auto aspect-square object-cover rounded-lg mb-4' />
            <h2 className='text-2xl font-bold'>{title}</h2>
            <p className='text-gray-500 mb-4'>{source_name}</p>
            {mediaType === 'audiobook' && detail.episodes.length > 1 && (
              <p className='text-sm text-gray-600 dark:text-gray-300 mb-2'>
                第 {currentEpisodeIndex + 1} 章 / 共 {detail.episodes.length} 章
              </p>
            )}
            {source && (
              <Plyr
                ref={ref}
                source={source}
                options={{
                  controls: mediaType === 'audiobook' || mediaType === 'music'
                    ? ['play', 'progress', 'current-time', 'duration', 'mute', 'volume']
                    : ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'fullscreen'],
                  keyboard: { focused: true, global: false },
                  tooltips: { controls: true, seek: true },
                  storage: { enabled: true, key: 'plyr' },
                }}
              />
            )}
            {(mediaType === 'audiobook' && detail.episodes.length > 1) && (
              <div className='mt-4 max-h-40 overflow-y-auto'>
                <EpisodeSelector
                  totalEpisodes={detail.episodes.length}
                  value={currentEpisodeIndex + 1}
                  mediaType={mediaType}
                  onChange={handleEpisodeChange}
                  onSourceChange={handleSourceChange}
                  currentSource={detail.source}
                  currentId={detail.id}
                  videoTitle={title}
                  availableSources={availableSources}
                  sourceSearchLoading={false}
                  sourceSearchError={null}
                  precomputedVideoInfo={new Map()}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className='flex flex-col gap-3 py-4 px-5 lg:px-[3rem] 2xl:px-20'>
          <div className='py-1'>
            <h1 className='text-xl font-semibold'>
              {title} {detail.episodes.length > 1 && ` > 第 ${currentEpisodeIndex + 1} 集`}
            </h1>
          </div>
          <div className='grid gap-4 lg:h-[500px] xl:h-[650px] 2xl:h-[750px] grid-cols-1 md:grid-cols-4'>
            <div className='md:col-span-3 h-full'>
              {source ? (
                <Plyr
                  ref={ref}
                  source={source}
                  options={{
                    controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'fullscreen'],
                    keyboard: { focused: true, global: false },
                    tooltips: { controls: true, seek: true },
                    fullscreen: { enabled: true, fallback: true, iosNative: false },
                    storage: { enabled: true, key: 'plyr' },
                  }}
                />
              ) : (
                <div className="w-full h-full bg-black flex items-center justify-center">
                  <p className="text-white">加载中...</p>
                </div>
              )}
            </div>
            <div className='h-[300px] lg:h-full md:overflow-hidden'>
              <EpisodeSelector
                totalEpisodes={detail.episodes.length}
                value={currentEpisodeIndex + 1}
                mediaType={mediaType}
                onChange={handleEpisodeChange}
                onSourceChange={handleSourceChange}
                currentSource={detail.source}
                currentId={detail.id}
                videoTitle={title}
                availableSources={availableSources}
                sourceSearchLoading={false}
                sourceSearchError={null}
                precomputedVideoInfo={new Map()}
              />
            </div>
          </div>
          <div className='grid grid-cols-1 md:grid-cols-4 gap-4 mt-4'>
            <div className='md:col-span-3'>
              <div className='p-6'>
                <h1 className='text-3xl font-bold mb-2'>{title}</h1>
                <div className='flex flex-wrap items-center gap-3 text-base mb-4'>
                  {category && <span className='text-green-600 font-semibold'>{category}</span>}
                  {year && <span>{year}</span>}
                  {source_name && <span className='border px-2 py-1 rounded'>{source_name}</span>}
                </div>
                <p className='mt-0 text-base'>{desc}</p>
              </div>
            </div>
            <div className='hidden md:block md:col-span-1 md:order-first'>
              <div className='p-4'>
                <div className='bg-gray-300 aspect-[2/3] rounded-xl overflow-hidden'>
                  {poster && <img src={processImageUrl(poster)} alt={title} className='w-full h-full object-cover' />}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}