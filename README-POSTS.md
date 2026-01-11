# Gestão de Posts — LHT

Este site está preparado para gerir artigos sem mexer em código, usando Decap CMS (Netlify CMS).

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

A lista do blog é gerada automaticamente a partir dos ficheiros em `blog/posts/*.md` via `/api/posts` (Netlify Function). Opcionalmente, a coleção **Lista de Artigos** (collection `posts_index`, ficheiro `blog/posts.json`) serve para:
- definir ordem/curadoria,
- ajustar título/data/categoria/resumo para a listagem,
- e ainda assim mostrar posts novos mesmo que não estejam no JSON.

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

Abre `http://localhost:5500/blog.html`.

## Dicas
- `slug` = nome do ficheiro sem `.md`.
- `date` no formato `YYYY-MM-DD`.
- Mantém `posts.json` alinhado com os `.md` para aparecer na lista.
