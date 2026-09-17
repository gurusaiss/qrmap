-- Triggers and CHECK constraints that Drizzle does not model.

-- Permanence: slugs and tenants are never hard-deleted.
DROP TRIGGER IF EXISTS merchant_slugs_no_delete ON merchant_slugs;
CREATE TRIGGER merchant_slugs_no_delete
  BEFORE DELETE ON merchant_slugs
  FOR EACH ROW EXECUTE FUNCTION forbid_delete();

DROP TRIGGER IF EXISTS tenants_no_delete ON tenants;
CREATE TRIGGER tenants_no_delete
  BEFORE DELETE ON tenants
  FOR EACH ROW EXECUTE FUNCTION forbid_delete();

DROP TRIGGER IF EXISTS audit_logs_no_change ON audit_logs;
CREATE TRIGGER audit_logs_no_change
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_delete();

-- updated_at maintenance
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attname = 'updated_at'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t);
  END LOOP;
END $$;

-- Domain integrity
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_price_range_ck;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_price_range_ck
  CHECK (price_max_minor IS NULL OR price_minor IS NULL OR price_max_minor >= price_minor);

ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_price_sign_ck;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_price_sign_ck
  CHECK (price_minor IS NULL OR price_minor >= 0);

ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_duration_ck;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_duration_ck
  CHECK (duration_minutes IS NULL OR kind = 'service');

ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_window_ck;
ALTER TABLE offers ADD CONSTRAINT offers_window_ck
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at);

ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_percent_ck;
ALTER TABLE offers ADD CONSTRAINT offers_percent_ck
  CHECK (discount_percent IS NULL OR (discount_percent > 0 AND discount_percent <= 100));

ALTER TABLE business_hours DROP CONSTRAINT IF EXISTS business_hours_dow_ck;
ALTER TABLE business_hours ADD CONSTRAINT business_hours_dow_ck
  CHECK (day_of_week BETWEEN 0 AND 6);

ALTER TABLE business_hours DROP CONSTRAINT IF EXISTS business_hours_times_ck;
ALTER TABLE business_hours ADD CONSTRAINT business_hours_times_ck
  CHECK (is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL));

-- A slug must be URL-safe and short enough to keep the QR module count low.
ALTER TABLE merchant_slugs DROP CONSTRAINT IF EXISTS merchant_slugs_format_ck;
ALTER TABLE merchant_slugs ADD CONSTRAINT merchant_slugs_format_ck
  CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');

-- A user must be reachable by at least one identifier.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_identifier_ck;
ALTER TABLE users ADD CONSTRAINT users_identifier_ck
  CHECK (phone IS NOT NULL OR email IS NOT NULL);
