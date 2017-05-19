#!/bin/bash

PROJECT_NAME=$1
RESOURCE_TYPE=$2
CONTAINER_NAME=$3
CONTAINER=$4

kubectl config set-cluster storj-nonprod
kubectl --namespace storj-staging patch $RESOURCE_TYPE $PROJECT_NAME -p"{\"spec\":{\"template\":{\"spec\":{\"containers\":[{\"name\":\"$CONTAINER_NAME\",\"image\":\"$CONTAINER\"}]}}}}"
