const $ = (id) => document.getElementById(id);
const editor = $("editor"), ecSelect = $("ec"), minifyBox = $("minify"), button = $("generate");
const status = $("status"), stats = $("stats"), output = $("qr-output"), meter = document.querySelector(".meter");
const encryptionPassword = $("encryptionPassword");

// Byte-mode capacity of Version 40 (177x177) per error-correction level
const CAPACITY = { L: 2953, M: 2331, Q: 1663, H: 1273 };
const fmt = (n) => n.toLocaleString("en-US");
const byteLen = (s) => new TextEncoder().encode(s).length;
const pipe = (a) => a.map((x) => `<i>${x}</i>`).join("&rsaquo;");

const MODES = {
  pack: { title: "Compress, then decode on a page", pipe: ["HTML", "GZIP", "Base43", "HTMLQR3/4:", "QR"],
    sub: "Your HTML is gzipped and encoded in the QR's compact alphanumeric format. Add a password to encrypt it; this app reverses the payload when scanned." },
  url: { title: "Convert to a data URL", pipe: ["HTML", "minify", "data: URL", "QR"],
    sub: "Your HTML becomes a data:text/html URL, and that URL is the QR code." }
};
let mode = "pack", seq = 0, qrDataUrl = "";

const TEMPLATES = {
  wedding: { title: "Wedding invitation", description: "An elegant invitation with a framed, ivory-paper look.", fields: [["names", "Names", "Aria & Noah"], ["date", "Date", "Saturday, 12 June 2027"], ["time", "Time", "4:00 PM"], ["place", "Venue", "The Willow Garden, Lakeside"], ["email", "RSVP email", "rsvp@example.com", "email"]] },
  birthday: { title: "Birthday", description: "A bright party poster with a bold age and celebration details.", fields: [["name", "Name", "Maya"], ["age", "Age", "30"], ["date", "Date", "Sun 10 Jan 2027"], ["time", "Time", "6:30 PM"], ["place", "Venue", "Rooftop Cafe, 4th Street"], ["email", "RSVP email", "maya@example.com", "email"]] },
  business: { title: "Business card", description: "A two-sided personal card with contact details.", fields: [["studio", "Business or studio", "Studio North"], ["role", "Role", "Product Designer"], ["name", "Name", "Alex Morgan"], ["email", "Email", "alex@studio.com", "email"], ["phone", "Phone", "+1 555 010 2030"], ["website", "Website", "studio.com"], ["initials", "Mark / initials", "SN"]] },
  contact: { title: "Contact card", description: "A profile card with tap-ready phone and email links.", fields: [["initials", "Initials", "SK"], ["name", "Name", "Sam Kumar"], ["role", "Role and organization", "Engineer - Northwind Labs"], ["phone", "Phone", "+1 555 010 2030"], ["email", "Email", "sam@example.com", "email"], ["location", "Location", "Berlin, DE"]] },
  event: { title: "Event poster", description: "A high-contrast poster with date, venue, and event details.", fields: [["category", "Category", "Meetup"], ["date", "Date", "20 March 2027"], ["name", "Event name", "Open Source Night"], ["time", "Time", "6:00 PM"], ["place", "Venue", "Hub Room 2"], ["details", "Details", "Talks, demos & pizza", "textarea"]] },
  ticket: { title: "Event ticket", description: "A compact ticket with a detachable seat stub.", fields: [["name", "Event name", "Summer Film Night"], ["date", "Date and time", "Fri 18 Jun 2027 - 8:00 PM"], ["place", "Venue", "Riverside Park"], ["seat", "Seat", "B-14"]] },
  thanks: { title: "Thank-you card", description: "A warm note for a celebration, gift, or kind gesture.", fields: [["heading", "Heading", "Thank you"], ["message", "Message", "Your kindness made our day so special. We’re so glad you were there.", "textarea"], ["signature", "Sign-off", "Aria & Noah"]] },
  badge: { title: "Name badge", description: "A classic hello sticker for a conference or gathering.", fields: [["name", "Name", "Jordan"], ["role", "Role or event", "Speaker - DevConf 2027"], ["access", "Access label", "ACCESS - ALL DAYS"]] }
};

const TEMPLATE_STYLES_BY_ID = {
  wedding: `body{font-family:Georgia,serif;color:#4a3f2e}.card{padding:14px;background:#fbf6ec;text-align:center}.inside{padding:40px 20px;border:1px solid #b08d57;outline:1px solid #b08d57;outline-offset:-7px}.wedding small{color:#8c7448;text-transform:uppercase;letter-spacing:.2em}.wedding h1{font-size:42px;font-weight:400;font-style:italic;line-height:1.05;margin:14px 0}.rule{color:#b08d57;margin:12px}`,
  birthday: `body{color:#2b2d42}.card{padding:28px 20px;text-align:center;background:#fff4e0;border-radius:18px}.age{display:grid;place-items:center;width:120px;height:130px;margin:8px auto 22px;border-radius:50%;background:#ff6b6b;color:white;font-size:58px;font-weight:900}.birthday h1{font-size:28px;margin:8px}.accent{color:#e04e4e;font-weight:700}`,
  business: `body{color:#1f1a17}.card{aspect-ratio:7/4;display:flex;justify-content:space-between;padding:22px;background:#f6f3ee;position:relative;overflow:hidden;border-radius:8px}.business:after{content:"";position:absolute;right:-42px;top:-62px;width:180px;height:180px;border-radius:50%;background:#d9633b}.business>*{position:relative;z-index:1}.business h1{font-size:25px;margin:4px 0}.role{font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#d9633b;font-weight:700}.business p{font-size:12px;line-height:1.6}.mark{align-self:flex-end;width:46px;height:46px;border:2px solid;border-radius:50%;display:grid;place-items:center;font-weight:700}`,
  contact: `body{color:white}.card{padding:24px;background:radial-gradient(circle at 15% 15%,#ee7c58,transparent 45%),radial-gradient(circle at 90% 15%,#2ec4b6,transparent 48%),#263238;border-radius:20px;text-align:center}.avatar{width:76px;height:76px;margin:0 auto 12px;border-radius:50%;display:grid;place-items:center;background:#ffd166;color:#263238;font-size:25px;font-weight:800}.contact h1{margin:4px}.links{margin-top:18px;padding:12px;background:#ffffff20;border:1px solid #ffffff55;border-radius:8px;line-height:1.9;overflow-wrap:anywhere}`,
  event: `body{color:#111}.card{padding:24px;background:#ffe14d;border:3px solid;box-shadow:8px 8px #111;text-transform:uppercase;font-family:Impact,"Arial Black",sans-serif}.label{display:inline-block;padding:4px 10px;background:#111;color:#ffe14d;font-size:13px}.date{font-size:72px;line-height:1;margin:20px 0 8px}.event h1{font-size:32px;line-height:1;margin:8px 0 12px}.event p{font:700 14px/1.5 system-ui,sans-serif;text-transform:none}`,
  ticket: `body{color:#e2e8f0}.card{display:flex;background:#0f172a;border-radius:12px;overflow:hidden}.main{flex:1;padding:24px}.ticket small{color:#22d3ee;text-transform:uppercase;letter-spacing:.2em}.ticket h1{font-size:25px;color:white}.ticket p{color:#aab5c5}.stub{display:grid;place-content:center;gap:10px;padding:14px;border-left:2px dashed #64748b;text-align:center}.stub b{font-size:25px;color:#22d3ee}@media(max-width:440px){.ticket{flex-direction:column}.stub{border-left:0;border-top:2px dashed #64748b}}`,
  thanks: `body{color:#3b3228}.card{padding:28px 20px;background:#c9a27a;outline:2px dashed #8b6b49;outline-offset:-10px}.note{padding:34px 20px;background:#fffdf7;text-align:center;box-shadow:0 4px 12px #0002;font-family:"Segoe Script","Bradley Hand",cursive}.thanks h1{font-size:40px;font-weight:400;color:#b4412d;margin:0}.thanks p{font-size:17px;white-space:pre-line}.heart{color:#b4412d;font-size:24px}`,
  badge: `body{color:#111}.card{width:min(100%,380px);overflow:hidden;background:white;border:1px solid #ddd;border-radius:12px;text-align:center}.head{padding:14px;background:#e11d48;color:white}.head strong{display:block;font-size:34px;letter-spacing:.1em}.name{margin:28px 20px 10px;padding-bottom:7px;border-bottom:2px solid;font:700 38px/1.2 "Segoe Print","Bradley Hand",cursive}.role{color:#666;text-transform:uppercase;letter-spacing:.12em;font-size:12px;padding:4px 10px 22px}.foot{background:#111;color:#eee;padding:9px;font-size:11px;letter-spacing:.12em}`
};
const TEMPLATE_BASE = `*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:18px;background:#f1eee9;font:16px/1.5 system-ui,sans-serif}.card{width:min(100%,520px);box-shadow:0 10px 24px #0002}@media(max-width:440px){body{padding:12px}}`;
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
const lineHTML = (value) => escapeHTML(value).replace(/\r?\n/g, "<br>");
function templateValues() {
  return Object.fromEntries([...$("templateForm").querySelectorAll("[data-template-field]")].map((input) => [input.dataset.templateField, input.value]));
}
function templateDocument(id, v) {
  const mail = encodeURIComponent(v.email || "").replace(/%40/gi, "@");
  const phone = (v.phone || "").replace(/[^+\d]/g, "");
  const content = {
    wedding: `<article class="card wedding"><div class="inside"><small>With their families</small><h1>${escapeHTML(v.names)}</h1><p>request the pleasure of your company<br>at their wedding celebration</p><div class="rule">✦ &nbsp; ✿ &nbsp; ✦</div><p><strong>${escapeHTML(v.date)}</strong></p><p>${escapeHTML(v.time)} · ${escapeHTML(v.place)}</p><p><a href="mailto:${mail}">RSVP</a></p></div></article>`,
    birthday: `<article class="card birthday"><div class="age">${escapeHTML(v.age)}</div><h1>${escapeHTML(v.name)}’s Birthday Bash</h1><p>${escapeHTML(v.date)} · ${escapeHTML(v.time)}<br>${escapeHTML(v.place)}</p><p class="accent"><a href="mailto:${mail}">I’ll be there</a></p></article>`,
    business: `<article class="card business"><div><div class="role">${escapeHTML(v.role)}</div><h1>${escapeHTML(v.name)}</h1><p>${escapeHTML(v.email)}<br>${escapeHTML(v.phone)}<br>${escapeHTML(v.website)}</p><strong>${escapeHTML(v.studio)}</strong></div><div class="mark">${escapeHTML(v.initials)}</div></article>`,
    contact: `<article class="card contact"><div class="avatar">${escapeHTML(v.initials)}</div><h1>${escapeHTML(v.name)}</h1><p>${escapeHTML(v.role)}</p><div class="links"><a href="tel:${escapeHTML(phone)}">${escapeHTML(v.phone)}</a><br><a href="mailto:${mail}">${escapeHTML(v.email)}</a><br>${escapeHTML(v.location)}</div></article>`,
    event: `<article class="card event"><span class="label">${escapeHTML(v.category)}</span><div class="date">${escapeHTML(v.date)}</div><h1>${escapeHTML(v.name)}</h1><p>${escapeHTML(v.time)} · ${escapeHTML(v.place)}</p><p>${lineHTML(v.details)}</p></article>`,
    ticket: `<article class="card ticket"><div class="main"><small>Admit one</small><h1>${escapeHTML(v.name)}</h1><p>${escapeHTML(v.date)}</p><p>${escapeHTML(v.place)}</p></div><div class="stub"><small>Seat</small><b>${escapeHTML(v.seat)}</b></div></article>`,
    thanks: `<article class="card thanks"><div class="note"><h1>${escapeHTML(v.heading)}</h1><p>${lineHTML(v.message)}</p><p>— ${escapeHTML(v.signature)}</p><div class="heart">♥</div></div></article>`,
    badge: `<article class="card badge"><div class="head"><strong>HELLO</strong><span>my name is</span></div><div class="name">${escapeHTML(v.name)}</div><div class="role">${escapeHTML(v.role)}</div><div class="foot">${escapeHTML(v.access)}</div></article>`
  }[id];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(TEMPLATES[id].title)}</title><style>${TEMPLATE_BASE}${TEMPLATE_STYLES_BY_ID[id]}</style></head><body>${content}</body></html>`;
}
function renderTemplateGallery() {
  $("templateGrid").innerHTML = Object.entries(TEMPLATES).map(([id, item], index) => `<button class="template-option" type="button" data-template="${id}"><span class="template-mark">0${index + 1}</span><strong>${item.title}</strong><span>${item.description}</span></button>`).join("");
}
function renderTemplateEditor(id) {
  const item = TEMPLATES[id];
  if (!item) return;
  $("templateTitle").textContent = item.title;
  $("templateForm").innerHTML = item.fields.map(([name, label, value, type]) => `<label>${label}${type === "textarea" ? `<textarea data-template-field="${name}">${escapeHTML(value)}</textarea>` : `<input data-template-field="${name}" type="${type || "text"}" value="${escapeHTML(value)}">`}</label>`).join("");
  updateTemplatePreview(id);
}
function updateTemplatePreview(id = location.hash.slice("#template-".length)) {
  if (!TEMPLATES[id] || !$("templateForm").querySelector("[data-template-field]")) return;
  $("templatePreview").srcdoc = templateDocument(id, templateValues());
}

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
const BASE43 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$%*+-./";
function base43Length(byteLength) { return Math.floor(byteLength / 2) * 3 + (byteLength % 2 ? 2 : 0); }
function toBase43(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 2) {
    const single = bytes.length - i === 1;
    const digits = single ? 2 : 3;
    let value = single ? bytes[i] : bytes[i] * 256 + bytes[i + 1];
    let group = "";
    for (let digit = digits - 1; digit >= 0; digit--) {
      group = BASE43[value % 43] + group;
      value = Math.floor(value / 43);
    }
    out += group;
  }
  return out;
}
function fromBase43(text) {
  if (text.length % 3 === 1) throw new Error("This compact QR payload is invalid.");
  const bytes = [];
  for (let i = 0; i < text.length;) {
    const digits = text.length - i === 2 ? 2 : 3;
    let value = 0;
    for (let j = 0; j < digits; j++) {
      const digit = BASE43.indexOf(text[i++]);
      if (digit < 0) throw new Error("This compact QR payload contains invalid characters.");
      value = value * 43 + digit;
    }
    if (digits === 2) {
      if (value > 255) throw new Error("This compact QR payload is invalid.");
      bytes.push(value);
    } else {
      if (value > 65535) throw new Error("This compact QR payload is invalid.");
      bytes.push(value >>> 8, value & 255);
    }
  }
  return new Uint8Array(bytes);
}
function uppercaseHostname(value) {
  return value.replace(/^([a-z][a-z0-9+.-]*:\/\/)([^/?#]+)/i, (_, scheme, authority) => {
    const at = authority.lastIndexOf("@");
    const userInfo = at < 0 ? "" : authority.slice(0, at + 1);
    return `${scheme.toUpperCase()}${userInfo}${authority.slice(at + 1).toUpperCase()}`;
  });
}
const faviconImage = new Image();
const faviconReady = new Promise((resolve) => {
  faviconImage.onload = () => resolve(true);
  faviconImage.onerror = () => resolve(false);
});
faviconImage.src = "assets/favicon.png";
function getCrypto() {
  if (!globalThis.isSecureContext || !globalThis.crypto?.subtle) {
    throw new Error("Password encryption requires Web Crypto in a secure context. Open this site over HTTPS or use localhost in a supported browser.");
  }
  return globalThis.crypto;
}
async function deriveEncryptionKey(password, salt, usage) {
  const webCrypto = getCrypto();
  const material = await webCrypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return webCrypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, material,
    { name: "AES-GCM", length: 256 }, false, [usage]);
}
async function encryptBytes(bytes, password) {
  const webCrypto = getCrypto();
  const salt = webCrypto.getRandomValues(new Uint8Array(16));
  const iv = webCrypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(password, salt, "encrypt");
  const ciphertext = new Uint8Array(await webCrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  const packed = new Uint8Array(salt.length + iv.length + ciphertext.length);
  packed.set(salt); packed.set(iv, salt.length); packed.set(ciphertext, salt.length + iv.length);
  return packed;
}

/* ---------- Payload ---------- */
async function buildPayload(measureOnly = false) {
  const raw = editor.value;
  const body = minifyBox.checked ? minifyHTML(raw) : raw.trim();
  const p = { empty: !body, originalBytes: byteLen(raw), minifiedBytes: byteLen(body) };
  if (mode === "url") {
    const ascii = /^[\x00-\x7f]*$/.test(body);
    p.url = (ascii ? "data:text/html," : "data:text/html;charset=utf-8,") + encodeBody(body);
    p.qrEquivalentBytes = p.payloadBytes = p.url.length;
  } else {
    const compressed = await gzip(body), password = encryptionPassword.value;
    const encodedLength = compressed.length + (password ? 44 : 0);
    const compactLength = base43Length(encodedLength);
    const compact = password && measureOnly ? "0".repeat(compactLength) : toBase43(password ? await encryptBytes(compressed, password) : compressed);
    const base = uppercaseHostname($("durl").value.trim().replace(/#.*$/, ""));
    const prefix = `${base ? `${base}#` : ""}${password ? "HTMLQR4:" : "HTMLQR3:"}`;
    const prefixBytes = byteLen(prefix);
    const alphaBits = Math.floor(compact.length / 2) * 11 + (compact.length % 2) * 6;
    p.gzBytes = compressed.length; p.compactChars = compact.length; p.encrypted = Boolean(password);
    p.alphanumericPrefix = prefix; p.alphanumericPayload = compact;
    p.url = prefix + compact;
    p.qrEquivalentBytes = Math.ceil((prefixBytes * 8 + alphaBits + 37) / 8);
    p.payloadBytes = p.url.length;
  }
  return p;
}

async function updateMeter() {
  const id = ++seq;
  const p = await buildPayload(true);
  if (id !== seq) return;
  const cap = CAPACITY[ecSelect.value], pct = (p.qrEquivalentBytes / cap) * 100;
  $("meter-text").textContent = `${fmt(p.payloadBytes)} QR chars · ${fmt(p.qrEquivalentBytes)} / ${fmt(cap)} byte-equivalent (${pct.toFixed(1)}%)`;
  $("bar-fill").style.width = Math.min(pct, 100) + "%";
  $("meter-cap").textContent = `Max: Version 40-${ecSelect.value}, byte mode`;
  meter.classList.toggle("warn", pct > 70 && pct <= 100);
  meter.classList.toggle("bad", pct > 100);
  $("meter-free").textContent = pct > 100 ? `Over by ${fmt(p.qrEquivalentBytes - cap)} byte-equivalent` : `${fmt(cap - p.qrEquivalentBytes)} byte-equivalent free`;
  button.disabled = pct > 100 || p.empty;
}

/* ---------- QR rendering ---------- */
async function drawQR(qr) {
  const count = qr.getModuleCount(), quiet = 4;
  const cell = Math.max(4, Math.floor(360 / (count + quiet * 2)));
  const size = (count + quiet * 2) * cell;
  const padding = Math.max(16, cell * 2), brandSize = Math.max(28, cell * 6);
  const footerHeight = brandSize + padding;
  const canvas = document.createElement("canvas");
  canvas.width = size + padding * 2;
  canvas.height = size + footerHeight + padding * 2;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  for (let r = 0; r < count; r++)
    for (let c = 0; c < count; c++)
      if (qr.isDark(r, c)) ctx.fillRect(padding + (c + quiet) * cell, padding + (r + quiet) * cell, cell, cell);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, size + padding, canvas.width, footerHeight + padding);
  await faviconReady;
  const fontSize = Math.max(12, Math.round(cell * 2.5)), gap = Math.max(8, cell * 1.5);
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  const label = "HTML TO QR", labelWidth = ctx.measureText(label).width;
  const brandWidth = brandSize + gap + labelWidth;
  const brandX = (canvas.width - brandWidth) / 2;
  const brandY = size + padding + (footerHeight - brandSize) / 2;
  if (faviconImage.naturalWidth) ctx.drawImage(faviconImage, brandX, brandY, brandSize, brandSize);
  ctx.fillStyle = "#101a2b";
  ctx.textBaseline = "middle";
  ctx.fillText(label, brandX + brandSize + gap, brandY + brandSize / 2);
  const img = new Image();
  qrDataUrl = canvas.toDataURL("image/png");
  img.src = qrDataUrl;
  img.alt = "Generated QR code with HTML to QR branding";
  output.innerHTML = "";
  output.appendChild(img);
  $("downloadQR").href = qrDataUrl;
  $("downloadQR").hidden = false;
}
const statCell = (l, v) => `<div>${l}<b>${v}</b></div>`;

function clearOutput() {
  output.innerHTML = ""; stats.innerHTML = ""; qrDataUrl = ""; $("downloadQR").hidden = true;
  status.textContent = "Waiting for input...";
}

function updatePreview() {
  $("previewFrame").srcdoc = editor.value;
}

$("previewOpen").addEventListener("click", () => {
  $("previewPanel").hidden = false;
  $("previewOpen").hidden = true;
  updatePreview();
  $("previewPanel").scrollIntoView({ block: "nearest" });
});
$("previewClose").addEventListener("click", () => {
  $("previewPanel").hidden = true;
  $("previewOpen").hidden = false;
});
editor.addEventListener("input", () => {
  if (!$("previewPanel").hidden) updatePreview();
});
document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => $(button.dataset.close).close());
});
document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = $(button.dataset.togglePassword);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.setAttribute("aria-label", show ? "Hide password" : "Show password");
    button.title = show ? "Hide password" : "Show password";
  });
});

let scannerStream = null, scannerFrame = 0;
async function stopScanner() {
  cancelAnimationFrame(scannerFrame);
  if (scannerStream) scannerStream.getTracks().forEach((track) => track.stop());
  scannerStream = null;
  $("scannerVideo").srcObject = null;
}
function decodeHtmlDataUrl(value) {
  const comma = value.indexOf(",");
  if (comma < 0) throw new Error("This data URL is incomplete.");
  const metadata = value.slice(5, comma);
  if (!/^text\/html(?:;|$)/i.test(metadata)) throw new Error("Only text/html data URLs can be opened here.");
  const body = value.slice(comma + 1);
  if (/(?:^|;)base64(?:;|$)/i.test(metadata)) {
    const binary = atob(body);
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }
  return decodeURIComponent(body);
}
const approvedPayloads = new Set();
const UNTRUSTED_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'">`;
function secureUntrustedHtml(html) {
  const doctype = html.match(/^\uFEFF?\s*<!doctype[^>]*>/i);
  if (!doctype) return UNTRUSTED_CSP + html;
  const end = doctype[0].length;
  return html.slice(0, end) + UNTRUSTED_CSP + html.slice(end);
}
function confirmPageRun(payloadKey) {
  if (approvedPayloads.has(payloadKey)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const dialog = $("runPageDialog");
    dialog.addEventListener("close", () => {
      const approved = dialog.returnValue === "run";
      if (approved) approvedPayloads.add(payloadKey);
      resolve(approved);
    }, { once: true });
    dialog.showModal();
  });
}
async function showScannedHtml(html, payloadKey) {
  $("home").hidden = $("work").hidden = $("back").hidden = true;
  $("viewer").hidden = false;
  $("vframe").srcdoc = "";
  $("vmsg").textContent = "Reviewing untrusted page";
  if (!await confirmPageRun(payloadKey)) {
    $("vmsg").textContent = "Page not run";
    return;
  }
  $("vframe").srcdoc = secureUntrustedHtml(html);
  $("vmsg").textContent = "Opened from scanned data URL in a restricted sandbox";
}
function useScannedValue(value) {
  if (["HTMLQR1:", "HTMLQR2:", "HTMLQR3:", "HTMLQR4:"].some((prefix) => value.startsWith(prefix))) {
    stopScanner();
    $("scannerDialog").close();
    location.hash = value;
    return true;
  } else if (/^https?:\/\//i.test(value)) {
    stopScanner();
    $("scannerDialog").close();
    location.href = value;
    return true;
  } else if (/^data:text\/html/i.test(value)) {
    try {
      const html = decodeHtmlDataUrl(value);
      stopScanner();
      $("scannerDialog").close();
      showScannedHtml(html, value);
      return true;
    } catch (error) {
      $("scannerStatus").textContent = error.message || "Could not open this data URL.";
      return false;
    }
  }
  $("scannerStatus").textContent = `Scanned: ${value}`;
  return false;
}
async function startScanner() {
  const video = $("scannerVideo"), message = $("scannerStatus");
  message.textContent = "Starting camera...";
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera scanning requires HTTPS or localhost.");
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    if (!$("scannerDialog").open) { await stopScanner(); return; }
    video.srcObject = scannerStream;
    await video.play();
    message.textContent = "Point the camera at a QR code.";
    const detector = "BarcodeDetector" in window ? new BarcodeDetector({ formats: ["qr_code"] }) : null;
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d", { willReadFrequently: true });
    const scan = async () => {
      if (!$("scannerDialog").open || !scannerStream) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        let value = "";
        if (detector) {
          try { value = (await detector.detect(video))[0]?.rawValue || ""; } catch {}
        } else if (window.jsQR) {
          value = window.jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" })?.data || "";
        }
        if (value && useScannedValue(value)) return;
      }
      scannerFrame = requestAnimationFrame(scan);
    };
    scannerFrame = requestAnimationFrame(scan);
  } catch (error) {
    message.textContent = error.message || "Could not start the camera. Check browser permissions.";
    await stopScanner();
  }
}
document.querySelectorAll('[data-open="scannerDialog"]').forEach((button) => {
  button.addEventListener("click", () => {
    document.documentElement.classList.add("scanner-open");
    $("scannerDialog").showModal();
    startScanner();
  });
});
$("scannerDialog").addEventListener("close", () => {
  document.documentElement.classList.remove("scanner-open");
  stopScanner();
});
$("scannerDialog").addEventListener("click", (event) => {
  if (event.target === $("scannerDialog")) $("scannerDialog").close();
});
$("scannerDialog").addEventListener("close", () => {
  if (!scannerStream) $("scannerStatus").textContent = "Camera access is needed to scan.";
});
$("scannerDialog").addEventListener("cancel", stopScanner);

button.addEventListener("click", async () => {
  try {
    status.textContent = "Generating QR...";
    const p = await buildPayload(), level = ecSelect.value;
    if (p.qrEquivalentBytes > CAPACITY[level]) throw new Error("This HTML is too large for a single QR code.");
    const qr = qrcode(0, level); // 0 = smallest version that fits (easiest to scan)
    if (p.alphanumericPayload !== undefined) {
      qr.addData(p.alphanumericPrefix, "Byte");
      qr.addData(p.alphanumericPayload, "Alphanumeric");
    } else qr.addData(p.url, "Byte");
    qr.make();
    await drawQR(qr);
    const modules = qr.getModuleCount(), version = (modules - 17) / 4;
    stats.innerHTML =
      statCell("Original HTML", `${fmt(p.originalBytes)} bytes`) +
      statCell("After minify", `${fmt(p.minifiedBytes)} bytes`) +
      (mode === "pack"
        ? statCell("After GZIP", `${fmt(p.gzBytes)} bytes`) + statCell("Base43 payload", `${fmt(p.compactChars)} QR characters`)
        : "") +
      statCell(mode === "pack" ? "QR payload" : "Data URL payload", `${fmt(p.payloadBytes)} characters`) +
      statCell(`QR capacity (V40-${level})`, `${fmt(CAPACITY[level])} byte-equivalent`) +
      statCell("QR version used", `${version} of 40`) +
      statCell("Grid", `${modules} × ${modules} modules`);
    status.textContent = mode === "pack" ? "QR generated. Scan it to open the decoded page." : "QR generated.";
  } catch (error) {
    status.textContent = error.message;
    output.innerHTML = ""; stats.innerHTML = ""; $("downloadQR").hidden = true;
  }
});

/* ---------- Built-in decoder: #HTMLQR1:<payload> opens the page packed in the QR ---------- */
async function unpack(h) {
  const compact = h.startsWith("HTMLQR3:") || h.startsWith("HTMLQR4:");
  const bin = compact ? null : atob(h.slice(8).replace(/-/g, "+").replace(/_/g, "/"));
  let bytes = compact ? fromBase43(h.slice(8)) : Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (h.startsWith("HTMLQR2:") || h.startsWith("HTMLQR4:")) {
    const salt = bytes.slice(0, 16), iv = bytes.slice(16, 28), ciphertext = bytes.slice(28);
    const webCrypto = getCrypto();
    const key = await deriveEncryptionKey($("unlockPassword").value, salt, "decrypt");
    bytes = new Uint8Array(await webCrypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext));
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}
function requestPassword(message) {
  return new Promise((resolve) => {
    const dialog = $("passwordDialog"), input = $("unlockPassword"), form = $("passwordForm");
    $("passwordMessage").textContent = message;
    input.value = "";
    const finish = (value) => {
      form.removeEventListener("submit", submit);
      $("cancelUnlock").removeEventListener("click", cancel);
      dialog.removeEventListener("cancel", cancel);
      dialog.close();
      resolve(value);
    };
    const submit = (event) => { event.preventDefault(); finish(input.value); };
    const cancel = () => finish(null);
    form.addEventListener("submit", submit);
    $("cancelUnlock").addEventListener("click", cancel);
    dialog.addEventListener("cancel", cancel, { once: true });
    dialog.showModal();
    input.focus();
  });
}
async function showViewer(h) {
  $("viewer").hidden = false;
  $("vframe").srcdoc = "";
  $("vmsg").textContent = "Reviewing untrusted page";
  if (!await confirmPageRun(h)) {
    $("vmsg").textContent = "Page not run";
    return;
  }
  const encrypted = h.startsWith("HTMLQR2:") || h.startsWith("HTMLQR4:");
  if (encrypted) {
    try { getCrypto(); }
    catch (error) {
      $("vmsg").textContent = error.message;
      return;
    }
  }
  let failedAttempts = 0;
  while (true) {
    $("vmsg").textContent = encrypted ? "Waiting for password..." : "Decoding...";
    if (encrypted) {
      const password = await requestPassword(failedAttempts ? "That password did not unlock this QR. Try again." : "Enter the password used to encrypt this page.");
      if (password === null) { $("vmsg").textContent = "Encrypted page locked"; return; }
      $("unlockPassword").value = password;
    }
    try {
      $("vframe").srcdoc = secureUntrustedHtml(await unpack(h));
      $("unlockPassword").value = "";
      $("vmsg").textContent = encrypted ? "Decrypted locally in a restricted sandbox" : "Decoded locally in a restricted sandbox";
      return;
    } catch (e) {
      if (encrypted && e.message?.includes("requires Web Crypto")) {
        $("vmsg").textContent = e.message;
        return;
      }
      if (encrypted) { failedAttempts++; continue; }
      $("vframe").srcdoc = "<p style='font:16px system-ui;padding:24px'>This link does not hold a valid HTMLQR payload.</p>";
      $("vmsg").textContent = "Could not decode";
      return;
    }
  }
}

/* ---------- Routing: #home, #compress, #dataurl ---------- */
function route() {
  const h = location.hash.slice(1);
  if (["HTMLQR1:", "HTMLQR2:", "HTMLQR3:", "HTMLQR4:"].some((prefix) => h.startsWith(prefix))) {
    $("home").hidden = $("work").hidden = $("back").hidden = true;
    showViewer(h);
    return;
  }
  $("viewer").hidden = true;
  const templateId = h.startsWith("template-") ? h.slice("template-".length) : "";
  const isTemplateEditor = Boolean(TEMPLATES[templateId]);
  const isTemplateGallery = h === "templates";
  templateGallery.hidden = !isTemplateGallery;
  templateEditor.hidden = !isTemplateEditor;
  if (isTemplateGallery) renderTemplateGallery();
  if (isTemplateEditor) renderTemplateEditor(templateId);
  const working = h === "compress" || h === "dataurl";
  $("home").hidden = working || isTemplateGallery || isTemplateEditor;
  $("work").hidden = !working; $("back").hidden = !working;
  if (working) {
    mode = h === "dataurl" ? "url" : "pack";
    const m = MODES[mode];
    $("wtitle").textContent = m.title;
    $("wpipe").innerHTML = pipe(m.pipe);
    $("wsub").textContent = m.sub;
    $("packOnly").hidden = mode !== "pack";
    $("passwordOnly").hidden = mode !== "pack";
    $("swapTo").textContent = mode === "pack" ? "to Data URL" : "to Compress";
    if (!$("durl").value && /^https?:/.test(location.href)) $("durl").value = location.href.split("#")[0];
    clearOutput();
    updateMeter();
  }
  window.scrollTo(0, 0);
}
addEventListener("hashchange", route);
$("templateGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-template]");
  if (button) location.hash = `template-${button.dataset.template}`;
});
$("templateForm").addEventListener("input", () => updateTemplatePreview());
document.querySelectorAll("[data-template-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    const id = location.hash.slice("#template-".length);
    if (!TEMPLATES[id]) return;
    editor.value = templateDocument(id, templateValues());
    clearOutput();
    location.hash = button.dataset.templateMode;
  });
});
editor.addEventListener("input", updateMeter);
ecSelect.addEventListener("change", updateMeter);
minifyBox.addEventListener("change", updateMeter);
$("durl").addEventListener("input", updateMeter);
encryptionPassword.addEventListener("input", updateMeter);
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
      ["#HTMLQR1:", "#HTMLQR2:", "#HTMLQR3:", "#HTMLQR4:"].some((prefix) => location.hash.startsWith(prefix)) || !customElements.get("qr-burst")) {
    done = true; intro.remove(); return;
  }
  if (/^https?:/.test(location.href)) qr.setAttribute("data", location.href.split("#")[0]);
  qr.addEventListener("burstend", () => setTimeout(close, 250), { once: true });
  timer = setTimeout(close, 6000); // safety net
  $("skipIntro").addEventListener("click", close);
})();