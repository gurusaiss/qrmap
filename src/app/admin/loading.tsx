/** Skeleton matching the final table layout, so the console doesn't flash blank. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-6 w-48 rounded-md" />
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-2xl" />
        ))}
      </div>
      <div className="skeleton h-64 rounded-2xl" />
    </div>
  );
}
