/** Skeleton matching the final layout shape, so nothing jumps when data arrives. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-6 w-40 rounded-md" />
      <div className="skeleton h-32 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
      <div className="skeleton h-40 rounded-2xl" />
    </div>
  );
}
