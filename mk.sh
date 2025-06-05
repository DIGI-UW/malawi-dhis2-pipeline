
./build-image.sh

#./instant project up --env-file .env -d
#./instant project down --env-file .env
#./instant project destroy --env-file .env
#./instant project init --env-file .env

# ./instant package destroy -n openfn
# ./instant package init -n openfn -d

# ./instant package destroy -n sftp-storage
# ./instant package init -n sftp-storage -d

# ./instant package destroy -n dhis2-instance
# ./instant package destroy -n database-postgres
# ./instant package init -n database-postgres -d

./instant package destroy -n dhis2-instance
./instant package init -n dhis2-instance -d

# ./instant package init -n dhis2-instance -d

#./instant package down -n openfn
#./instant package up -n openfn -d


