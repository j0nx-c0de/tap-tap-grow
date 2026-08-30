export function Logo({ className, markSize = 24 }: { className?: string; markSize?: number }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <svg
        width={markSize}
        height={markSize}
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect x="1" y="1" width="26" height="26" rx="8" className="fill-foreground" />
        <path
          d="M7 12.5a10 10 0 0 1 14 0"
          className="stroke-accent"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M9.8 15.8a6 6 0 0 1 8.4 0"
          className="stroke-accent"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="14" cy="19.5" r="1.7" className="fill-accent" />
      </svg>
      <span className="text-lg font-extrabold tracking-tight">
        <span className="text-foreground">TAP</span> <span className="text-accent">LOOP</span>
      </span>
    </span>
  );
}
