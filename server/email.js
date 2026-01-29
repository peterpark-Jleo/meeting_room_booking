let dailyCount = 0;
let dailyDate = new Date().toISOString().slice(0, 10);

function shouldResetCounter() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyDate) {
    dailyDate = today;
    dailyCount = 0;
  }
}

export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "no-reply@meeting-room.local";
  const dailyLimit = Number(process.env.RESEND_DAILY_LIMIT || "0");

  if (!apiKey) {
    console.log("[email] skipped (missing RESEND_API_KEY):", subject);
    return { skipped: true };
  }

  shouldResetCounter();
  if (dailyLimit > 0 && dailyCount >= dailyLimit) {
    console.log("[email] skipped (daily limit reached):", subject);
    return { skipped: true, reason: "daily_limit" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: `Meeting Room <${fromEmail}>`,
      to,
      subject,
      html
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend error: ${text}`);
  }

  dailyCount += 1;
  return response.json();
}
