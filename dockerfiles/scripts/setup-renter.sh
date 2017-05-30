#!/usr/bin/env bash

mkdir /etc/storj
mkdir /etc/storj/keys

# Create the Network Private Extended Key file
echo ${network_private_extended_key_string} > /etc/storj/keys/complex.key
echo ${migration_private_key_string} > /etc/storj/keys/complexMigration.key

# Create a random index for the renter
HOSTNAME=$(hostname)
regex="renter-([0-9]*)"
if [[ $HOSTNAME =~ $regex ]]; then
  HOST_NUMBER=${BASH_REMATCH[1]}
  NETWORK_INDEX=$((HOST_NUMBER+1))
  echo "Found network index '${NETWORK_INDEX}' from hostname"
else
  NETWORK_INDEX=${RANDOM}
  echo "Unable to get network index from hostname, using random '${NETWORK_INDEX}'"
fi
export storjrenter_opts__networkIndex=${NETWORK_INDEX}

./dockerfiles/scripts/template_parse.sh ./dockerfiles/templates/renter.conf.tmpl /etc/storj/renter.conf storjrenter

exec $@
