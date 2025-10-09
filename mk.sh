#!/bin/bash
./build-custom-images.sh
./build-image.sh

./instant package destroy -n dhis2-instance

./instant package destroy -n openfn
./instant package destroy -n database-postgres

./instant package init -n database-postgres -d --env-file .env.example
./instant package init -n openfn -d --env-file .env.example

#./instant project up --env-file .env -d
#./instant project down --env-file .env
#./instant project destroy --env-file .env
#./instant project init --env-file .env

# ./instant package destroy -n sftp-storage
# ./instant package init -n sftp-storage -d


./instant package init -n dhis2-instance -d --env-file .env.example

# ./instant package down -n openfn
# ./instant package up -n openfn -d




# ./instant package destroy -n reverse-proxy-nginx
# ./instant package init -n reverse-proxy-nginx

# ./instant package up -n reverse-proxy-nginx -d --env-file .env
# ./instant package down -n reverse-proxy-nginx -d --env-file .env



