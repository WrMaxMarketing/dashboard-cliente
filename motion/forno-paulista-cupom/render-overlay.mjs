// Render do overlay: .webm com transparência (VP9 alfa), .mp4 tela verde (sem fundo escuro, p/ chroma key)
// e .mov com alfa opcional (--mov, arquivo grande)
// uso: node render-overlay.mjs
import { createRequire } from "module";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); }
catch { playwright = require(path.join(process.execPath, "../../lib/node_modules/playwright")); }

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await playwright.chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
fs.mkdirSync(path.join(dir, "overlay"), { recursive: true });
const out = n => path.join(dir, "overlay", n);

async function frames(query, folder) {
  fs.rmSync(folder, { recursive: true, force: true }); fs.mkdirSync(folder);
  await page.goto("file://" + path.join(dir, "overlay.html") + "?render" + query);
  await page.evaluate(() => window.ready);
  const { duration, fps } = await page.evaluate(() => window.CFG);
  for (let i = 0; i < Math.round(duration * fps); i++) {
    const url = await page.evaluate(t => { render(t); return document.getElementById("c").toDataURL("image/png"); }, i / fps);
    fs.writeFileSync(path.join(folder, `f${String(i).padStart(4, "0")}.png`), Buffer.from(url.split(",")[1], "base64"));
  }
  return { duration, fps };
}
const ff = a => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);

// 1) com fundo escuro suave + alfa
const fa = path.join(dir, "frames-alpha");
const { duration, fps } = await frames("", fa);
const inA = ["-framerate", String(fps), "-i", path.join(fa, "f%04d.png")];
ff([...inA, "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "26", "-auto-alt-ref", "0", out("cupom-bemvindo-alpha.webm")]);
if (process.argv.includes("--mov")) ff([...inA, "-c:v", "png", "-pix_fmt", "rgba", out("cupom-bemvindo-alpha.mov")]);
// 2) tela verde, sem o fundo escuro
const fg = path.join(dir, "frames-green");
await frames("&plate=0", fg);
ff(["-framerate", String(fps), "-i", path.join(fg, "f%04d.png"), "-f", "lavfi", "-i", `color=c=0x00FF00:s=1080x1920:r=${fps}:d=${duration}`,
  "-filter_complex", "[1][0]overlay=format=auto,format=yuv420p", "-c:v", "libx264", "-crf", "18", "-movflags", "+faststart", out("cupom-bemvindo-tela-verde.mp4")]);
await browser.close();
if (!process.argv.includes("--keep")) for (const f of [fa, fg]) fs.rmSync(f, { recursive: true, force: true });
console.log("ok");
