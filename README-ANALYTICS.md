# GA4 Custom Definitions Guide

Property: G-K3EJSN5M4Y

Use GA4 Admin to register these custom definitions so the parameters sent from the site are queryable in Reports and Explore.

## Event-scoped Custom Dimensions
- item_list_id: Section/list identifier (from `section_view`)
- link_url: URL for clicks/outbound
- link_text: Anchor/CTA text
- outbound: Flag for outbound clicks ("true"/"false")
- video_title: Title for video events
- poster: Video poster URL (for errors/context)
- method: Signup/share method (e.g., "WhatsApp", "Instagram")
- content_type: Type of content interacted (e.g., "video_modal", "profile")
- content_name: Content name (e.g., "Newsletter WhatsApp")

## Event-scoped Custom Metrics (Integer)
- percent_scrolled: Scroll depth percent (25/50/75/100)
- video_percent: Video progress percent

## How to Add in GA4
1. Admin → Property → Custom definitions → Create custom dimension/metric.
2. Scope: Event. Parameter name exactly as listed above.
3. For metrics, set Unit = Standard and provide a short description.
4. Save. New definitions populate going forward (no retroactive fill).

## Verification (Debug)
- Open the site, accept consent, and use GA4 DebugView.
- Trigger interactions (CTAs, section scrolls, video open/play/pause/end, socials, outbound links).
- Confirm recommended events (e.g., `generate_lead`, `sign_up`, `begin_checkout`, `select_item`, `click`, `share`, `view_item_list`, `scroll`, `video_start`, `video_progress`, `video_complete`) include the parameters you registered.

## Notes
- Consent gating: Analytics fires only after acceptance per Consent Mode.
- E-commerce params: `items`, `value`, `currency` are sent for `begin_checkout`; use GA’s ecommerce reports if needed.
- Changes affect future data; allow up to 24h for reporting surfaces beyond DebugView.