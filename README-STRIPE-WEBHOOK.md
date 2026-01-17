# Stripe Webhook → Verified Purchase Tracking

This site uses a Stripe Payment Link for AER. To avoid false positives and ensure every purchase is recorded, use a Stripe webhook that verifies the signature and emits a GA4 `purchase` event via Measurement Protocol.

## Endpoint (Netlify Function)
- Path: `/.netlify/functions/stripe-webhook`
- File: `netlify/functions/stripe-webhook.js`
- Verifies `Stripe-Signature` using your `STRIPE_WEBHOOK_SECRET`
- Handles: `checkout.session.completed`, `payment_intent.succeeded`, `charge.succeeded`
- Sends GA4 `purchase` with `transaction_id`, `value`, `currency`, `items`

## Configure Environment Variables (Netlify → Site settings → Environment)
- `STRIPE_WEBHOOK_SECRET`: From Stripe Dashboard → Webhooks → Signing secret
- `GA_MEASUREMENT_ID`: e.g., `G-K3EJSN5M4Y`
- `GA_API_SECRET`: GA4 Data Stream → Measurement Protocol API secret

## Stripe Setup
1. Stripe Dashboard → Developers → Webhooks → Add endpoint.
2. URL: `https://<your-site>.netlify.app/.netlify/functions/stripe-webhook`
3. Select events:
   - `payment_intent.succeeded`
   - `checkout.session.completed` (if you use Checkout)
   - `charge.succeeded` (optional, belt-and-braces)
4. Reveal `Signing secret` and paste into Netlify env.

## Why webhook over client-side redirect?
- Browser redirects (e.g., to onboarding) can be revisited/bookmarked and don’t prove payment.
- Webhooks originate from Stripe, include verified signatures, and represent finalized payment states.
- GA4 `purchase` is emitted server-side, independent of user consent/state, avoiding missed conversions. If you prefer to respect consent strictly, you can store accept/deny per user and link purchases via user ID; for anonymous links this is typically not available, so server-side purchase is standard.

## Testing
- Use Stripe CLI: `stripe listen --forward-to https://<your-site>.netlify.app/.netlify/functions/stripe-webhook`
- Trigger test events: `stripe trigger payment_intent.succeeded`
- Check Netlify Functions logs and GA4 Debug (Measurement Protocol hits won’t appear in Tag Assistant, but DebugView can show them if you add `debug_mode: 1`).

## Optional: Debug Mode
You can add `params.debug_mode = 1` to the Measurement Protocol payload to make events visible in DebugView more easily; keep it disabled in production.
