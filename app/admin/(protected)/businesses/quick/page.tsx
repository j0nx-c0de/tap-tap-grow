import Link from "next/link";
import { createReviewOnlyBusiness } from "../../actions";
import { QuickAddForm } from "./quick-add-form";

export default function QuickAddBusinessPage() {
  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Add a business — reviews only</h1>
      <p className="mt-2 text-sm text-muted">
        Two fields, and you walk away with a tap link to write to a tag. The tag goes straight to
        Google&apos;s review box — no hub, no punch card, nothing for the business to be trained
        on.
      </p>
      <p className="mt-2 text-sm text-muted">
        Owner contact, address and rewards can all be filled in later from the business&apos;s own
        page. If this one is getting a punch card from day one, start at{" "}
        <Link href="/admin/businesses/new" className="text-accent hover:opacity-80">
          the full setup
        </Link>{" "}
        instead.
      </p>

      <div className="mt-8">
        <QuickAddForm action={createReviewOnlyBusiness} />
      </div>
    </div>
  );
}
