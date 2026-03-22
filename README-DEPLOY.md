# Deploy do Site — LHT

Este guia simplifica o deploy com o blog em modo **Supabase-first**.

## Opção recomendada: Netlify
1. Cria conta em https://www.netlify.com/ e clica "New site from Git".
2. Liga o teu repositório GitHub e escolhe a branch `main` (ou `test-cms`).
3. Build:
   - Command: `npm run build` (inclui `generate-posts-json` + `build-planocorrida`).
   - Publish directory: `/` (raiz do repo).
4. Define variáveis de ambiente do site:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Após publicar, ativa Identity (para o Admin):
   - Settings → Identity → Enable Identity.
   - Settings → Identity → Services → Enable Git Gateway.
   - Convida o teu email (Admin → Invite user) e aceita o convite.
6. Abre `https://SEU_SITE/admin/` e faz login.

## GitHub Pages (sem Admin)
- Se preferes GitHub Pages, ativa Pages no repo (Settings → Pages) e serve a branch `main`.
- Nota: o editor oficial é o `admin/index.html` (Supabase). O Decap está legado.

## Verificação pós-deploy
- Blog: `https://SEU_SITE/blog` lista artigos publicados via função `blog-articles`.
- Artigo: `https://SEU_SITE/blog/SLUG` mantém a URL limpa e é servido por `artigo.html?post=SLUG` (rewrite 200 em `netlify.toml`).
- Admin: `https://SEU_SITE/admin/` (CRUD de artigos no Supabase).
 - Rotas: `netlify.toml` faz rewrite 200 de `/blog/:slug` → `/artigo.html?post=:slug`.

## Dicas
- `blog/posts.json` é gerado automaticamente no build a partir dos artigos `published` no Supabase.
- Imagens: upload em `assets/img/uploads` pelo Admin; usa caminho `/assets/img/uploads/ficheiro.jpg` no Markdown.

## Troubleshooting no Netlify (passo a passo)
1) Build log
   - Abre Deploy → Logs e procura:
       - `Generated: ... posts from Supabase`
       - `Updated: sitemap.xml ... from Supabase`
   - Se não aparecer, confirma o comando de build em `netlify.toml`.
2) Verifica ficheiros publicados
   - Abre Deploy → "Preview" e navega para `/blog/posts.json` → deve devolver `application/json` com os posts `published`.
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
    - Garante que o script corre (com variáveis Supabase definidas):
     ```bash
     node scripts/generate-posts-json.mjs
     ```
   - Abre `http://localhost:8888/blog`.
