import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function parseFrontMatter(markdown) {
  // Strip potential UTF-8 BOM and support both LF/CRLF newlines
  const src = markdown.replace(/^\uFEFF/, "");
  const fmMatch = src.match(/^---\s*[\s\S]*?\r?\n---\s*\r?\n?/);
  if (!fmMatch) return { meta: {}, body: markdown };

  const fmBlock = fmMatch[0];
  const body = src.slice(fmBlock.length);
  const fm = fmBlock.replace(/^---\s*/, "").replace(/\s*---\s*$/, "");

  const meta = {};
  const cleanFm = fm.replace(/\r\n/g, "\n");
  for (const line of cleanFm.split(/\n+/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^"|"$/g, "");
    if (key) meta[key] = value;
  }
  return { meta, body };
}

function normalizePost({ slug, title, date, category, excerpt }) {
  return {
    slug,
    title: title || slug,
    date: date || "",
    category: category || "Artigo",
    excerpt: excerpt || "",
  };
}

const postsDir = path.join(process.cwd(), "blog", "posts");
const outDir = path.join(process.cwd(), "blog");
const outFile = path.join(outDir, "posts.json");

const entries = await readdir(postsDir, { withFileTypes: true });
const items = [];

for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
  const slug = entry.name.replace(/\.md$/, "");
  const md = await readFile(path.join(postsDir, entry.name), "utf8");
  const { meta } = parseFrontMatter(md);

  items.push(
    normalizePost({
      slug,
      title: meta.title,
      date: meta.date,
      category: meta.category,
      excerpt: meta.excerpt,
    })
  );
}

items.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

await mkdir(outDir, { recursive: true });
await writeFile(outFile, JSON.stringify({ items }, null, 2), "utf8");

console.log(`✅ Gerado: ${outFile} (${items.length} posts)`);

// ==== Sitemap generation ====
const siteUrl = process.env.URL || "https://lionhybridtraining.com";
const today = new Date().toISOString().slice(0, 10);

function urlEntry(loc, lastmod, changefreq, priority){
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

const staticPages = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/onboarding", changefreq: "monthly", priority: "0.7" },
  { path: "/sobre", changefreq: "monthly", priority: "0.7" },
  { path: "/blog", changefreq: "weekly", priority: "0.8" },
  { path: "/termos", changefreq: "yearly", priority: "0.4" },
  { path: "/politica-privacidade", changefreq: "yearly", priority: "0.4" },
];

const staticXml = staticPages
  .map(p => urlEntry(`${siteUrl}${p.path}`, today, p.changefreq, p.priority))
  .join("\n");

const postsXml = items
  .map(p => urlEntry(`${siteUrl}/blog/${p.slug}`, p.date || today, "monthly", "0.6"))
  .join("\n");

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticXml}\n${postsXml}\n</urlset>\n`;

await writeFile(path.join(process.cwd(), "sitemap.xml"), sitemapXml, "utf8");
console.log(`✅ Atualizado: sitemap.xml (${items.length} URLs de posts)`);
