// Serves photos out of the R2 bucket bound as PHOTOS, at /img/<file name>.
// Photos are stored in the database as the relative path "/img/<file name>",
// so they keep working unchanged when the site moves to its own domain.
// File names are random UUIDs and never overwritten, so a year-long immutable
// cache is safe -- repeat visitors and Cloudflare's edge both keep copies.
export async function onRequestGet({ request, env, params, waitUntil }) {
  if (!env.PHOTOS) return new Response("Photo storage is not configured", { status: 503 });

  const key = Array.isArray(params.path) ? params.path.join("/") : params.path;
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });

  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const hit = await cache.match(request);
    if (hit) return hit;
  }

  const object = await env.PHOTOS.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  if (request.headers.get("if-none-match") === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }

  const response = new Response(object.body, { headers });
  if (cache) waitUntil(cache.put(request, response.clone()));
  return response;
}

export const onRequestHead = onRequestGet;
