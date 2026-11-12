/**
 * Share images with the site link (monochrome, matches the game's style):
 *   public/og.png          1200×630  — link preview in Telegram/Discord/etc. (og:image)
 *   share/cosmic-party.png 1080×1350 — poster with QR code to send or show
 * Usage: npx tsx scripts/make-share-images.ts [url]
 */
import { mkdirSync } from "node:fs";
import QRCode from "qrcode";
import sharp from "sharp";

const URL_ = process.argv[2] ?? "https://cosmic-party.onrender.com";
const host = URL_.replace(/^https?:\/\//, "");
const FONT = "Segoe UI, Manrope, Arial, sans-serif";

// deterministic star field
function stars(w: number, h: number, n: number, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let out = "";
  for (let i = 0; i < n; i++) {
    const r = rnd() < 0.08 ? 1.8 : rnd() < 0.3 ? 1.1 : 0.7;
    out += `<circle cx="${(rnd() * w).toFixed(1)}" cy="${(rnd() * h).toFixed(1)}" r="${r}" fill="#fff" opacity="${(0.25 + rnd() * 0.7).toFixed(2)}"/>`;
  }
  return out;
}

const planet = (cx: number, cy: number, r: number) => `
  <defs><radialGradient id="pl" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#3a3a3a"/><stop offset="0.6" stop-color="#151515"/><stop offset="1" stop-color="#050505"/></radialGradient></defs>
  <ellipse cx="${cx}" cy="${cy}" rx="${r * 1.9}" ry="${r * 0.42}" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="2" transform="rotate(-16 ${cx} ${cy})"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#pl)" stroke="#fff" stroke-opacity="0.22" stroke-width="1.5"/>
  <path d="M ${cx - r * 1.86} ${cy + r * 0.2} A ${r * 1.9} ${r * 0.42} 0 0 0 ${cx + r * 1.86} ${cy - r * 0.2}" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="2.5" transform="rotate(-16 ${cx} ${cy})"/>`;

async function qrSvg(size: number) {
  const svg = await QRCode.toString(URL_, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*viewBox="([^"]+)"[^>]*>/, (_m, vb) => `<svg viewBox="${vb}" width="${size}" height="${size}" shape-rendering="crispEdges">`);
  return inner;
}

async function og() {
  const W = 1200, H = 630;
  const qr = await qrSvg(220);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="#050505"/>${stars(W, H, 260)}
  ${planet(1010, 120, 70)}
  <text x="80" y="200" font-family="${FONT}" font-size="34" font-weight="700" fill="#A3A3A3" letter-spacing="8">COSMIC</text>
  <text x="76" y="300" font-family="${FONT}" font-size="112" font-weight="800" fill="#fff">PARTY</text>
  <text x="80" y="370" font-family="${FONT}" font-size="34" font-weight="600" fill="#fff">Назови то, что никто не назовёт</text>
  <text x="80" y="418" font-family="${FONT}" font-size="26" fill="#A3A3A3">Онлайн-игра для компании · 2–12 игроков · без регистрации</text>
  <rect x="80" y="476" width="${host.length * 19 + 64}" height="70" rx="35" fill="#fff"/>
  <text x="112" y="522" font-family="${FONT}" font-size="30" font-weight="700" fill="#000">${host}</text>
  <rect x="880" y="330" width="250" height="250" rx="22" fill="#fff"/>
  <g transform="translate(895 345)">${qr}</g>
</svg>`;
  mkdirSync("public", { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile("public/og.png");
}

async function poster() {
  const W = 1080, H = 1350;
  const qr = await qrSvg(560);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="#050505"/>${stars(W, H, 420, 11)}
  ${planet(890, 170, 80)}
  <text x="540" y="200" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="700" fill="#A3A3A3" letter-spacing="10">COSMIC</text>
  <text x="540" y="320" text-anchor="middle" font-family="${FONT}" font-size="132" font-weight="800" fill="#fff">PARTY</text>
  <text x="540" y="395" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="600" fill="#fff">Назови то, что никто не назовёт</text>
  <rect x="230" y="460" width="620" height="620" rx="40" fill="#fff"/>
  <g transform="translate(260 490)">${qr}</g>
  <text x="540" y="1150" text-anchor="middle" font-family="${FONT}" font-size="30" fill="#A3A3A3">Наведи камеру или открой ссылку</text>
  <text x="540" y="1220" text-anchor="middle" font-family="${FONT}" font-size="50" font-weight="800" fill="#fff">${host}</text>
</svg>`;
  mkdirSync("share", { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile("share/cosmic-party.png");
}

await og();
await poster();
console.log("ok", URL_);
