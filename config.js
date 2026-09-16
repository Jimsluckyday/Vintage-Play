// Bump this by 1 every time this file (or admin.html/index.html) is redeployed.
// Lets the page detect and warn if the browser is running a stale cached copy.
const LOCAL_VERSION = "5";

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

function slugify(label) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
