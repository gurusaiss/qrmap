-- Row-Level Security: layer 2 of the four isolation layers (docs/03 §D).
--
-- TWO application roles, each with its own policies:
--   mdp_app    - serves merchant dashboard and public page requests.
--                Can ONLY ever see rows of the tenant named in app.tenant_id.
--                Has NO grants at all on identity tables.
--   mdp_system - serves authentication, slug resolution, platform admin and
--                background jobs. Sees everything, and is never reachable from
--                a merchant-facing request handler.
--
-- Because the separation is by ROLE (i.e. by connection), a bug in a merchant
-- request handler cannot reach system scope: it is physically on the wrong
-- connection. Neither role has BYPASSRLS.

-- Tenant-owned content. Every one of these tables has a tenant_id column.
CREATE OR REPLACE FUNCTION _tenant_tables() RETURNS text[] AS $$
  SELECT ARRAY[
    'business_profiles', 'business_hours', 'business_holidays', 'media',
    'catalog_groups', 'catalog_items', 'offers', 'qr_codes',
    'analytics_events', 'analytics_daily',
    'ai_configs', 'ai_conversations', 'ai_messages', 'ai_answer_cache',
    'subscriptions', 'tenant_feature_overrides'
  ]
$$ LANGUAGE sql IMMUTABLE;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY _tenant_tables() LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_rw ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS system_rw ON %I', t);

    -- current_setting(..., true) returns NULL when unset, so an unset context
    -- evaluates to false and returns ZERO ROWS. Fail-closed by default.
    -- WITH CHECK is as important as USING: without it a tenant could INSERT a
    -- row owned by another tenant.
    EXECUTE format($p$
      CREATE POLICY tenant_rw ON %I FOR ALL TO mdp_app
        USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY system_rw ON %I FOR ALL TO mdp_system USING (true) WITH CHECK (true)
    $p$, t);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO mdp_app, mdp_system', t);
  END LOOP;
END $$;

/* -------------------------------------------------------------------------- */
/* tenants - the app may read only its own row                                 */
/* -------------------------------------------------------------------------- */
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON tenants;
DROP POLICY IF EXISTS system_rw   ON tenants;
CREATE POLICY tenant_self ON tenants FOR SELECT TO mdp_app
  USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY system_rw ON tenants FOR ALL TO mdp_system USING (true) WITH CHECK (true);
GRANT SELECT ON tenants TO mdp_app;
GRANT SELECT, INSERT, UPDATE ON tenants TO mdp_system;
-- Tenants are soft-deleted only. No DELETE grant to anyone.

/* -------------------------------------------------------------------------- */
/* merchant_slugs - public by design; permanent by force                       */
/* -------------------------------------------------------------------------- */
ALTER TABLE merchant_slugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_slugs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON merchant_slugs;
DROP POLICY IF EXISTS system_rw   ON merchant_slugs;
CREATE POLICY tenant_self ON merchant_slugs FOR SELECT TO mdp_app
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY system_rw ON merchant_slugs FOR ALL TO mdp_system USING (true) WITH CHECK (true);
GRANT SELECT ON merchant_slugs TO mdp_app;
GRANT SELECT, INSERT, UPDATE ON merchant_slugs TO mdp_system;
-- DELETE is granted to nobody, and additionally blocked by a trigger below.

/* -------------------------------------------------------------------------- */
/* memberships                                                                 */
/* -------------------------------------------------------------------------- */
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_rw ON memberships;
DROP POLICY IF EXISTS system_rw ON memberships;
CREATE POLICY tenant_rw ON memberships FOR ALL TO mdp_app
  USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY system_rw ON memberships FOR ALL TO mdp_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO mdp_app, mdp_system;

/* -------------------------------------------------------------------------- */
/* Identity tables - mdp_app gets NO grants whatsoever                         */
/* -------------------------------------------------------------------------- */
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'sessions', 'otp_codes', 'platform_admins'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS system_rw ON %I', t);
    EXECUTE format(
      'CREATE POLICY system_rw ON %I FOR ALL TO mdp_system USING (true) WITH CHECK (true)', t);
    EXECUTE format('REVOKE ALL ON %I FROM mdp_app', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO mdp_system', t);
  END LOOP;
END $$;

/* -------------------------------------------------------------------------- */
/* Reference data - readable by both, writable only by system                  */
/* -------------------------------------------------------------------------- */
GRANT SELECT ON categories, plans, feature_flags, merchant_groups TO mdp_app, mdp_system;
GRANT INSERT, UPDATE, DELETE ON categories, plans, feature_flags, merchant_groups TO mdp_system;

/* -------------------------------------------------------------------------- */
/* audit_logs - append only. No UPDATE or DELETE grant to anyone.              */
/* -------------------------------------------------------------------------- */
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS append_only ON audit_logs;
DROP POLICY IF EXISTS system_read ON audit_logs;
CREATE POLICY append_only ON audit_logs FOR INSERT TO mdp_app, mdp_system WITH CHECK (true);
CREATE POLICY system_read ON audit_logs FOR SELECT TO mdp_system USING (true);
GRANT INSERT ON audit_logs TO mdp_app, mdp_system;
GRANT SELECT ON audit_logs TO mdp_system;

/* -------------------------------------------------------------------------- */
/* outbox - background jobs, system only                                       */
/* -------------------------------------------------------------------------- */
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_rw ON outbox;
CREATE POLICY system_rw ON outbox FOR ALL TO mdp_system USING (true) WITH CHECK (true);
REVOKE ALL ON outbox FROM mdp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON outbox TO mdp_system;

-- Sequences / schema usage
GRANT USAGE ON SCHEMA public TO mdp_app, mdp_system;
