# Admin: Funil Leads e Retencao

Atualizado: 2026-04-07

Este documento explica como usar o fluxo de administracao que cobre autenticacao admin, o separador Funil Leads e o dashboard de retencao na aba Operacoes.

## Objetivo

Este fluxo serve para:

- entrar no admin com conta autorizada
- manter a sessao ativa entre refreshes normais
- consultar e atualizar leads no funil central
- acompanhar login e retencao de atletas na aba Operacoes

## Acesso ao admin

URL local:

- `http://localhost:8888/admin`

Comportamento esperado:

1. Ao abrir a pagina, aparece `A verificar sessao...` enquanto a sessao Supabase e validada.
2. Se existir uma sessao valida com permissao de admin, o painel abre sem pedir novo login.
3. Se nao existir sessao, aparece o cartao `Login obrigatorio`.
4. O login e feito por Google OAuth.

Notas:

- Refresh da pagina nao deve obrigar a novo login.
- Se a conta estiver autenticada mas nao tiver role `admin`, o painel continua bloqueado.

## Como iniciar sessao

1. Abrir `/admin`.
2. Clicar em `Entrar no admin` ou no botao `Entrar` no topo.
3. Concluir o login Google.
4. Depois do redirect, o admin volta a abrir na mesma area sempre que possivel.

## Como terminar sessao

1. Clicar em `Sair` no topo.
2. A sessao local e limpa.
3. A pagina volta ao estado bloqueado.

## Funil Leads

Separador:

- `Funil Leads`

O que mostra:

- contagem total de leads
- contagem por etapa do funil
- tabela com fonte, nome, email, telefone, etapa, estado, ultima atividade e data de criacao
- filtros por fonte, estado, periodo e pesquisa

Etapas suportadas:

- `Landing`
- `Landing enviada`
- `Meta recebida`
- `Onboarding enviado`
- `Plano gerado`
- `App instalada`
- `Aplicacao coach`
- `Qualificada`
- `Convertida`
- `Desqualificada`

Fontes suportadas:

- `planocorrida_landing`
- `planocorrida_form`
- `planocorrida_generated`
- `meta_ads`
- `stripe`
- `coach_landing`
- `onboarding`
- `manual`

Como usar:

1. Abrir o separador `Funil Leads`.
2. Ajustar filtros se necessario.
3. Clicar em `Atualizar` para recarregar os dados.
4. Editar `Etapa` e `Estado` diretamente na linha quando necessario.
5. Clicar em `Guardar` na linha para persistir a alteracao.

Comportamento esperado:

- ao entrar na tab, os dados devem carregar automaticamente
- o topo mostra `Leads no funil: X.`
- as contagens por etapa devem acompanhar o estado atual dos registos

## Operacoes: dashboard de retencao

Separador:

- `Operacoes`

O que mostra:

- total de eventos de login
- atletas ativos nos ultimos 7 dias
- atletas ativos nos ultimos 30 dias
- atletas com login registado
- leads marcadas como `app_installed`
- tabela com logins recentes

Como usar:

1. Abrir o separador `Operacoes`.
2. Esperar o carregamento automatico do dashboard.
3. Usar o botao de refresh da seccao quando quiseres atualizar manualmente.
4. Ler a tabela de recentes para cruzar utilizador, ultimo login, contagem de logins, etapa do funil e ultima atividade.

## Como os dados entram no sistema

### Funil central

O funil central e atualizado por varios eventos do produto:

- submissao de landing
- onboarding
- geracao de plano
- compra Stripe
- marcacao de instalacao da app
- atualizacoes manuais no admin

### Retencao

O dashboard de retencao depende de:

- `athletes.last_login_at`
- tabela `login_events`
- endpoint `record-login`

Quando um atleta autenticado entra na app, o frontend envia um evento de login e o backend:

- atualiza `last_login_at`
- grava um registo em `login_events`
- atualiza a lead central com atividade recente quando aplicavel

## Checklist rapido de validacao

Usa esta sequencia quando quiseres confirmar que tudo esta operacional:

1. Abrir `/admin` com sessao existente.
2. Confirmar que a pagina sai de `A verificar sessao...` e entra no painel sem novo login.
3. Fazer refresh da pagina.
4. Confirmar que a sessao se mantem.
5. Abrir `Funil Leads` e validar que a lista carrega.
6. Abrir `Operacoes` e validar que os KPIs e a tabela carregam.
7. Fazer login na app de atleta e confirmar que aparecem novos eventos de login no dashboard apos refresh.

## Troubleshooting

### Fica preso em `A verificar sessao...`

Verificar:

- se o script Supabase carregou
- se `/.netlify/functions/public-config` responde corretamente
- se a sessao Supabase existe no browser
- se a conta tem permissao `admin`

### Pede login em todos os refreshes

Verificar:

- se o browser nao esta a limpar storage/cookies automaticamente
- se o redirect OAuth esta a voltar para `/admin`
- se nao existe erro de sessao expirada no backend

### Funil Leads abre mas nao mostra dados

Verificar:

- se o utilizador autenticado tem role `admin`
- se `/.netlify/functions/admin-central-leads` responde com `200`
- se a base de dados ja tem registos em `leads_central`

### Dashboard de retencao nao mostra dados

Verificar:

- se a migration de login tracking foi aplicada
- se a tabela `login_events` existe
- se o campo `athletes.last_login_at` existe
- se `/.netlify/functions/admin-login-retention` responde com `200`

## Ficheiros principais

- `admin/index.html`
- `netlify/functions/admin-central-leads.js`
- `netlify/functions/admin-login-retention.js`
- `netlify/functions/record-login.js`
- `scripts/migration-add-login-tracking.sql`
