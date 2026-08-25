import { BusinessForm } from "../../business-form";
import { createBusiness } from "../../actions";

export default function NewBusinessPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">New business</h1>
      <p className="mt-1 text-sm text-muted">
        Sign-up, review, and punch-card tap links are created automatically — write them to NFC
        tags once you&apos;ve saved.
      </p>
      <div className="mt-6">
        <BusinessForm action={createBusiness} submitLabel="Create business" />
      </div>
    </div>
  );
}
