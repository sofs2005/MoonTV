'use client';

import Image from 'next/image';
import Link from 'next/link';

import { SearchResult } from '@/lib/types';

interface SongCardProps {
  item: SearchResult;
}

const SongCard: React.FC<SongCardProps> = ({ item }) => {
  // Safety check: If episodes array is empty, do not render the card.
  if (!item.episodes || item.episodes.length === 0) {
    return null;
  }

  // For music, episodes array will contain Episode objects.
  // We assume the first one is the one to play.
  const episode = item.episodes[0] as { name: string; url: string };

  // Additional safety check in case the episode object is malformed.
  if (!episode || !episode.url) {
    return null;
  }

  return (
    <div className='w-full'>
      <Link
        href={`/play?type=music&source=${item.source}&id=${encodeURIComponent(
          episode.url
        )}&title=${encodeURIComponent(item.title)}&poster=${encodeURIComponent(
          item.poster
        )}`}
        className='group'
      >
        <div className='relative aspect-[1/1] w-full overflow-hidden rounded-lg'>
          <Image
            src={item.poster}
            alt={item.title}
            fill
            className='object-cover transition-transform duration-300 group-hover:scale-105'
            sizes='(max-width: 640px) 30vw, (max-width: 1024px) 20vw, 15vw'
          />
        </div>
        <div className='mt-2'>
          <h3 className='text-sm font-medium text-gray-800 dark:text-gray-200 truncate'>
            {item.title}
          </h3>
          <p className='text-xs text-gray-500 dark:text-gray-400 truncate'>
            {item.desc}
          </p>
        </div>
      </Link>
    </div>
  );
};

export default SongCard;