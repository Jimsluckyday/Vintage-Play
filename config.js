// Bump this by 1 every time this file (or admin.html/index.html) is redeployed.
// Lets the page detect and warn if the browser is running a stale cached copy.
const LOCAL_VERSION = "49";

// Public site URL — used in the Kijiji/FB listing generator to point buyers back to the full catalog.
const SITE_URL = "https://vintage-play.pages.dev";

// Shown in the "Contact" panel so someone who finds the site without coming
// from one of these listings (e.g. a shared link) can see where else this
// inventory is for sale. A blank url hides that platform's button until
// it's filled in — no need to remove entries you haven't gotten to yet.
const SELLER_PROFILES = [
  { label: "Kijiji", url: "" },
  { label: "Facebook Marketplace", url: "" },
  { label: "eBay", url: "" },
];

// Standing rule for Kijiji/FB Marketplace listing text: no payment details in the ad
// itself (arranged privately once a real buyer reaches out) — pickup location/shipping
// and the bundle-deal note instead.
const PICKUP_LOCATION_NOTE = "Located in Brampton, ON - local pickup, drop-off, or meetup can be arranged.";
const LISTING_SHIPPING_NOTE = "Shipping available via Canada Post for buyers outside my general area - cost quoted separately after the item is weighed and packed.";

// Free carrier email-to-SMS gateway — sends a short text alert on new orders.
const SMS_GATEWAY_ADDRESS = "4167103600@pcs.rogers.com";

// EmailJS lets the static site send a real email on order request with no backend.
// The public key is designed by EmailJS to be safely exposed in client-side code.
const EMAILJS_PUBLIC_KEY = "Wi-0Gg95ueHU1Puti";
const EMAILJS_SERVICE_ID = "service_s37rjpc";
const EMAILJS_TEMPLATE_ID = "template_xu2hlwo";

// Where the cart's "Pay with PayPal" button sends buyers — paypal.me/<this>
const PAYPAL_ME_HANDLE = "vintageplay";

// Additional manual payment options shown in the cart's "How to Pay" section.
const ETRANSFER_EMAIL = "Jamesherder@yahoo.ca";
const CRYPTO_OPTIONS = [
  { label: "BTC", address: "bc1qjxt4ew7f3cvh0gvaux0h0ajfeyj9zzh8w38rznjw4jz377rl3pqsrucea4" },
];
const SHIPPING_NOTE = "Local pickup preferred. Shipping available via Canada Post — cost quoted separately after the item is weighed and packed.";

// Supabase project connection details.
// The anon key is safe to expose in client-side code — Row Level Security
// policies on the database (not this key) control what it's allowed to do.
const SUPABASE_URL = "https://smgzxdgmrxykfwpyzyea.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtZ3p4ZGdtcnh5a2Z3cHl6eWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0Mjk2OTEsImV4cCI6MjEwNTAwNTY5MX0.HSS42x8_K5lLpT_qFjtBtn-_AqL9btP_kvtIK53X-Zc";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Fetches the live config.js from the server (bypassing cache) and checks
// whether its LOCAL_VERSION differs from the one this page loaded with.
async function isNewerVersionAvailable() {
  try {
    const res = await fetch(`/config.js?cb=${Date.now()}`, { cache: "no-store" });
    const text = await res.text();
    const match = text.match(/LOCAL_VERSION\s*=\s*"([^"]+)"/);
    return match ? match[1] !== LOCAL_VERSION : false;
  } catch (e) {
    return false;
  }
}

function startVersionWatch() {
  const banner = document.getElementById("versionBanner");
  const refreshBtn = document.getElementById("versionRefreshBtn");
  const label = document.getElementById("versionLabel");
  if (label) label.textContent = LOCAL_VERSION;
  if (!banner) return;

  refreshBtn?.addEventListener("click", () => location.reload());

  const check = async () => {
    if (await isNewerVersionAvailable()) banner.hidden = false;
  };
  check();
  setInterval(check, 60000);
}

// Populated by loadCategories() before the page renders.
let ALL_CATEGORIES = [];

async function loadCategories() {
  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .order("label", { ascending: true });
  if (!error) ALL_CATEGORIES = data;
  return ALL_CATEGORIES;
}

function categoryLabel(slug) {
  const match = ALL_CATEGORIES.find((c) => c.slug === slug);
  return match ? match.label : slug;
}

// Populated by loadBrands() before the page renders. A "brand" is a
// sub-grouping within a category (e.g. DC / Marvel / Image within Comics)
// used to show cover-image tiles instead of a flat list when there are many items.
let ALL_BRANDS = [];

async function loadBrands() {
  const { data, error } = await supabaseClient
    .from("brands")
    .select("*")
    .order("label", { ascending: true });
  if (!error) ALL_BRANDS = data;
  return ALL_BRANDS;
}

function brandsForCategory(categorySlug) {
  return ALL_BRANDS.filter((b) => b.category === categorySlug);
}

// Populated by loadItemTypes() before the page renders. An "item type" is a
// top-level split within a category (e.g. Consoles / Games / Accessories
// within Video Games) — used only by categories set to the "tree" browsing
// style; other categories simply have none.
let ALL_ITEM_TYPES = [];

async function loadItemTypes() {
  const { data, error } = await supabaseClient
    .from("item_types")
    .select("*")
    .order("label", { ascending: true });
  if (!error) ALL_ITEM_TYPES = data;
  return ALL_ITEM_TYPES;
}

function itemTypesForCategory(categorySlug) {
  return ALL_ITEM_TYPES.filter((t) => t.category === categorySlug);
}

function slugify(label) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
