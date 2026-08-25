import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-accent">Tap Loop</p>
      <h1 className="mt-3 max-w-md text-3xl font-semibold tracking-tight text-balance">
        NFC sign-ups, reviews, and rewards — one tap at a time.
      </h1>
      <p className="mt-4 max-w-sm text-muted">
        This is the operator side. Customer-facing pages live behind each tag&apos;s own link —
        there&apos;s nothing to see here unless you&apos;re running the platform.
      </p>
      <Link
        href="/admin"
        className="mt-8 rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        Go to admin
      </Link>
    </main>
  );
}
