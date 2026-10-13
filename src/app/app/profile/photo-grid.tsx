'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui';
import { deletePhotoAction } from '../actions';

type Photo = { id: string; altText: string | null; thumbUrl: string | null };

export function PhotoGrid({ photos }: { photos: Photo[] }) {
  const [pending, start] = useTransition();

  if (photos.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((photo) => (
        <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-[var(--radius-sm)] border border-ink-200">
          {photo.thumbUrl ? (
            <img src={photo.thumbUrl} alt={photo.altText ?? ''} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-ink-100 text-[12px] text-ink-400">
              Processing…
            </div>
          )}
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (confirm('Remove this photo from your page?')) start(() => void deletePhotoAction(photo.id));
            }}
            className="absolute right-1 top-1 h-7 w-7 !px-0 text-[13px] opacity-0 shadow-md transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            aria-label="Remove photo"
          >
            ×
          </Button>
        </div>
      ))}
    </div>
  );
}
