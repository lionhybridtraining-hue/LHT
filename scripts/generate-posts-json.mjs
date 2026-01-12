import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function parseFrontMatter(markdown) {
  const fmMatch = markdown.match(/^---\s*[\s\S]*?\n---\s*\n?/);
  if (!fmMatch) return { meta: {}, body: markdown };

  const fmBlock = fmMatch[0];
  const body = markdown.slice(fmBlock.length);
  const fm = fmBlock.replace(/^---\s*/, "").replace(/\s*---\s*$/, "");

  const meta = {};
  for (const line of fm.split(/\n+/)) {
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
one: try { await readdir(postsDir); } catch {}
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
