// Servidor Node.js (sem dependências) da versão interativa da promoção.
// Uso: ORDER_URL="https://seu-link-de-pedido" PORT=4173 node web/server.mjs
import { createServer } from "node:http";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const ORDER_URL = process.env.ORDER_URL || "#pedido";
const VIDEO = join(here, "..", "renders", "promo-forno-paulista.mp4");
const FONTS = join(here, "..", "assets", "fonts");

function sendPage(res) {
  const html = readFileSync(join(here, "index.html"), "utf8").replace(
    "__ORDER_URL__",
    () => JSON.stringify(ORDER_URL).slice(1, -1)
  );
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

// Suporte a Range para o <video> conseguir pular entre os trechos.
function sendVideo(req, res) {
  let size;
  try {
    size = statSync(VIDEO).size;
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Vídeo não encontrado. Rode `npm run render` antes.");
    return;
  }
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (!range) {
    res.writeHead(200, { "content-type": "video/mp4", "content-length": size, "accept-ranges": "bytes" });
    createReadStream(VIDEO).pipe(res);
    return;
  }
  const start = range[1] ? Number(range[1]) : 0;
  const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  res.writeHead(206, {
    "content-type": "video/mp4",
    "content-length": end - start + 1,
    "content-range": `bytes ${start}-${end}/${size}`,
    "accept-ranges": "bytes",
  });
  createReadStream(VIDEO, { start, end }).pipe(res);
}

createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/" || path === "/index.html") return sendPage(res);
  if (path === "/promo.mp4") return sendVideo(req, res);
  const font = /^\/fonts\/([\w-]+\.woff2)$/.exec(path);
  if (font) {
    try {
      const data = readFileSync(join(FONTS, font[1]));
      res.writeHead(200, { "content-type": "font/woff2" });
      return res.end(data);
    } catch {}
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, () => {
  console.log(`Promo interativa: http://localhost:${PORT}  (pedido → ${ORDER_URL})`);
});
