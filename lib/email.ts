import { Resend } from "resend";

// Falls back to console logging whenever Resend isn't configured, so the
// rest of the app runs (and is testable) before real credentials exist.
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ simulated: boolean; id?: string }> {
  const { RESEND_API_KEY, RESEND_FROM_EMAIL } = process.env;

  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    console.log(`[email:simulated] to=${to} subject=${JSON.stringify(subject)}`);
    return { simulated: true };
  }

  const resend = new Resend(RESEND_API_KEY);
  const result = await resend.emails.send({ from: RESEND_FROM_EMAIL, to, subject, html });
  if (result.error) {
    console.error(`[email:error] ${result.error.name}: ${result.error.message}`);
    return { simulated: false };
  }
  return { simulated: false, id: result.data?.id };
}
