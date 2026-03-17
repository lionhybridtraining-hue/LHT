import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const POSTS_DIR = path.resolve(process.cwd(), "blog", "posts");

function humanizeSlug(slug) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseFrontMatter(md) {
  const match = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) {
    return { meta: {}, content: md };
  }

  const meta = {};
  const rawMeta = match[1];
  const content = md.slice(match[0].length);

  for (const line of rawMeta.split(/\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    const value = kv[2].trim().replace(/^"|"$/g, "");
    meta[key] = value;
  }

  return { meta, content };
}

async function supabaseRequest(pathAndQuery, method = "GET", body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "resolution=merge-duplicates,return=representation" : "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(payload?.message || `Supabase error ${response.status}`);
  }

  return payload;
}

async function main() {
  const files = await fs.readdir(POSTS_DIR);
  const markdownFiles = files.filter((f) => f.toLowerCase().endsWith(".md"));

  if (!markdownFiles.length) {
    console.log("No markdown posts found.");
    return;
  }

  const existingRows = await supabaseRequest("blog_articles?select=slug");
  const existingSlugs = new Set((existingRows || []).map((row) => row.slug));

  const payload = [];
  for (const fileName of markdownFiles) {
    const fullPath = path.join(POSTS_DIR, fileName);
    const raw = await fs.readFile(fullPath, "utf8");
    const slug = fileName.replace(/\.md$/i, "");
    const { meta, content } = parseFrontMatter(raw);

    const title = meta.title || humanizeSlug(slug);
    const excerpt = meta.excerpt || null;
    const category = meta.category || "Artigo";
    const publishedAt = meta.date ? new Date(meta.date).toISOString() : null;

    payload.push({
      slug,
      title,
      excerpt,
      category,
      content,
      status: "published",
      published_at: publishedAt
    });
  }

  const result = await supabaseRequest("blog_articles?on_conflict=slug", "POST", payload);
  const returnedSlugs = new Set((result || []).map((row) => row.slug));

  let inserted = 0;
  let updated = 0;
  for (const slug of returnedSlugs) {
    if (existingSlugs.has(slug)) {
      updated += 1;
    } else {
      inserted += 1;
    }
  }

  const conflicts = updated;

  console.log(`Processed files: ${markdownFiles.length}`);
  console.log(`Rows returned: ${returnedSlugs.size}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated: ${updated}`);
  console.log(`Conflicts (slug already existed): ${conflicts}`);
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
