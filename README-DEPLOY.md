# Deploy do Site — LHT

Este guia simplifica o deploy e o uso do Admin (Decap CMS) sem mexer em código.

## Opção recomendada: Netlify
1. Cria conta em https://www.netlify.com/ e clica "New site from Git".
2. Liga o teu repositório GitHub e escolhe a branch `main` (ou `test-cms`).
3. Build:
   - Command: `node scripts/generate-posts-json.mjs` (gera `blog/posts.json` + atualiza `sitemap.xml`).
   - Publish directory: `/` (raiz do repo).
4. Após publicar, ativa Identity (para o Admin):
   - Settings → Identity → Enable Identity.
   - Settings → Identity → Services → Enable Git Gateway.
   - Convida o teu email (Admin → Invite user) e aceita o convite.
5. Abre `https://SEU_SITE/admin/` e faz login.

## GitHub Pages (sem Admin)
- Se preferes GitHub Pages, ativa Pages no repo (Settings → Pages) e serve a branch `main`.
- Nota: Decap CMS precisa de Identity, por isso o painel Admin não grava sem Netlify.

## Verificação pós-deploy
- Blog: `https://SEU_SITE/blog` lista os artigos via `blog/posts.json` (gerado no build).
- Artigo: `https://SEU_SITE/blog/SLUG` mantém a URL limpa e é servido por `artigo.html?post=SLUG` (rewrite 200 em `netlify.toml`).
- Admin: `https://SEU_SITE/admin/` (após Identity + Git Gateway).
 - Rotas: `netlify.toml` faz rewrite 200 de `/blog/:slug` → `/artigo.html?post=:slug`.

## Dicas
- `blog/posts.json` é gerado automaticamente no build a partir dos `.md` em `blog/posts`. Podes continuar a editá-lo via Admin para curadoria, mas o gerador já cria o índice.
- Imagens: upload em `assets/img/uploads` pelo Admin; usa caminho `/assets/img/uploads/ficheiro.jpg` no Markdown.

## Troubleshooting no Netlify (passo a passo)
1) Build log
   - Abre Deploy → Logs e procura:
     - `Gerado: blog/posts.json (N posts)`
     - `Atualizado: sitemap.xml (N URLs de posts)`
   - Se não aparecer, confirma o comando de build em `netlify.toml`.
2) Verifica ficheiros publicados
   - Abre Deploy → "Preview" e navega para `/blog/posts.json` → deve devolver `application/json` com os posts.
   - Se receberes HTML, há um redirect incorreto. Confirma que o fetch usa caminho absoluto `/blog/posts.json`.
3) Rewrites
   - Testa `/blog/SLUG` → deve servir o artigo mantendo a URL (status 200, não 301).
   - Revê `[[redirects]]` em `netlify.toml`.
4) Cache
   - JS tem `Cache-Control: no-cache` em `/assets/js/*`. Faz hard refresh (Ctrl+F5).
   - Se persistir, em Netlify → Deploys → "Clear cache and deploy site".
5) Admin
   - Se não consegues publicar, confirma Identity + Git Gateway, e que o utilizador está convidado/aceite.
6) Local
   - Testa localmente com Netlify CLI:
     ```bash
     npm i -g netlify-cli
     netlify dev
     ```
   - Garante que o script corre:
     ```bash
     node scripts/generate-posts-json.mjs
     ```
   - Abre `http://localhost:8888/blog`.
