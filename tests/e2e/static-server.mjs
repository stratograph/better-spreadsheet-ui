// Minimal concurrent static file server for e2e tests. Python's
// http.server is single-threaded and serializes requests, which caused
// real flakiness under Playwright's parallel workers (multiple browser
// contexts all fetching the JS module graph at once). Node's http server
// handles concurrent connections natively.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 4321);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    const safePath = normalize(join(root, urlPath)).replace(/^(\.\.[/\\])+/, "");
    const filePath = safePath.endsWith("/") ? join(safePath, "index.html") : safePath;

    const stats = await stat(filePath);
    if (!stats.isFile()) throw new Error("not a file");

    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch (err) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`test static server listening on http://127.0.0.1:${port}`);
});
