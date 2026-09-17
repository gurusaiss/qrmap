-- Applied BEFORE schema migrations: tables use uuidv7() as a column default.

-- Time-ordered UUIDs: index locality of a sequence without leaking row counts.
-- (Postgres 18 ships uuidv7() natively; this is the portable equivalent.)
CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms = substring(int8send((extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3);
  uuid_bytes = unix_ts_ms || gen_random_bytes(10);
  -- version 7
  uuid_bytes = set_byte(uuid_bytes, 6, (b'0111' || get_byte(uuid_bytes, 6)::bit(4))::bit(8)::int);
  -- variant 10xx
  uuid_bytes = set_byte(uuid_bytes, 8, (b'10'   || get_byte(uuid_bytes, 8)::bit(6))::bit(8)::int);
  RETURN encode(uuid_bytes, 'hex')::uuid;
END
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Guards the permanence invariant: a slug is never deleted, therefore never
-- freed for reuse. Reusing a slug would point an already-printed QR code at a
-- different business - the worst failure this system can produce.
CREATE OR REPLACE FUNCTION forbid_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'rows in % are permanent and cannot be deleted', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$ LANGUAGE plpgsql;
