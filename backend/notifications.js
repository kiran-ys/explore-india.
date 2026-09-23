const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function notificationConfiguration(env = process.env) {
  const provider = env.ENQUIRY_EMAIL_PROVIDER || "disabled";
  if (provider === "disabled") return { provider, enabled: false };
  if (provider !== "resend" || !env.RESEND_API_KEY || !emailPattern.test(env.ENQUIRY_EMAIL_FROM || "") || !emailPattern.test(env.ENQUIRY_EMAIL_TO || "")) {
    return { provider, enabled: false, error: "Email notification configuration is incomplete." };
  }
  return { provider, enabled: true };
}

export async function notifyEnquiry(enquiry, { env = process.env, send = fetch } = {}) {
  const config = notificationConfiguration(env);
  if (!config.enabled) return { status: config.error ? "failed" : "disabled", error: config.error || null };
  try {
    const response = await send("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `explore-india-enquiry-${enquiry.id}` },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        from: env.ENQUIRY_EMAIL_FROM,
        to: [env.ENQUIRY_EMAIL_TO],
        reply_to: enquiry.email,
        subject: `Explore India enquiry #${enquiry.id}: ${enquiry.subject}`,
        text: `Enquiry #${enquiry.id}\nFrom: ${enquiry.name} <${enquiry.email}>\nSubject: ${enquiry.subject}\n\n${enquiry.message}`
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.id !== "string") return { status: "failed", error: "The email provider did not accept the notification." };
    // Acceptance is not delivery; do not claim the recipient received an email.
    return { status: "accepted", providerId: payload.id };
  } catch {
    return { status: "failed", error: "The email provider could not be reached. The enquiry remains saved." };
  }
}
