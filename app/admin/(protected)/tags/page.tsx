import QRCode from "qrcode";
import { getDb } from "@/db";
import { loadUnclaimedTags } from "@/lib/tags";
import { appUrl } from "@/lib/url";
import { generateUnclaimedTags } from "../actions";

export default async function TagInventoryPage() {
  const db = getDb();
  const unclaimed = await loadUnclaimedTags(db);

  const withQr = await Promise.all(
    unclaimed.map(async (tag) => {
      const url = appUrl(`/t/${tag.id}`);
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
      return { ...tag, url, qr };
    }),
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Tag inventory</h1>
      <p className="mt-1 text-sm text-muted">
        Batch-printed tags with no business bound yet. Print the QR code and activation code
        together — at sign-up, claim one against a business using its activation code from the
        &quot;Tap links&quot; section of that business&apos;s page.
      </p>

      {withQr.length === 0 ? (
        <p className="mt-8 text-sm text-muted">None unclaimed right now — generate some below.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {withQr.map((tag) => (
            <div key={tag.id} className="flex gap-4 rounded-xl border border-border bg-card p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tag.qr}
                alt={`QR code for unclaimed tag ${tag.activationCode ?? tag.id}`}
                width={96}
                height={96}
                className="h-24 w-24 shrink-0 rounded-lg border border-border bg-white p-1"
              />
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold tracking-wider">
                  {tag.activationCode ?? "—"}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-muted">{tag.url}</p>
                <p className="mt-1 text-xs text-muted">
                  {tag.tapCount} {tag.tapCount === 1 ? "tap" : "taps"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <form action={generateUnclaimedTags} className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Generate tags <span className="font-normal text-muted">(how many)</span>
          <input
            name="count"
            type="number"
            min={1}
            max={100}
            defaultValue={10}
            required
            className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          className="rounded-full border border-border px-5 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
        >
          Generate
        </button>
      </form>
    </div>
  );
}
