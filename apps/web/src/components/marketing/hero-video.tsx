'use client';

import { useEffect, useRef, useState } from 'react';

import { marketingAsset } from '@/lib/assets';

/**
 * The hero band's backdrop video.
 *
 * The band sits below the fold and the file is 12 MB, so nothing is fetched
 * until it is one screen away: the poster frame carries the band's look in the
 * meantime. Playback starts by itself once the source lands — the video is the
 * section's background, not a control the reader operates, so it is muted
 * (which is also what makes autoplay allowed).
 */
export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || shouldLoad) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
        }
      },
      // One viewport of lead time, so the video is ready by the time the band
      // is actually on screen.
      { rootMargin: '100% 0px' },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (shouldLoad) void videoRef.current?.play().catch(() => undefined);
  }, [shouldLoad]);

  return (
    <video
      ref={videoRef}
      src={shouldLoad ? marketingAsset('hero-video.mp4') : undefined}
      poster={marketingAsset('hero-video-poster.jpg')}
      autoPlay
      muted
      loop
      playsInline
      preload="none"
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
