# Gestão de Posts — LHT

## Fonte de verdade
O blog usa **Supabase** como fonte de verdade única na tabela `blog_articles`.

- Frontend público: `/.netlify/functions/blog-articles`
- Editor: `admin/index.html` (CRUD autenticado)
- Build: `scripts/generate-posts-json.mjs` lê artigos **published** do Supabase e gera `blog/posts.json` + `sitemap.xml`

## Fluxo editorial recomendado
1. Abre `/admin/` e gere artigos no editor interno.
2. Usa `draft` para revisão e `published` para publicação.
3. Faz deploy normal; o build gera `blog/posts.json` e `sitemap.xml` a partir do Supabase.

## Variáveis obrigatórias para build
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Sem estas variáveis, `scripts/generate-posts-json.mjs` termina com erro para evitar builds com dados inconsistentes.

## Estado do Decap CMS
`admin/config.yml` está em modo legado para evitar duplo fluxo editorial.

## Ficheiros Markdown (arquivo)
`blog/archive/*.md` — arquivo histórico dos artigos originais. Já não são fonte ativa do blog.

Uso:
- referência/historial
- recuperação/migração pontual via scripts (`migrate-posts-to-db`, `import-historical-posts-from-git`)

## Operação local
```bash
npm i
netlify dev
node scripts/generate-posts-json.mjs
```

## Troubleshooting rápido
- Blog sem artigos: valida se há artigos `published` no Supabase.
- Build falha com erro de variáveis: define `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
- `/blog/posts.json` desatualizado: confirma logs do build e faz hard refresh.
