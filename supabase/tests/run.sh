#!/usr/bin/env sh
# Runs the migration and the database checks on a throwaway Postgres database.
# Needs psql and a server you can create databases on (PGHOST, PGUSER and so on).
set -eu
cd "$(dirname "$0")"
DB="elum_write_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase-stub.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20261017000000_elum_write.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null -f rls.test.sql
