// Servidor Node.js (sem dependências) da landing page do grupo exclusivo do Dr. Romilto Pacheco.
// Uso: GROUP_URL="https://chat.whatsapp.com/..." PORT=3000 node server.js

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3000;
const GROUP_URL = process.env.GROUP_URL || "#entrar";
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
};

const escapeAttr = (s) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// O HTML é lido uma vez e o link do grupo é injetado no lugar de {{GROUP_URL}}.
const indexHtml = fs
  .readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8")
  .replaceAll("{{GROUP_URL}}", escapeAttr(GROUP_URL));

const baseHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function serveFile(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Não encontrado");
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const headers = {
      ...baseHeaders,
      "Content-Type": type,
      "Cache-Control": "public, max-age=604800",
      "Accept-Ranges": "bytes",
    };

    // Suporte a Range para o vídeo tocar corretamente no Safari/iOS.
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        res.writeHead(416, { ...headers, "Content-Range": `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": end - start + 1,
      });
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }

    res.writeHead(200, { ...headers, "Content-Length": stat.size });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { ...baseHeaders, Allow: "GET, HEAD" });
    return res.end();
  }

  const { pathname } = new URL(req.url, "http://localhost");

  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, {
      ...baseHeaders,
      "Content-Type": MIME[".html"],
      "Cache-Control": "no-cache",
    });
    return res.end(req.method === "HEAD" ? undefined : indexHtml);
  }

  if (pathname === "/healthz") {
    res.writeHead(200, { ...baseHeaders, "Content-Type": "text/plain" });
    return res.end("ok");
  }

  // Bloqueia path traversal: o arquivo resolvido precisa ficar dentro de /public.
  const filePath = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, baseHeaders);
    return res.end();
  }
  serveFile(req, res, filePath);
});

server.listen(PORT, () => {
  console.log(`Landing Dr. Romilto Pacheco rodando em http://localhost:${PORT}`);
  if (GROUP_URL === "#entrar") {
    console.warn("Aviso: defina GROUP_URL com o link do grupo para ativar o botão de entrada.");
  }
});
