const $ = (id) => document.getElementById(id);
const editor = $("editor"), ecSelect = $("ec"), minifyBox = $("minify"), button = $("generate");
const status = $("status"), stats = $("stats"), output = $("qr-output"), meter = document.querySelector(".meter");

// Byte-mode capacity of Version 40 (177x177) per error-correction level
const CAPACITY = { L: 2953, M: 2331, Q: 1663, H: 1273 };
const fmt = (n) => n.toLocaleString("en-US");
const byteLen = (s) => new TextEncoder().encode(s).length;
const pipe = (a) => a.map((x) => `<i>${x}</i>`).join("&rsaquo;");

const MODES = {
  pack: { title: "Compress, then decode on a page", pipe: ["HTML", "GZIP", "Base64", "HTMLQR1:", "QR"],
    sub: "Your HTML is gzipped, Base64-encoded and prefixed with HTMLQR1:. This app reverses it when the QR is scanned." },
  url: { title: "Convert to a data URL", pipe: ["HTML", "minify", "data: URL", "QR"],
    sub: "Your HTML becomes a data:text/html URL, and that URL is the QR code." }
};
let mode = "pack", seq = 0;

/* ---------- HTML minifier (leaves <script>, <pre>, <textarea> alone) ---------- */
const STRUCTURAL = "html|head|body|style|script|title|meta|link|div|p|h[1-6]|ul|ol|li|section|main|header|footer|nav|table|tr|td|th|br|hr";
function minifyHTML(html) {
  const keep = [];
  let s = html.replace(/<(script|pre|textarea)\b[\s\S]*?<\/\1>/gi, (m) => { keep.push(m); return `\u0001${keep.length - 1}\u0002`; });
  s = s.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (m) => m.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s*([{};,>])\s*/g, "$1").replace(/:\s+/g, ":"))
    .replace(/\s+/g, " ")
    .replace(new RegExp(`\\s+(<\\/?(?:${STRUCTURAL})\\b[^>]*>)`, "gi"), "$1")
    .replace(new RegExp(`(<\\/?(?:${STRUCTURAL})\\b[^>]*>)\\s+`, "gi"), "$1")
    .trim();
  return s.replace(/\u0001(\d+)\u0002/g, (_, i) => keep[i]);
}

/* ---------- Data-URL encoding: only characters that break the URL are percent-encoded ---------- */
const SAFE = /[A-Za-z0-9\-_.~!$&'()*+,;=:@\/?]/;
const encoder = new TextEncoder();
function encodeBody(text) {
  let out = "";
  for (const ch of text) {
    if (SAFE.test(ch)) out += ch;
    else for (const b of encoder.encode(ch)) out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

/* ---------- GZIP + Base64 (URL-safe alphabet, no padding) ---------- */
async function gzip(str) {
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function toBase64Url(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ---------- Payload ---------- */
async function buildPayload() {
  const raw = editor.value;
  const body = minifyBox.checked ? minifyHTML(raw) : raw.trim();
  const p = { empty: !body, originalBytes: byteLen(raw), minifiedBytes: byteLen(body) };
  if (mode === "url") {
    const ascii = /^[\x00-\x7f]*$/.test(body);
    p.url = (ascii ? "data:text/html," : "data:text/html;charset=utf-8,") + encodeBody(body);
  } else {
    const z = await gzip(body), b64 = toBase64Url(z);
    const base = $("durl").value.trim().replace(/#.*$/, "");
    p.gzBytes = z.length; p.b64Bytes = b64.length;
    p.url = (base ? base + "#" : "") + "HTMLQR1:" + b64;
  }
  p.payloadBytes = p.url.length; // pure ASCII, so chars == bytes
  return p;
}

async function updateMeter() {
  const id = ++seq;
  const p = await buildPayload();
  if (id !== seq) return;
  const cap = CAPACITY[ecSelect.value], pct = (p.payloadBytes / cap) * 100;
  $("meter-text").textContent = `${fmt(p.payloadBytes)} / ${fmt(cap)} bytes (${pct.toFixed(1)}%)`;
  $("bar-fill").style.width = Math.min(pct, 100) + "%";
  $("meter-cap").textContent = `Max: Version 40-${ecSelect.value}, byte mode`;
  meter.classList.toggle("warn", pct > 70 && pct <= 100);
  meter.classList.toggle("bad", pct > 100);
  $("meter-free").textContent = pct > 100 ? `Over by ${fmt(p.payloadBytes - cap)} bytes` : `${fmt(cap - p.payloadBytes)} bytes free`;
  button.disabled = pct > 100 || p.empty;
}

/* ---------- QR rendering ---------- */
function drawQR(qr) {
  const count = qr.getModuleCount(), quiet = 4;
  const cell = Math.max(4, Math.floor(360 / (count + quiet * 2)));
  const size = (count + quiet * 2) * cell;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  for (let r = 0; r < count; r++)
    for (let c = 0; c < count; c++)
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  const img = new Image();
  img.src = canvas.toDataURL("image/png");
  img.alt = "Generated QR code";
  output.innerHTML = "";
  output.appendChild(img);
}
const statCell = (l, v) => `<div>${l}<b>${v}</b></div>`;

function clearOutput() {
  output.innerHTML = ""; stats.innerHTML = ""; $("saveHint").hidden = true;
  status.textContent = "Waiting for input...";
}

button.addEventListener("click", async () => {
  try {
    status.textContent = "Generating QR...";
    const p = await buildPayload(), level = ecSelect.value;
    if (p.payloadBytes > CAPACITY[level]) throw new Error("This HTML is too large for a single QR code.");
    const qr = qrcode(0, level); // 0 = smallest version that fits (easiest to scan)
    qr.addData(p.url, "Byte");
    qr.make();
    drawQR(qr);
    $("saveHint").hidden = false;
    const modules = qr.getModuleCount(), version = (modules - 17) / 4;
    stats.innerHTML =
      statCell("Original HTML", `${fmt(p.originalBytes)} bytes`) +
      statCell("After minify", `${fmt(p.minifiedBytes)} bytes`) +
      (mode === "pack"
        ? statCell("After GZIP", `${fmt(p.gzBytes)} bytes`) + statCell("After Base64", `${fmt(p.b64Bytes)} bytes`)
        : "") +
      statCell(mode === "pack" ? "QR payload" : "Data URL payload", `${fmt(p.payloadBytes)} bytes`) +
      statCell(`QR capacity (V40-${level})`, `${fmt(CAPACITY[level])} bytes`) +
      statCell("QR version used", `${version} of 40`) +
      statCell("Grid", `${modules} × ${modules} modules`);
    status.textContent = mode === "pack" ? "QR generated. Scan it to open the decoded page." : "QR generated.";
  } catch (error) {
    status.textContent = error.message;
    output.innerHTML = ""; stats.innerHTML = ""; $("saveHint").hidden = true;
  }
});

/* ---------- Built-in decoder: #HTMLQR1:<payload> opens the page packed in the QR ---------- */
async function unpack(h) {
  const bin = atob(h.slice(8).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}
async function showViewer(h) {
  $("viewer").hidden = false;
  $("vmsg").textContent = "Decoding...";
  try {
    $("vframe").srcdoc = await unpack(h);
    $("vmsg").textContent = "Decoded from the QR code and running in a sandbox";
  } catch (e) {
    $("vframe").srcdoc = "<p style='font:16px system-ui;padding:24px'>This link does not hold a valid HTMLQR1 payload.</p>";
    $("vmsg").textContent = "Could not decode";
  }
}

/* ---------- Routing: #home, #compress, #dataurl ---------- */
function route() {
  const h = location.hash.slice(1);
  if (h.startsWith("HTMLQR1:")) {
    $("home").hidden = $("work").hidden = $("back").hidden = true;
    showViewer(h);
    return;
  }
  $("viewer").hidden = true;
  const working = h === "compress" || h === "dataurl";
  $("home").hidden = working; $("work").hidden = !working; $("back").hidden = !working;
  if (working) {
    mode = h === "dataurl" ? "url" : "pack";
    const m = MODES[mode];
    $("wtitle").textContent = m.title;
    $("wpipe").innerHTML = pipe(m.pipe);
    $("wsub").textContent = m.sub;
    $("packOnly").hidden = mode !== "pack";
    $("swapTo").textContent = mode === "pack" ? "to Data URL" : "to Compress";
    if (!$("durl").value && /^https?:/.test(location.href)) $("durl").value = location.href.split("#")[0];
    clearOutput();
    updateMeter();
  }
  window.scrollTo(0, 0);
}
addEventListener("hashchange", route);
editor.addEventListener("input", updateMeter);
ecSelect.addEventListener("change", updateMeter);
minifyBox.addEventListener("change", updateMeter);
$("durl").addEventListener("input", updateMeter);
$("back").addEventListener("click", () => { location.hash = mode === "pack" ? "#dataurl" : "#compress"; });
route();

/* ---------- Intro: one burst of <qr-burst>, then the app ---------- */
(() => {
  const intro = $("intro"), qr = $("introQR");
  let timer = 0, done = false;
  const close = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    intro.classList.add("out");
    setTimeout(() => intro.remove(), 550); // removing it also stops the animation loop
  };
  // Scanned payload links, reduced-motion users and a missing component go straight to the app
  if (matchMedia("(prefers-reduced-motion: reduce)").matches ||
      location.hash.startsWith("#HTMLQR1:") || !customElements.get("qr-burst")) {
    done = true; intro.remove(); return;
  }
  if (/^https?:/.test(location.href)) qr.setAttribute("data", location.href.split("#")[0]);
  qr.addEventListener("burstend", () => setTimeout(close, 250), { once: true });
  timer = setTimeout(close, 6000); // safety net
  $("skipIntro").addEventListener("click", close);
})();