const OLD_BASE_URL = "https://joson-care.fangwl591021.workers.dev";
const NEW_BASE_URL = "https://seventeenfanz.fangwl591021.workers.dev";
const MAX_REWRITE_BYTES = 2_000_000;

function replacePublicUrl(value) {
  return String(value || "").split(OLD_BASE_URL).join(NEW_BASE_URL);
}

export async function proxyRequest(request, env) {
  const response = await env.ORIGIN.fetch(request);
  const headers = new Headers(response.headers);
  const location = headers.get("location");
  if (location) headers.set("location", replacePublicUrl(location));

  const contentType = headers.get("content-type") || "";
  const contentLength = Number(headers.get("content-length") || 0);
  const isText = /(?:text\/|application\/(?:json|javascript|xml))/i.test(contentType);
  if (!isText || (contentLength && contentLength > MAX_REWRITE_BYTES)) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  const body = await response.text();
  headers.delete("content-length");
  return new Response(replacePublicUrl(body), { status: response.status, statusText: response.statusText, headers });
}

export default {
  fetch(request, env) {
    return proxyRequest(request, env);
  }
};
