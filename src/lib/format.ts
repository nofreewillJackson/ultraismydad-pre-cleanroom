export const START_DATE = "2026-03-18";

export function slugify(value = "") {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function dayNum(dateStr?: string | null) {
  if (!dateStr) return null;
  const start = new Date(`${START_DATE}T00:00:00`);
  const date = new Date(`${dateStr}T00:00:00`);
  const diff = Math.floor((date.getTime() - start.getTime()) / 86400000) + 1;
  return diff >= 1 ? diff : null;
}

export function currentDay() {
  return dayNum(new Date().toISOString().slice(0, 10)) || 1;
}

export function fmtDate(dateStr?: string | null) {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
}

export function fmtDateFull(dateStr?: string | null) {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toLowerCase();
}

export function fmtDuration(sec?: number | null) {
  if (!sec) return "";
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

export function dateValue(dateStr?: string | null) {
  if (!dateStr) return 0;
  return new Date(`${dateStr}T00:00:00`).getTime();
}

export function escapeHtml(value = "") {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMd(value = "") {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return html;
}

export function renderMarkdownLite(text = "") {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    if (/^\*\*[^*]+\*\*$/.test(block)) {
      return `<h4>${inlineMd(block.replace(/^\*\*|\*\*$/g, ""))}</h4>`;
    }
    if (block.startsWith("- ")) {
      const items = block.split("\n").filter(Boolean).map((line) => `<li>${inlineMd(line.replace(/^- /, ""))}</li>`).join("");
      return `<ul>${items}</ul>`;
    }
    if (/^#{2,4}\s+/.test(block)) {
      return `<h4>${inlineMd(block.replace(/^#{2,4}\s+/, ""))}</h4>`;
    }
    return `<p>${inlineMd(block).replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

export function isEmbeddable(url?: string | null) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    const allow = [
      "netlify.app", "vercel.app", "github.io", "pages.dev", "netlify.com",
      "render.com", "railway.app", "fly.dev", "surge.sh", "manus.computer",
      "manuspre.computer", "manus-asia.computer", "manuscomputer.ai",
      "manusvm.computer", "adsmetri.com",
    ];
    const deny = [
      "github.com", "youtube.com", "youtu.be", "loom.com", "screen.studio",
      "twitter.com", "x.com", "linkedin.com", "notion.so", "drive.google.com",
      "docs.google.com",
    ];
    if (deny.some((domain) => hostname.includes(domain))) return false;
    return allow.some((domain) => hostname.includes(domain));
  } catch {
    return false;
  }
}

export function toVideoEmbed(url?: string | null) {
  if (!url) return "";
  try {
    if (url.includes("youtube.com/watch")) {
      const id = new URL(url).searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : url;
    }
    if (url.includes("youtu.be/")) {
      return `https://www.youtube.com/embed/${url.split("youtu.be/")[1]?.split("?")[0]}`;
    }
    if (url.includes("loom.com/share/")) {
      return `https://www.loom.com/embed/${url.split("loom.com/share/")[1]?.split("?")[0]}`;
    }
  } catch {
    return url;
  }
  return url;
}
