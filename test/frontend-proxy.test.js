import test from "node:test";
import assert from "node:assert/strict";
import { proxyRequest } from "../src/frontend-proxy.js";

test("frontend proxy rewrites the legacy public URL without exposing secrets", async () => {
  const env = {
    ORIGIN: {
      async fetch() {
        return new Response('<a href="https://joson-care.fangwl591021.workers.dev/news">情報</a>', {
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
    }
  };
  const response = await proxyRequest(new Request("https://seventeenfanz.fangwl591021.workers.dev/"), env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /https:\/\/seventeenfanz\.fangwl591021\.workers\.dev\/news/);
});

test("frontend proxy rewrites redirect locations", async () => {
  const env = {
    ORIGIN: {
      async fetch() {
        return new Response(null, {
          status: 302,
          headers: { location: "https://joson-care.fangwl591021.workers.dev/news" }
        });
      }
    }
  };
  const response = await proxyRequest(new Request("https://seventeenfanz.fangwl591021.workers.dev/"), env);
  assert.equal(response.headers.get("location"), "https://seventeenfanz.fangwl591021.workers.dev/news");
});
