/**
 * Lifecycle states of a printed QR.
 *
 * A customer standing in a shop scanning a code must always see something
 * intentional - never a raw 404, never a blank page, and never another
 * business's page.
 */
export function StatusPage({
  kind,
  displayName,
}: {
  kind: 'coming_soon' | 'suspended' | 'gone';
  displayName: string;
}) {
  const copy = {
    coming_soon: {
      title: `${displayName} is setting up`,
      body: 'This page is being prepared and will be live shortly. Please check back soon.',
    },
    suspended: {
      title: `${displayName} is temporarily unavailable`,
      body: 'This page is paused at the moment. Please contact the business directly.',
    },
    gone: {
      title: `${displayName} is no longer listed`,
      body: 'This business is no longer on the platform. The address you scanned is correct - the listing has been removed.',
    },
  }[kind];

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold">{copy.title}</h1>
      <p className="mt-3 text-[15px] text-ink-500">{copy.body}</p>
    </main>
  );
}
