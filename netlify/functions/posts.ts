import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type PostMeta = {
  slug: string;
  title?: string;
  date?: string;
  category?: string;
  excerpt?: string;
};

function parseFrontMatter(markdown: string): { meta: Record<string, string>; body: string } {
  const fmMatch = markdown.match(/^---\s*[\s\S]*?\n---\s*\n?/);
  if (!fmMatch) return { meta: {}, body: markdown };

  const fmBlock = fmMatch[0];
  const body = markdown.slice(fmBlock.length);
  const fm = fmBlock.replace(/^---\s*/, "").replace(/\s*---\s*$/, "");

  const meta: Record<string, string> = {};
  for (const line of fm.split(/\n+/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^"|"$/g, "");
    if (key) meta[key] = value;
  }

  return { meta, body };
}

function normalizePost(meta: PostMeta): Required<Pick<PostMeta, "slug" | "title" | "date" | "category" | "excerpt">> {
  return {
    slug: meta.slug,
    title: meta.title || meta.slug,
    date: meta.date || "",
    category: meta.category || "Artigo",
    excerpt: meta.excerpt || "",
  };
}

export default async (_req: Request) => {
  try {
    const postsDir = path.join(process.cwd(), "blog", "posts");
    const entries = await readdir(postsDir, { withFileTypes: true });

    const posts: Array<Required<Pick<PostMeta, "slug" | "title" | "date" | "category" | "excerpt">>> = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".md")) continue;
      const slug = entry.name.replace(/\.md$/, "");

      const fullPath = path.join(postsDir, entry.name);
      const md = await readFile(fullPath, "utf8");
      const { meta } = parseFrontMatter(md);

      posts.push(
        normalizePost({
          slug,
          title: meta.title,
          date: meta.date,
          category: meta.category,
          excerpt: meta.excerpt,
        }),
      );
    }

    posts.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

    return new Response(JSON.stringify({ items: posts }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        items: [],
        error: "Não foi possível gerar a lista de artigos a partir de blog/posts.",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" },
      },
    );
  }
};

export const config = {
  path: "/api/posts",
  preferStatic: true,
};
