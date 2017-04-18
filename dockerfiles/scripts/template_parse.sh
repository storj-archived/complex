#!/bin/bash

TEMPLATE_IN_FILE=$1
TEMPLATE_OUT_FILE=$2
ENV_VAR_PREFIX=$3
PREFIX_REGEX="${ENV_VAR_PREFIX}_(.*)="
KEY_REGEX="(${ENV_VAR_PREFIX}_.*)="

echo "Template in: $TEMPLATE_IN_FILE  Template out: $TEMPLATE_OUT_FILE  Var prefix: $ENV_VAR_PREFIX"

# Copy template file to desired destination
cp ${TEMPLATE_IN_FILE} ${TEMPLATE_OUT_FILE}

# Get all environment variables with the specified prefix and
# iterate through the env vars we found and replace any instances
# of them in the config file with their values
for ENV_ENTRY in $(env); do
  # echo "Checking entry ${ENV_ENTRY}"

  if [[ $ENV_ENTRY =~ $PREFIX_REGEX ]]; then
    echo "Key ${ENV_ENTRY} is a match"

    # Get the key minus the prefix
    ENV_SUB_KEY="${BASH_REMATCH[1]}"

    # Get the key including the prefix
    [[ $ENV_ENTRY =~ $KEY_REGEX ]]
    ENV_KEY=${BASH_REMATCH[1]}

    # Use the key to get the value
    ENV_VAL="${!ENV_KEY}"

    echo "ENV_KEY is: ${ENV_KEY}"
    echo "SUB_KEY is: ${ENV_SUB_KEY} and ENV_VAL is: ${ENV_VAL}"

    # Sanatize the replacement value for sed
    SAN_ENV_VAL=$(echo $ENV_VAL | sed -e 's/[\/&]/\\&/g')

    echo "SAN_ENV_VAL is: ${SAN_ENV_VAL}"

    # Replace all instances of the subkey with the value
    sed -i "s/{{ ${ENV_SUB_KEY} }}/${SAN_ENV_VAL}/g" ${TEMPLATE_OUT_FILE}
  fi
done

# Clean any remaining template variables out of the template and try to guess
# if it should be a blank string, numeric value, or false
sed -i 's/"{{ .* }}"/""/g' ${TEMPLATE_OUT_FILE}
sed -i "s/{{ .* }}/false/g" ${TEMPLATE_OUT_FILE}
