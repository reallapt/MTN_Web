const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = __dirname;
const apiOrigin = new URL(process.env.MTN_API_ORIGIN || "http://192.168.9.4:5173");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".otf": "font/otf",
};
const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  if (pathname.startsWith("/api/") || pathname.startsWith("/avatars/")) {
    const upstream = http.request(
      { hostname: apiOrigin.hostname, port: apiOrigin.port || 80, path: request.url, method: request.method, timeout: 10000 },
      (result) => {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
      },
    );
    upstream.on("timeout", () => upstream.destroy(new Error("Backend timeout")));
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "玩家服务暂时不可用，请检查服务器连接。" }));
    });
    request.pipe(upstream);
    return;
  }
  if (!new Set(["/", "/index.html", "/styles.css", "/script.js", "/players.js"]).has(pathname) && !pathname.startsWith("/assets/")) {
    response.writeHead(404).end("Not found");
    return;
  }
  const filename = path.resolve(
    root,
    "." + (pathname === "/" ? "/index.html" : pathname),
  );
  if (!filename.startsWith(root + path.sep) || (pathname.startsWith("/assets/") && !filename.startsWith(path.join(root, "assets") + path.sep))) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filename, (error, content) => {
    if (error) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type":
        types[path.extname(filename)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(content);
  });
});
server.listen(Number(process.env.PORT || 5173), "127.0.0.1", () =>
  console.log("MTNetwork preview: http://127.0.0.1:" + server.address().port),
);
