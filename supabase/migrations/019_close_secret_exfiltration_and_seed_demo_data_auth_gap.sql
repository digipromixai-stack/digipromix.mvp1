-- get_vault_secret / get_app_secret are SECURITY DEFINER functions that return
-- ANY decrypted secret by name with no restriction. Both anon and authenticated
-- roles had EXECUTE (get_app_secret also had a lingering implicit PUBLIC grant),
-- meaning any internet caller with the public anon key could call
-- POST /rest/v1/rpc/get_vault_secret {"secret_name": "gemini_api_key"} (or
-- google_ads_client_secret, google_ads_developer_token, etc.) and receive the
-- raw secret back. Every legitimate caller in the codebase uses the service-role
-- client, which bypasses grants entirely, so this revoke has zero functional
-- impact on the app and closes a live secret-exfiltration vector.
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_app_secret(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_app_secret(text) FROM PUBLIC;

-- seed_demo_data(p_user_id) never checked that p_user_id matched the caller.
-- It's SECURITY DEFINER and callable by anon/authenticated (the frontend calls it
-- as the logged-in user with their own id), so without this check any caller
-- could pass an arbitrary victim's user_id and inject fake demo competitors/
-- changes/alerts into that account (gated only by "account has zero competitors",
-- so mainly exploitable against brand-new signups). IS DISTINCT FROM correctly
-- rejects anon callers too, since auth.uid() is null for them.
CREATE OR REPLACE FUNCTION public.seed_demo_data(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_notion_id    uuid := gen_random_uuid();
  v_linear_id    uuid := gen_random_uuid();
  v_hubspot_id   uuid := gen_random_uuid();
  v_stripe_id    uuid := gen_random_uuid();

  v_notion_home_id     uuid := gen_random_uuid();
  v_notion_pricing_id  uuid := gen_random_uuid();
  v_notion_lp_id       uuid := gen_random_uuid();

  v_linear_home_id     uuid := gen_random_uuid();
  v_linear_pricing_id  uuid := gen_random_uuid();

  v_hubspot_home_id    uuid := gen_random_uuid();
  v_hubspot_pricing_id uuid := gen_random_uuid();

  v_stripe_home_id     uuid := gen_random_uuid();
  v_stripe_pricing_id  uuid := gen_random_uuid();

  v_c1 uuid := gen_random_uuid();
  v_c2 uuid := gen_random_uuid();
  v_c3 uuid := gen_random_uuid();
  v_c4 uuid := gen_random_uuid();
  v_c5 uuid := gen_random_uuid();
  v_c6 uuid := gen_random_uuid();
  v_c7 uuid := gen_random_uuid();
  v_c8 uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Skip if already has competitors
  IF EXISTS (SELECT 1 FROM public.competitors WHERE user_id = p_user_id LIMIT 1) THEN
    RETURN;
  END IF;

  -- ── Competitors ──────────────────────────────────────────────────────────────
  INSERT INTO public.competitors (id, user_id, name, website_url, industry, crawl_frequency, is_active) VALUES
    (v_notion_id,  p_user_id, 'Notion',   'https://www.notion.so',      'Productivity SaaS',    'daily', true),
    (v_linear_id,  p_user_id, 'Linear',   'https://linear.app',         'Project Management',   'daily', true),
    (v_hubspot_id, p_user_id, 'HubSpot',  'https://www.hubspot.com',    'CRM & Marketing SaaS', 'daily', true),
    (v_stripe_id,  p_user_id, 'Stripe',   'https://stripe.com',         'Payments SaaS',        'hourly', true);

  -- ── Monitored pages ──────────────────────────────────────────────────────────
  INSERT INTO public.monitored_pages (id, competitor_id, user_id, url, page_type, is_active, last_crawled_at) VALUES
    (v_notion_home_id,     v_notion_id,  p_user_id, 'https://www.notion.so',              'home',        true, now() - interval '2 hours'),
    (v_notion_pricing_id,  v_notion_id,  p_user_id, 'https://www.notion.so/pricing',      'pricing',     true, now() - interval '2 hours'),
    (v_notion_lp_id,       v_notion_id,  p_user_id, 'https://www.notion.so/product/ai',   'landing_page',true, now() - interval '3 hours'),
    (v_linear_home_id,     v_linear_id,  p_user_id, 'https://linear.app',                 'home',        true, now() - interval '1 hour'),
    (v_linear_pricing_id,  v_linear_id,  p_user_id, 'https://linear.app/pricing',         'pricing',     true, now() - interval '1 hour'),
    (v_hubspot_home_id,    v_hubspot_id, p_user_id, 'https://www.hubspot.com',             'home',        true, now() - interval '4 hours'),
    (v_hubspot_pricing_id, v_hubspot_id, p_user_id, 'https://www.hubspot.com/pricing',    'pricing',     true, now() - interval '4 hours'),
    (v_stripe_home_id,     v_stripe_id,  p_user_id, 'https://stripe.com',                 'home',        true, now() - interval '20 minutes'),
    (v_stripe_pricing_id,  v_stripe_id,  p_user_id, 'https://stripe.com/pricing',         'pricing',     true, now() - interval '20 minutes');

  -- ── Detected changes (realistic, recent) ─────────────────────────────────────
  INSERT INTO public.detected_changes
    (id, monitored_page_id, competitor_id, user_id, change_type, severity, title, description, detected_at, is_read)
  VALUES
    (v_c1, v_stripe_pricing_id, v_stripe_id,  p_user_id,
     'promotion',      'high',
     'Promotion detected on stripe.com',
     'New promotional content found: "40% off annual plans", "limited time offer", "save $"',
     now() - interval '25 minutes', false),

    (v_c2, v_linear_pricing_id, v_linear_id,  p_user_id,
     'price_change',   'high',
     'Price change detected on linear.app',
     'Prices changed: $8/mo → $10/mo on the Plus plan. New Business tier introduced at $16/mo.',
     now() - interval '3 hours', false),

    (v_c3, v_notion_lp_id, v_notion_id, p_user_id,
     'new_landing_page','medium',
     'New landing page on notion.so',
     'New campaign page detected: https://www.notion.so/product/ai — Notion AI push targeting enterprise.',
     now() - interval '6 hours', false),

    (v_c4, v_hubspot_home_id, v_hubspot_id, p_user_id,
     'banner_change',  'medium',
     'Banner/hero section changed on hubspot.com',
     'New promotional banner appeared in the hero offering free CRM data migration for Q2.',
     now() - interval '9 hours', false),

    (v_c5, v_notion_pricing_id, v_notion_id, p_user_id,
     'promotion',      'high',
     'Promotion detected on notion.so',
     'New promotional content found: "free trial extended", "50% off for startups", "exclusive offer"',
     now() - interval '1 day', true),

    (v_c6, v_linear_home_id, v_linear_id, p_user_id,
     'new_landing_page','medium',
     'New landing page on linear.app',
     'New campaign page detected: https://linear.app/lp/enterprise — targeting large engineering orgs.',
     now() - interval '2 days', true),

    (v_c7, v_hubspot_home_id, v_hubspot_id, p_user_id,
     'new_blog_post',  'medium',
     'New blog post on hubspot.com',
     'New blog content linked: https://blog.hubspot.com/marketing/ai-crm-tools-2024',
     now() - interval '3 days', true),

    (v_c8, v_stripe_home_id, v_stripe_id, p_user_id,
     'content_change', 'low',
     'Content updated on stripe.com',
     'Homepage messaging updated (~140 words difference). New testimonials section and updated headline copy.',
     now() - interval '5 days', true);

  -- ── Dashboard alerts for the 4 unread changes ────────────────────────────────
  INSERT INTO public.alerts (user_id, change_id, channel, status) VALUES
    (p_user_id, v_c1, 'dashboard', 'pending'),
    (p_user_id, v_c2, 'dashboard', 'pending'),
    (p_user_id, v_c3, 'dashboard', 'pending'),
    (p_user_id, v_c4, 'dashboard', 'pending');

  -- ── Alert preferences (all change types on by default) ───────────────────────
  INSERT INTO public.alert_preferences (user_id, email_alerts, dashboard_alerts, alert_on)
  VALUES (p_user_id, true, true,
    ARRAY['promotion','price_change','new_landing_page','banner_change','new_blog_post','content_change'])
  ON CONFLICT (user_id) DO NOTHING;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.seed_demo_data(uuid) FROM anon;
