// Minimal Paystack client (https://paystack.com/docs/api/)
const crypto = require("crypto");

const BASE = "https://api.paystack.co";

function isConfigured() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status !== true) {
    throw new Error(`Paystack ${path} failed: ${data.message || res.status}`);
  }
  return data.data;
}

/** Start a payment. Amount is in naira; Paystack wants kobo. */
function initializeTransaction({ email, amount, reference, callbackUrl, metadata }) {
  return call("POST", "/transaction/initialize", {
    email,
    amount: Math.round(Number(amount) * 100),
    currency: "NGN",
    reference,
    callback_url: callbackUrl,
    metadata,
  });
}

/** Ask Paystack for the authoritative result of a payment. */
function verifyTransaction(reference) {
  return call("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
}

/** Check a webhook really came from Paystack. `rawBody` must be the exact bytes received. */
function isValidWebhook(rawBody, signature) {
  if (!signature || !isConfigured()) return false;
  const hash = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  const a = Buffer.from(hash);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { isConfigured, initializeTransaction, verifyTransaction, isValidWebhook };
