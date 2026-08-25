import twilio from "twilio";

// Falls back to console logging whenever Twilio isn't configured, so the
// rest of the app runs (and is testable) before real credentials exist.
export async function sendSms(
  to: string,
  body: string,
  fromNumber?: string | null,
): Promise<{ simulated: boolean; sid?: string }> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_DEFAULT_FROM_NUMBER } = process.env;
  const from = fromNumber || TWILIO_DEFAULT_FROM_NUMBER;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !from) {
    console.log(`[sms:simulated] to=${to} from=${from ?? "(unset)"} body=${JSON.stringify(body)}`);
    return { simulated: true };
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const message = await client.messages.create({ to, from, body });
  return { simulated: false, sid: message.sid };
}
