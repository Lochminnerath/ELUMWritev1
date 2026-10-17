#!/usr/bin/env sh
# Runs each *.test.sql on its own throwaway database with every migration applied.
# Needs psql and a server you can create databases on (PGHOST, PGUSER and so on).
set -eu
cd "$(dirname "$0")"
for test in *.test.sql; do
  DB="elum_write_test_$$"
  createdb "$DB"
  trap 'dropdb --if-exists "$DB" 2>/dev/null' EXIT
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase-stub.sql >/dev/null 2>&1
  for migration in ../migrations/*.sql; do
    psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$migration"
  done
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f helpers.sql
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null -f "$test"
  dropdb "$DB"
done
