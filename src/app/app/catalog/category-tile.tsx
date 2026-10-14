import Link from 'next/link';

/**
 * The "image box" view the merchant asked for: a category shows as a tile
 * with a picture (the first photo among its own items, so a merchant never
 * has to separately upload a cover) and tapping it drills into just that
 * category's items.
 */
export function CategoryTile({
  href,
  name,
  itemCount,
  photoUrl,
}: {
  href: string;
  name: string;
  itemCount: number;
  photoUrl: string | null;
}) {
  return (
    <Link href={href} className="card card-interactive overflow-hidden p-0">
      <div className="flex aspect-[4/3] items-center justify-center bg-ink-100">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-8 w-8 text-ink-300">
            <rect x="2.5" y="4" width="15" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="7" cy="8.2" r="1.3" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="m4 15 4.3-4.3a1.5 1.5 0 0 1 2.1 0L13 13.3M14 11.6l.4-.4a1.5 1.5 0 0 1 2.1 0L18 12.6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <div className="p-2.5">
        <p className="truncate text-[14px] font-medium">{name}</p>
        <p className="text-[12px] text-ink-500">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </p>
      </div>
    </Link>
  );
}
