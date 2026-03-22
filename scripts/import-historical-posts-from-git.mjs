import { execFileSync } from "node:child_process";
import process from "node:process";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const targets = process.argv.slice(2);

if (!targets.length) {
  console.error("Usage: node scripts/import-historical-posts-from-git.mjs <slug> [slug...]");
  process.exit(1);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function parseFrontMatter(md) {
  const match = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) {
    return { meta: {}, content: md };
  }

  const meta = {};
  for (const line of match[1].split(/\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!kv) continue;
    meta[kv[1].trim()] = kv[2].trim().replace(/^"|"$/g, "");
  }

  return {
    meta,
    content: md.slice(match[0].length)
  };
}

function humanizeSlug(slug) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPathForSlug(slug) {
  return `blog/posts/${slug}.md`;
}

function getAddCommitForPath(filePath) {
  const output = git(["log", "--all", "--diff-filter=A", "--format=%H", "--", filePath]).trim();
  if (!output) {
    throw new Error(`No add commit found for ${filePath}`);
  }
  return output.split(/\r?\n/)[0];
}

async function upsertDrafts(payload) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/blog_articles?on_conflict=slug`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : [];

  if (!response.ok) {
    throw new Error(body?.message || `Supabase error ${response.status}`);
  }

  return body;
}

async function main() {
  const payload = targets.map((slug) => {
    const filePath = getPathForSlug(slug);
    const commit = getAddCommitForPath(filePath);
    const raw = git(["show", `${commit}:${filePath}`]);
    const { meta, content } = parseFrontMatter(raw);

    return {
      slug,
      title: meta.title || humanizeSlug(slug),
      excerpt: meta.excerpt || null,
      category: meta.category || "Artigo",
      content,
      status: "draft",
      published_at: meta.date ? new Date(meta.date).toISOString() : null,
      deleted_at: null
    };
  });

  const rows = await upsertDrafts(payload);
  console.log(`Draft upserted: ${rows.length}`);
  for (const row of rows) {
    console.log(`${row.slug} => ${row.status}`);
  }
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
