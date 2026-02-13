"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export type VoicePreviewTarget = {
  id?: string | null;
  externalId?: string | null;
  previewPath?: string | null;
  title?: string | null;
};

function resolvePreviewSource(target: VoicePreviewTarget): string | null {
  if (target.previewPath) return target.previewPath;
  if (target.externalId) return `/voices/${target.externalId}.mp3`;
  return null;
}

export function useVoicePreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  const ensureAudio = () => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setPlayingId(null);
      });
      audioRef.current = audio;
    }
    return audioRef.current;
  };

  const togglePlay = useCallback(
    async (target: VoicePreviewTarget | null) => {
      if (!target) {
        toast.error('Preview unavailable', { description: 'No preview is configured for this voice yet.' });
        return;
      }
      const previewSrc = resolvePreviewSource(target);
      if (!previewSrc) {
        toast.error('Preview unavailable', { description: 'No preview is configured for this voice yet.' });
        return;
      }
      const key = target.id ?? target.externalId ?? previewSrc;
      if (!key) {
        toast.error('Preview unavailable', { description: 'Unable to resolve this preview.' });
        return;
      }
      const audio = ensureAudio();
      if (playingId === key) {
        if (isPlaying) {
          audio.pause();
          setIsPlaying(false);
        } else {
          try {
            await audio.play();
            setIsPlaying(true);
          } catch (err) {
            toast.error('Failed to play preview', { description: err instanceof Error ? err.message : String(err) });
          }
        }
        return;
      }
      audio.pause();
      audio.currentTime = 0;
      setIsPlaying(false);
      setPlayingId(key);
      audio.src = previewSrc;
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        setPlayingId(null);
        setIsPlaying(false);
        toast.error('Failed to play preview', { description: err instanceof Error ? err.message : String(err) });
      }
    },
    [isPlaying, playingId]
  );

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayingId(null);
    setIsPlaying(false);
  }, []);

  return { playingId, isPlaying, togglePlay, stop };
}
