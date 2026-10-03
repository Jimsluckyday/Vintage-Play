// Accepts photo uploads from the admin page and stores them in the R2 bucket
// bound as PHOTOS. Only a logged-in admin can upload: the browser sends its
// Supabase login token, we ask Supabase who it belongs to, and that email has
// to be on the ADMIN_EMAILS allow-list (a comma-separated Pages environment
// variable). With no allow-list configured it refuses everyone.
const SUPABASE_URL = "https://smgzxdgmrxykfwpyzyea.supabase.co";
// Public "anon" key -- the same one already shipped in config.js; it only
// identifies the project, it doesn't grant any access by itself.
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtZ3p4ZGdtcnh5a2Z3cHl6eWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0Mjk2OTEsImV4cCI6MjEwNTAwNTY5MX0.HSS42x8_K5lLpT_qFjtBtn-_AqL9btP_kvtIK53X-Zc";

// Photos are served straight from the bucket's custom domain, which Cloudflare
// caches at its edge -- no function runs per image view. (The /img/* function
// route still exists as a fallback for photos saved before this switch.)
const PHOTO_BASE_URL = "https://img.vintageplay.ca";

const MAX_BYTES = 6 * 1024 * 1024;
const TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function emailForToken(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const user = await resp.json();
  return (user.email || "").toLowerCase() || null;
}

export async function onRequestPost({ request, env }) {
  if (!env.PHOTOS) return json({ error: "R2 bucket binding PHOTOS is not configured" }, 503);

  const allowed = (env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return json({ error: "ADMIN_EMAILS is not configured" }, 503);

  const email = await emailForToken(request);
  if (!email) return json({ error: "Not signed in" }, 401);
  if (!allowed.includes(email)) return json({ error: "This account isn't allowed to upload" }, 403);

  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return json({ error: "Expected a multipart form upload" }, 400);
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return json({ error: "Missing file" }, 400);

  const ext = TYPES[file.type];
  if (!ext) return json({ error: `Unsupported image type: ${file.type || "unknown"}` }, 415);
  if (file.size > MAX_BYTES) return json({ error: "Image is too large" }, 413);

  const key = `${crypto.randomUUID()}${ext}`;
  await env.PHOTOS.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
  });
  return json({ url: `${PHOTO_BASE_URL}/${key}`, key, size: file.size });
}
