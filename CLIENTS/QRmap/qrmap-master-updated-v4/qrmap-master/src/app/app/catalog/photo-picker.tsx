'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Must sit inside a <label> (the form `Field` provides one): that label
 * forwards clicks on the box below to the hidden input.
 *
 * A styled drop-in replacement for a bare `<input type="file">` that shows a
 * live thumbnail of the chosen photo before the form is submitted. Still a
 * real file input under the hood (same `name`), so no server action changes.
 */
export function PhotoPicker({
  name,
  hint,
  existingPhotoUrl,
}: {
  name: string;
  hint?: string;
  existingPhotoUrl?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!file) {
      setPreviewUrl(null);
      setFileName(null);
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);
  };

  const shownPhoto = previewUrl ?? existingPhotoUrl ?? null;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/*"
        onChange={onChange}
        className="sr-only"
      />
      <div
        className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border border-dashed border-ink-200 p-3 transition-colors hover:border-ink-400 hover:bg-ink-50"
      >
        {shownPhoto ? (
          <img src={shownPhoto} alt="" className="h-14 w-14 shrink-0 rounded-[var(--radius-sm)] object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-ink-100 text-ink-300">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-6 w-6">
              <rect x="2.5" y="4" width="15" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="7" cy="8.2" r="1.3" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="m4 15 4.3-4.3a1.5 1.5 0 0 1 2.1 0L13 13.3M14 11.6l.4-.4a1.5 1.5 0 0 1 2.1 0L18 12.6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-ink-700">
            {fileName ?? (shownPhoto ? 'Choose a new photo' : 'Choose a photo')}
          </p>
          {hint && <p className="text-[12px] text-ink-400">{hint}</p>}
        </div>
      </div>
    </div>
  );
}
