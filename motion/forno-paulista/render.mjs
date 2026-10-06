// Render quadro a quadro: navegador sem tela + ffmpeg
// uso: node render.mjs [saida.mp4] [--frames 0,90,180 para só capturar stills]
import { createRequire } from "module";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); }
catch { playwright = require(path.join(process.execPath, "../../lib/node_modules/playwright")); }

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const out = path.resolve(args.find(a => a.endsWith(".mp4")) ?? path.join(dir, "forno-paulista.mp4"));
const stillsArg = args.includes("--frames") ? args[args.indexOf("--frames") + 1] : null;

const browser = await playwright.chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto("file://" + path.join(dir, "scene.html") + "?render");
await page.evaluate(() => window.ready);
const { duration, fps } = await page.evaluate(() => window.CFG);

const grab = t => page.evaluate(t => { render(t); return document.getElementById("c").toDataURL("image/png"); }, t)
  .then(u => Buffer.from(u.split(",")[1], "base64"));

if (stillsArg) {
  fs.mkdirSync(path.join(dir, "stills"), { recursive: true });
  for (const f of stillsArg.split(",").map(Number)) {
    fs.writeFileSync(path.join(dir, "stills", `f${String(f).padStart(4, "0")}.png`), await grab(f / fps));
  }
} else {
  const total = Math.round(duration * fps);
  const ff = spawn("ffmpeg", ["-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
    { stdio: ["pipe", "ignore", "inherit"] });
  for (let i = 0; i < total; i++) {
    const buf = await grab(i / fps);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (i % 30 === 0) process.stdout.write(`quadro ${i}/${total}\n`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on("close", r));
  console.log("ok:", out);
}
await browser.close();
