#!/bin/sh
# Runs only when the data volume is first created. Creates the database the tests use.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE lab_test"
