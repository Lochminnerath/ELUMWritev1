#!/usr/bin/env sh
# Runs the app's SupabaseApi against Postgres with the migration applied, behind PostgREST.
# Needs psql (with rights to create databases) and the `postgrest` binary in PATH.
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="elum_write_it_$$"
PORT="${PGRST_PORT:-3399}"
SECRET="integration-test-secret-integration-test-secret"
createdb "$DB"
cleanup() { [ -n "${PGRST_PID:-}" ] && kill "$PGRST_PID" 2>/dev/null; dropdb --if-exists "$DB"; }
trap cleanup EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/tests/supabase-stub.sql" -f "$ROOT/supabase/migrations/20261017000000_elum_write.sql" >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'olu@example.org', '{"name": "Olu Owner"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'vee@example.org', '{"name": "Vee Viewer"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'cam@example.org', '{"name": "Cam Commenter"}'),
  ('00000000-0000-0000-0000-0000000000a4', 'eda@example.org', '{"name": "Eda Editor"}'),
  ('00000000-0000-0000-0000-0000000000a5', 'stan@example.org', '{"name": "Stan Stranger"}');
SQL
PGRST_DB_URI="postgres://authenticator:authenticator@${PGHOST:-localhost}:${PGPORT:-5432}/$DB" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" PGRST_SERVER_PORT="$PORT" \
  postgrest >/dev/null 2>&1 &
PGRST_PID=$!
for _ in $(seq 1 50); do curl -s "http://localhost:$PORT/" >/dev/null && break; sleep 0.2; done
cd "$ROOT"
ELUM_IT_POSTGREST_URL="http://localhost:$PORT" ELUM_IT_JWT_SECRET="$SECRET" npx vitest run src/api/supabase
