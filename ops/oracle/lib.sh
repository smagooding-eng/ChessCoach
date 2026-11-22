# Shared helpers for migrate.sh and refresh-preview.sh (sourced, not run).
# restore_into <db> <dumpfile>: fresh database, restored as the Postgres admin (so extensions
# work), then everything handed to the app's user (it alters its own tables at start-up).
restore_into() {
  local DB=$1 DUMP=$2
  sudo -u postgres psql -q -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB OWNER $DB_USER"
  sudo -u postgres pg_restore --no-owner --no-acl -j 2 -d "$DB" "$DUMP" || echo "(pg_restore reported warnings; check the counts)"
  sudo -u postgres psql -q -d "$DB" -v ON_ERROR_STOP=0 <<SQL
ALTER SCHEMA public OWNER TO $DB_USER;
DO \$\$ DECLARE r record; BEGIN
  FOR r IN SELECT format('ALTER %s %I.%I OWNER TO $DB_USER',
      CASE c.relkind WHEN 'r' THEN 'TABLE' WHEN 'p' THEN 'TABLE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'S' THEN 'SEQUENCE' END,
      n.nspname, c.relname) AS q
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S')
    ORDER BY c.relkind = 'S'
  LOOP BEGIN EXECUTE r.q; EXCEPTION WHEN others THEN NULL; END; END LOOP;
  FOR r IN SELECT format('ALTER TYPE %I.%I OWNER TO $DB_USER', n.nspname, t.typname) AS q
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype IN ('e','d') LOOP
    BEGIN EXECUTE r.q; EXCEPTION WHEN others THEN NULL; END; END LOOP;
  FOR r IN SELECT format('ALTER FUNCTION %s OWNER TO $DB_USER', p.oid::regprocedure) AS q
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') LOOP
    BEGIN EXECUTE r.q; EXCEPTION WHEN others THEN NULL; END; END LOOP;
END \$\$;
SQL
}
