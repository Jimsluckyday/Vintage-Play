// Debit / credit card payments through Square's hosted checkout page.
//
//   GET  /api/square                    -> { enabled }  (the cart only shows the card button when true)
//   POST /api/square {action: "cart"}   -> a Square checkout link for a local-pickup cart. Prices are
//                                          re-read from the database here, so a shopper can't edit them.
//   POST /api/square {action: "link"}   -> admin only: a card payment link for an order request, with the
//                                          shipping cost the owner typed in.
//
// The card details are typed on Square's own page; they never touch this site.
// Needs two Pages environment variables: SQUARE_ACCESS_TOKEN (a Secret) and SQUARE_LOCATION_ID.
// Optional: SQUARE_ENV = "sandbox" to test with Square's sandbox and test cards.
const SUPABASE_URL = "https://smgzxdgmrxykfwpyzyea.supabase.co";
// Public "anon" key -- the same one already shipped in config.js.
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtZ3p4ZGdtcnh5a2Z3cHl6eWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0Mjk2OTEsImV4cCI6MjEwNTAwNTY5MX0.HSS42x8_K5lLpT_qFjtBtn-_AqL9btP_kvtIK53X-Zc";
const SITE = "https://www.vintageplay.ca";
const SQUARE_VERSION = "2024-10-17";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const configured = (env) => !!(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID);
const squareBase = (env) =>
  env.SQUARE_ENV === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
const cents = (n) => Math.round(Number(n) * 100);

// Same sale rules as the storefront (config.js): best single discount per item, rounded down to .99.
function promoIsLive(p, now = new Date()) {
  if (!p || !p.active) return false;
  if (p.starts_at && new Date(p.starts_at) > now) return false;
  if (p.ends_at && new Date(p.ends_at) < now) return false;
  return true;
}
function promoApplies(p, item) {
  if (!promoIsLive(p)) return false;
  if (p.category && item.category !== p.category) return false;
  if (p.brand && item.brand !== p.brand) return false;
  if (p.condition_grade && item.condition_grade !== p.condition_grade) return false;
  if ((p.exclude_brands || []).includes(item.brand)) return false;
  return true;
}
function salePriceFor(price, percent) {
  const exact = Number(price) * (1 - Number(percent) / 100);
  const rounded = Math.floor(exact + 0.01) - 0.01;
  return Math.max(0.99, Math.round(rounded * 100) / 100);
}

async function supa(path, init = {}) {
  const resp = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  if (!resp.ok) throw new Error(`database ${resp.status}`);
  return resp.json();
}

async function adminEmail(request, env) {
  const allowed = (env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !allowed.length) return null;
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const email = ((await resp.json()).email || "").toLowerCase();
  return allowed.includes(email) ? email : null;
}

function newReference() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "VP-" + Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

async function createLink(env, { reference, lineItems, note, buyerEmail, redirect }) {
  const body = {
    idempotency_key: crypto.randomUUID(),
    order: { location_id: env.SQUARE_LOCATION_ID, reference_id: reference, line_items: lineItems },
    checkout_options: { redirect_url: redirect, allow_tipping: false, ask_for_shipping_address: false },
    payment_note: note.slice(0, 500),
  };
  if (buyerEmail) body.pre_populated_data = { buyer_email: buyerEmail };
  const resp = await fetch(`${squareBase(env)}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      "square-version": SQUARE_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.payment_link) {
    const detail = (data.errors || []).map((e) => e.detail || e.code).join("; ");
    throw new Error(`Square: ${detail || resp.status}`);
  }
  return { url: data.payment_link.url, square_order_id: data.payment_link.order_id };
}

const lineItem = (name, qty, price) => ({
  name: String(name).slice(0, 500),
  quantity: String(qty),
  base_price_money: { amount: cents(price), currency: "CAD" },
});

export async function onRequestGet({ env }) {
  return json({ enabled: configured(env) });
}

export async function onRequestPost({ request, env }) {
  if (!configured(env)) return json({ error: "Card payments aren't set up yet." }, 503);
  let input;
  try {
    input = await request.json();
  } catch (e) {
    return json({ error: "Bad request" }, 400);
  }

  try {
    if (input.action === "link") return await adminLink(request, env, input);
    return await cartCheckout(env, input);
  } catch (err) {
    return json({ error: err.message || "Something went wrong" }, 502);
  }
}

async function cartCheckout(env, input) {
  const wanted = Array.isArray(input.items) ? input.items.slice(0, 60) : [];
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = [...new Set(wanted.map((w) => String(w.id || "")).filter((s) => UUID.test(s)))];
  if (!ids.length) return json({ error: "Your cart is empty." }, 400);

  const items = await supa(
    `/rest/v1/items?id=in.(${ids.join(",")})&select=id,title,asking_price,quantity,status,on_hold_at,category,brand,condition_grade`
  );
  const promos = (await supa(`/rest/v1/promotions?select=*`).catch(() => [])).filter((p) => !p.code);
  let codePromo = null;
  const code = String(input.promo_code || "").trim();
  if (code) {
    const found = await supa(`/rest/v1/rpc/check_promo_code`, { method: "POST", body: JSON.stringify({ p_code: code }) }).catch(() => []);
    codePromo = (found && found[0]) || null;
  }

  const lines = [];
  const problems = [];
  for (const w of wanted) {
    const item = items.find((i) => i.id === String(w.id));
    const qty = Math.max(1, Math.floor(Number(w.qty) || 1));
    if (!item || item.status !== "available" || item.on_hold_at) {
      problems.push(item ? item.title : "An item");
      continue;
    }
    if (qty > Number(item.quantity || 1)) {
      problems.push(`${item.title} (only ${item.quantity} left)`);
      continue;
    }
    let best = null;
    for (const p of [...promos, ...(codePromo ? [codePromo] : [])]) {
      if (promoApplies(p, item) && (!best || Number(p.percent) > Number(best.percent))) best = p;
    }
    const list = Number(item.asking_price);
    const price = best ? Math.min(list, salePriceFor(list, best.percent)) : list;
    lines.push({ id: item.id, title: item.title, qty, price, list_price: list, promo: best ? best.code || null : null });
  }
  if (problems.length) {
    return json({ error: `No longer available: ${problems.join(", ")}. Please remove it from your cart.` }, 409);
  }

  const reference = newReference();
  const customer = input.customer || {};
  const contact = String(customer.contact || "").trim();
  const note = `${reference} - LOCAL PICKUP - ${String(customer.name || "").trim()} (${contact}) - ` +
    lines.map((l) => `${l.qty}x ${l.title}`).join(", ");
  const link = await createLink(env, {
    reference,
    lineItems: lines.map((l) => lineItem(l.title, l.qty, l.price)),
    note,
    buyerEmail: contact.includes("@") ? contact : "",
    redirect: `${SITE}/?paid=${reference}`,
  });
  const total = lines.reduce((t, l) => t + cents(l.price) * l.qty, 0) / 100;
  const codeUsed = codePromo && lines.some((l) => l.promo === codePromo.code);
  return json({ ...link, reference, lines, total, promo_code: codeUsed ? codePromo.code : null });
}

async function adminLink(request, env, input) {
  if (!(await adminEmail(request, env))) return json({ error: "Only the shop admin can make payment links." }, 403);
  const lines = (Array.isArray(input.lines) ? input.lines : [])
    .map((l) => ({ title: String(l.title || "Item"), qty: Math.max(1, Math.floor(Number(l.qty) || 1)), price: Number(l.price) }))
    .filter((l) => l.price > 0);
  if (!lines.length) return json({ error: "That order has no priced items." }, 400);
  const shipping = Math.max(0, Number(input.shipping) || 0);
  const lineItems = lines.map((l) => lineItem(l.title, l.qty, l.price));
  if (shipping > 0) lineItems.push(lineItem("Shipping (Canada Post)", 1, shipping));
  const reference = String(input.reference || newReference()).slice(0, 40);
  const link = await createLink(env, {
    reference,
    lineItems,
    note: `${reference} - ${String(input.customer || "").slice(0, 120)}`,
    buyerEmail: String(input.buyer_email || "").includes("@") ? String(input.buyer_email) : "",
    redirect: `${SITE}/?paid=${encodeURIComponent(reference)}`,
  });
  const total = (lines.reduce((t, l) => t + cents(l.price) * l.qty, 0) + cents(shipping)) / 100;
  return json({ ...link, reference, total });
}
