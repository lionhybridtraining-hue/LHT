# Stripe — Programas, Checkout e Acesso

O site usa Stripe Checkout para venda de programas. O fluxo completo cobre: listagem pública, autenticação via Supabase, criação de sessão Stripe, confirmação de acesso pós-pagamento e webhook para persistência e rastreio GA4.

## Fluxo de compra

```
programas.html   →  list-programs (GET)            → mostra catálogo
utilizador clica →  create-checkout-session (POST) → Stripe Checkout hosted
Stripe redireciona → /onboarding?session_id=...
onboarding       →  check-access (GET)             → sincroniza sessão + confirma acesso
Stripe webhook   →  stripe-webhook (POST)          → persiste compra + GA4 purchase
```

## Funções Netlify

| Função | Método | Descrição |
|---|---|---|
| `list-programs` | GET | Lista programas ativos (público) |
| `create-checkout-session` | POST | Cria sessão Stripe Checkout (requer auth) |
| `check-access` | GET | Verifica acesso; sincroniza sessão Stripe se `session_id` presente |
| `stripe-webhook` | POST | Recebe eventos Stripe; persiste compra; emite GA4 `purchase` |

## Base de Dados (Supabase)

Antes de usar em produção, corre as migrações no **SQL Editor** do Supabase Dashboard:

1. `scripts/migration-stripe-programs.sql` — adiciona `stripe_product_id`, `stripe_price_id`, `billing_type` à tabela `training_programs`
2. `scripts/migration-stripe-purchases.sql` — cria tabela `stripe_purchases`

## Variáveis de Ambiente (Netlify → Site settings → Environment)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SUPABASE_URL` | ✓ | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | Chave de service role do Supabase |
| `STRIPE_SECRET_KEY` | ✓ | Chave secreta Stripe (`sk_live_...` ou `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | ✓ | Signing secret do webhook Stripe (`whsec_...`) |
| `GA_MEASUREMENT_ID` | opcional | Ex: `G-K3EJSN5M4Y` para rastreio GA4 |
| `GA_API_SECRET` | opcional | Measurement Protocol API secret (GA4) |
| `DEFAULT_ONBOARDING_PROGRAM_ID` | opcional | UUID do programa padrão no onboarding |

## Configuração Stripe

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**
2. URL: `https://<your-site>.netlify.app/.netlify/functions/stripe-webhook`
3. Eventos a selecionar:
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
4. Copia o **Signing secret** (`whsec_...`) → Netlify env `STRIPE_WEBHOOK_SECRET`
5. Para cada programa, no Admin → Programas, preenche `stripe_price_id` (ex: `price_...`)

## Configurar um Programa com Stripe

No Admin (`/admin/`), tab **Programas**:
- Cria ou edita um programa com `status = active`
- Preenche `stripe_price_id` com o ID do Price no Stripe Dashboard
- Define `billing_type`: `one_time` (pagamento único) ou `recurring` (subscrição)

## Por que webhook e não redirect?

- Redirects do browser podem ser revisitados; não provam pagamento.
- O webhook chega do Stripe com assinatura verificada e representa o estado final do pagamento.
- GA4 `purchase` é emitido server-side, independente de consentimento/cookies.

## Teste local

```bash
stripe listen --forward-to http://localhost:8888/.netlify/functions/stripe-webhook
stripe trigger checkout.session.completed
```

Verifica os logs nas Netlify Functions e no GA4 DebugView (adiciona `debug_mode: 1` temporariamente se necessário).
