FROM postgres:15

COPY create-openfn-db.sh /docker-entrypoint-initdb.d/create-openfn-db.sh

RUN chmod +x /docker-entrypoint-initdb.d/create-openfn-db.sh

