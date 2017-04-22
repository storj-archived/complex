#!/usr/bin/env bash

mkdir /etc/storj

./dockerfiles/scripts/template_parse.sh ./dockerfiles/templates/landlord.conf.tmpl /etc/storj/landlord.conf storjlandlord

exec $@
