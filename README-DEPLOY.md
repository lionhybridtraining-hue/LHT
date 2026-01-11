# Deploy do Site — LHT

Este guia simplifica o deploy e o uso do Admin (Decap CMS) sem mexer em código.

## Opção recomendada: Netlify
1. Cria conta em https://www.netlify.com/ e clica "New site from Git".
2. Liga o teu repositório GitHub e escolhe a branch `main`.
3. Build:
   - Project type: "Static" (não precisas de comando de build).
   - Publish directory: `/` (raiz do repo).
4. Após publicar, ativa Identity:
   - Settings → Identity → Enable Identity.
   - Settings → Identity → Services → Enable Git Gateway.
   - Convida o teu email (Admin → Invite user) e aceita o convite.
   5. Abre `https://SEU_SITE/admin/` e faz login.

## GitHub Pages (sem Admin)
- Se preferes GitHub Pages, ativa Pages no repo (Settings → Pages) e serve a branch `main`.
- Nota: Decap CMS precisa de Identity, por isso o painel Admin não grava sem Netlify.

## Verificação pós-deploy
- Blog: `https://SEU_SITE/blog.html` lista os artigos automaticamente via `/api/posts` (a partir de `blog/posts/*.md`).
- Artigo: `https://SEU_SITE/artigo.html?post=o-que-e-treino-hibrido` rende o conteúdo Markdown.
- Admin: `https://SEU_SITE/admin/` (após Identity + Git Gateway).
- Rotas antigas: `netlify.toml` redireciona `https://SEU_SITE/blog/SLUG` → `https://SEU_SITE/artigo.html?post=SLUG`.

## Dicas
- `blog/posts.json` é opcional: serve para curadoria/ordem na listagem, mas posts publicados aparecem mesmo sem serem adicionados ao JSON.
- Imagens: upload em `assets/img/uploads` pelo Admin; usa caminho `/assets/img/uploads/ficheiro.jpg` no Markdown.

## Problemas comuns
- 404 ao abrir artigo: confirma o ficheiro em `blog/posts/SLUG.md`.
- Lista vazia: confirma que o post foi **publicado** no Admin (Workflow) e que existe um novo deploy; depois verifica `blog/posts/*.md` e/ou `blog/posts.json`.
- Admin sem login: garante Identity + Git Gateway ativos e que aceitaste o convite.
 - Cache desatualizada: `blog/posts.json` tem `Cache-Control: no-cache` via `netlify.toml`. Se ainda não atualiza, força refresh ou limpa cache.
