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
    'subscriptions'
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
DROP POLICY IF EXISTS tenant_self        ON tenants;
DROP POLICY IF EXISTS tenant_self_update ON tenants;
DROP POLICY IF EXISTS system_rw          ON tenants;
CREATE POLICY tenant_self ON tenants FOR SELECT TO mdp_app
  USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
-- A merchant may rename their own shop (Shop details) and every content
-- write bumps context_version (cache-invalidation counter, content.ts
-- bumpContextVersion) - both run on the mdp_app connection, so both need an
-- UPDATE policy here, not just the SELECT one above. Column-level GRANTs
-- below keep this to exactly those two columns: status, plan_id,
-- category_id, published_at and everything else stay admin/system-only.
CREATE POLICY tenant_self_update ON tenants FOR UPDATE TO mdp_app
  USING      (id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY system_rw ON tenants FOR ALL TO mdp_system USING (true) WITH CHECK (true);
GRANT SELECT ON tenants TO mdp_app;
GRANT UPDATE (display_name, context_version) ON tenants TO mdp_app;
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
/* tenant_feature_overrides - an admin-only kill switch. A merchant may read   */
/* its own overrides (to know a feature was disabled on them) but must never  */
/* be able to write one - that would let a merchant undo an admin restriction */
/* with their own connection. Deliberately NOT in the generic tenant-owned    */
/* table loop above, which grants mdp_app full read/write.                    */
/* -------------------------------------------------------------------------- */
ALTER TABLE tenant_feature_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_feature_overrides FORCE  ROW LEVEL SECURITY;
-- This table used to be in the generic tenant-owned loop above (FOR ALL to
-- mdp_app, full read/write). Moving it out of that array does NOT retract
-- what an earlier run of this same script already granted/created - GRANT is
-- additive and a policy a DROP doesn't name is never touched. Both the old
-- policy and the old grants must be undone explicitly, or mdp_app keeps
-- write access forever on any database this ever ran against before.
DROP POLICY IF EXISTS tenant_rw   ON tenant_feature_overrides;
DROP POLICY IF EXISTS tenant_self ON tenant_feature_overrides;
DROP POLICY IF EXISTS system_rw   ON tenant_feature_overrides;
REVOKE INSERT, UPDATE, DELETE ON tenant_feature_overrides FROM mdp_app;
CREATE POLICY tenant_self ON tenant_feature_overrides FOR SELECT TO mdp_app
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY system_rw ON tenant_feature_overrides FOR ALL TO mdp_system USING (true) WITH CHECK (true);
GRANT SELECT ON tenant_feature_overrides TO mdp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_feature_overrides TO mdp_system;

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
GRANT SELECT ON categories, plans, feature_flags, merchant_groups, platform_settings TO mdp_app, mdp_system;
GRANT INSERT, UPDATE, DELETE ON categories, plans, feature_flags, merchant_groups, platform_settings TO mdp_system;

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

/* -------------------------------------------------------------------------- */
/* rate_limit_buckets - protects accounts and SMS spend, system only           */
/* -------------------------------------------------------------------------- */
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_buckets FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_rw ON rate_limit_buckets;
CREATE POLICY system_rw ON rate_limit_buckets FOR ALL TO mdp_system USING (true) WITH CHECK (true);
REVOKE ALL ON rate_limit_buckets FROM mdp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_buckets TO mdp_system;

-- Sequences / schema usage
GRANT USAGE ON SCHEMA public TO mdp_app, mdp_system;
