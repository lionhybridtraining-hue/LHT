# Gestão de Posts — LHT

Este site está preparado para gerir artigos sem mexer em código, usando Decap CMS (Netlify CMS).
Além disso, durante o build é gerado automaticamente `blog/posts.json` e atualizado o `sitemap.xml` com todos os slugs.

## Abrir painel Admin
- Depois de publicado (GitHub Pages/Netlify), acede a `/admin/` no teu site.
- Faz login (Netlify Identity ou GitHub, conforme configuração).

## Testar login (Netlify)
- Localmente: usa o Netlify CLI para emular o site e abrir o Admin em `http://localhost:8888/admin/`.
- Em produção: garante que **Identity** e **Git Gateway** estão ativos no painel do Netlify (ver `README-DEPLOY.md`).

## Fluxo recomendado
1. Cria o artigo em **Artigos** (collection `posts`):
   - Título, Data, Categoria, Resumo, Conteúdo (Markdown)
   - Guarda e publica.

Durante o build, o script `scripts/generate-posts-json.mjs` percorre `blog/posts/*.md`, extrai o front‑matter e gera automaticamente `blog/posts.json`. O blog consome este ficheiro estático.

## Imagens
- Faz upload em `assets/img/uploads` pelo Admin.
- No Markdown: `![alt](/assets/img/uploads/minha-imagem.jpg)`

## Configuração do backend
- Atualiza `admin/config.yml`:
  - `repo: CHANGE_ME_OWNER/CHANGE_ME_REPO` para o teu repositório.
  - Se usares Netlify, podes mudar `backend.name` para `git-gateway`.

## Servir localmente
Alguns browsers bloqueiam `fetch` em ficheiros locais. Usa um servidor:

```bash
# Netlify (recomendado, inclui emulação)
/opt/buildhome/node-deps/node_modules/.bin/netlify dev

# Node
npx serve .

# Python
python -m http.server 5500
```

Abre `http://localhost:5500/blog`.

Ou usa o Netlify CLI para replicar rewrites e o build:

```bash
npm i -g netlify-cli
netlify dev
node scripts/generate-posts-json.mjs
```

## Dicas
- `slug` = nome do ficheiro sem `.md`.
- `date` no formato `YYYY-MM-DD`.
- O build gera automaticamente `posts.json` a partir dos ficheiros markdown em `blog/posts/`.
- Os artigos são ordenados por data (mais recentes primeiro).

## Troubleshooting rápido
- `blog` sem artigos: verifica o Deploy log por `Gerado: blog/posts.json` e confirma que `/blog/posts.json` devolve JSON (não HTML).
- Ao abrir `/blog/SLUG` aparece 404: confirma que o ficheiro existe em `blog/posts/SLUG.md` e que o rewrite 200 está ativo em `netlify.toml`.
- Scripts desatualizados: hard refresh ou usa "Clear cache and deploy site" em Netlify.
