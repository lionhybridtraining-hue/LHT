import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function loadEnvFile(envPath) {
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    if (!key || process.env[key] != null) continue;
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), ".env"));
loadEnvFile(path.join(process.cwd(), ".env.local"));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

function isoDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function normalizePost(row) {
  return {
    slug: row.slug,
    title: row.title || row.slug,
    date: isoDate(row.published_at || row.updated_at || row.created_at),
    category: row.category || "Artigo",
    excerpt: row.excerpt || ""
  };
}

async function supabaseRequest(pathAndQuery) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : [];
  } catch {
    payload = [];
  }

  if (!response.ok) {
    throw new Error(payload?.message || `Supabase error ${response.status}`);
  }

  return Array.isArray(payload) ? payload : [];
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function encodePathSegment(value) {
  if (!value) return "";

  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

const rows = await supabaseRequest("blog_articles?deleted_at=is.null&status=eq.published&select=slug,title,excerpt,category,published_at,updated_at,created_at&order=published_at.desc");
const items = rows.map(normalizePost);

const outDir = path.join(process.cwd(), "blog");
const outFile = path.join(outDir, "posts.json");

await mkdir(outDir, { recursive: true });
await writeFile(outFile, JSON.stringify({ items }, null, 2), "utf8");

console.log(`Generated: ${outFile} (${items.length} posts from Supabase)`);

function resolveSiteUrl() {
  const raw = process.env.URL || process.env.SITE_URL || "https://lionhybridtraining.com";
  const fallback = "https://lionhybridtraining.com";

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") {
      return fallback;
    }
    return parsed.origin;
  } catch {
    return fallback;
  }
}

const siteUrl = resolveSiteUrl();
const today = new Date().toISOString().slice(0, 10);

const staticPages = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/onboarding", changefreq: "monthly", priority: "0.7" },
  { path: "/sobre", changefreq: "monthly", priority: "0.7" },
  { path: "/artigo", changefreq: "monthly", priority: "0.6" },
  { path: "/calendario", changefreq: "monthly", priority: "0.6" },
  { path: "/programas", changefreq: "weekly", priority: "0.7" },
  { path: "/blog", changefreq: "weekly", priority: "0.8" },
  { path: "/check-in", changefreq: "weekly", priority: "0.6" },
  { path: "/coach", changefreq: "weekly", priority: "0.6" },
  { path: "/planocorrida", changefreq: "weekly", priority: "0.7" },
  { path: "/termos", changefreq: "yearly", priority: "0.4" },
  { path: "/politica-privacidade", changefreq: "yearly", priority: "0.4" }
];

const staticXml = staticPages
  .map((page) => urlEntry(`${siteUrl}${page.path}`, today, page.changefreq, page.priority))
  .join("\n");

const postsXml = items
  .map((post) => {
    const safeSlug = encodePathSegment(post.slug);
    return urlEntry(`${siteUrl}/blog/${safeSlug}`, post.date || today, "monthly", "0.6");
  })
  .join("\n");

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticXml}\n${postsXml}\n</urlset>\n`;

await writeFile(path.join(process.cwd(), "sitemap.xml"), sitemapXml, "utf8");
console.log(`Updated: sitemap.xml (${items.length} post URLs from Supabase)`);
