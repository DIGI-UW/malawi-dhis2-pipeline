#!/bin/bash
set -eu

function create_user_and_database() {
  local database=$1
  local user=$2
  local password=$3
  echo "Creating '$user' user and '$database' database..."
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" $POSTGRES_DB <<-EOSQL
      CREATE USER $user WITH PASSWORD '$password';
      CREATE DATABASE $database;
      GRANT ALL PRIVILEGES ON DATABASE $database TO $user;
EOSQL

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" $database <<-EOSQL
      GRANT ALL ON SCHEMA public TO $user;
      ALTER SCHEMA public OWNER TO $user;
EOSQL
}

create_user_and_database ${OPENFN_POSTGRESQL_DB} ${OPENFN_POSTGRESQL_USERNAME} ${OPENFN_POSTGRESQL_PASSWORD} 