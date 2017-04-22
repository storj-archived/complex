#!/usr/bin/env bash

mkdir /etc/storj
mkdir /etc/storj/keys

# Create the Network Private Extended Key file
echo ${network_private_extended_key_string} > /etc/storj/keys/complex.key
echo ${migration_private_key_string} > /etc/storj/keys/complexMigration.key

# Create a random index for the renter
export storjrenter_opts__networkIndex=${RANDOM}

./dockerfiles/scripts/template_parse.sh ./dockerfiles/templates/renter.conf.tmpl /etc/storj/renter.conf storjrenter

exec $@
