export default function PlatformLoading() {
  return (
    <div className="animate-pulse space-y-5 px-1 py-3 sm:px-2">
      <div className="h-8 w-52 rounded-lg bg-white/8" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="h-24 rounded-2xl border border-white/5 bg-white/[.025]" key={index} />
        ))}
      </div>
      <div className="h-44 rounded-2xl border border-white/5 bg-white/[.025]" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-36 rounded-2xl border border-white/5 bg-white/[.025]" />
        <div className="h-36 rounded-2xl border border-white/5 bg-white/[.025]" />
      </div>
    </div>
  );
}
