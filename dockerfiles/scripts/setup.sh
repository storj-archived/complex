#!/usr/bin/env bash

mkdir /etc/storj

./dockerfiles/scripts/template_parse.sh ./dockerfiles/templates/landlord.json.tmpl /etc/storj/landlord.json storjlandlord

exec $@
