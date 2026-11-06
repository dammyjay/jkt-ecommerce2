// Delivery fees by zone. The server always recalculates the fee from the
// state the customer chose; the browser only previews it.
const pool = require("./db");

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT - Abuja", "Gombe",
  "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
  "Taraba", "Yobe", "Zamfara",
];

/** Match free-text states saved on old profiles ("lagos state", "Abuja", "FCT") to the list. */
function normalizeState(input) {
  const s = String(input || "").trim().toLowerCase().replace(/\s+state$/, "");
  if (!s) return null;
  if (["abuja", "fct", "fct abuja", "fct - abuja", "federal capital territory"].includes(s)) return "FCT - Abuja";
  return NIGERIAN_STATES.find(n => n.toLowerCase() === s) || null;
}

function pickupAddress() {
  return process.env.STORE_PICKUP_ADDRESS || null;
}

async function getZones() {
  const { rows } = await pool.query(
    "SELECT * FROM delivery_zones WHERE is_active = true ORDER BY is_default ASC, name ASC"
  );
  return rows;
}

function zoneForState(zones, state) {
  return zones.find(z => !z.is_default && (z.states || []).includes(state))
    || zones.find(z => z.is_default)
    || null;
}

/**
 * Work out delivery for a cart.
 * Returns { ok, method, fee, zone, eta, waived, reason, error }.
 *  - waived: the zone's fee before a free-delivery threshold or coupon was applied
 */
function quoteDelivery({ zones, state, method = "delivery", subtotal = 0, freeShippingCoupon = false }) {
  if (method === "pickup") {
    if (!pickupAddress()) return { ok: false, error: "Store pickup is not available." };
    return { ok: true, method: "pickup", fee: 0, zone: "Store pickup", eta: "Ready when we confirm", waived: 0, reason: null };
  }

  const st = normalizeState(state);
  if (!st) return { ok: false, error: "Please choose your state." };
  const zone = zoneForState(zones, st);
  if (!zone) return { ok: false, error: `Sorry, we don't deliver to ${st} yet.` };

  const base = Number(zone.fee) || 0;
  let fee = base, reason = null;
  if (base > 0 && zone.free_over != null && subtotal >= Number(zone.free_over)) {
    fee = 0;
    reason = "free_over";
  } else if (base > 0 && freeShippingCoupon) {
    fee = 0;
    reason = "coupon";
  }
  return { ok: true, method: "delivery", state: st, fee, zone: zone.name, eta: zone.eta, waived: base - fee, reason };
}

/** Data the checkout page needs to preview fees in the browser. */
function zonesForBrowser(zones) {
  return zones.map(z => ({
    name: z.name,
    states: z.states || [],
    fee: Number(z.fee) || 0,
    free_over: z.free_over == null ? null : Number(z.free_over),
    eta: z.eta,
    is_default: z.is_default,
  }));
}

module.exports = { NIGERIAN_STATES, normalizeState, pickupAddress, getZones, zoneForState, quoteDelivery, zonesForBrowser };
