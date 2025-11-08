#!/bin/bash

# This script creates local.properties for Android release signing.

echo "Creating local.properties for Android release signing..."

# Check if required environment variables are set
if [ -z "$MYAPP_RELEASE_KEY_ALIAS" ]; then
  echo "Error: MYAPP_RELEASE_KEY_ALIAS environment variable is not set."
  exit 1
fi

if [ -z "$MYAPP_RELEASE_STORE_PASSWORD" ]; then
  echo "Error: MYAPP_RELEASE_STORE_PASSWORD environment variable is not set."
  exit 1
fi

if [ -z "$MYAPP_RELEASE_KEY_PASSWORD" ]; then
  echo "Error: MYAPP_RELEASE_KEY_PASSWORD environment variable is not set."
  exit 1
fi

# Define the content for local.properties
CONTENT="MYAPP_RELEASE_STORE_FILE=release.keystore
MYAPP_RELEASE_KEY_ALIAS=$MYAPP_RELEASE_KEY_ALIAS
MYAPP_RELEASE_STORE_PASSWORD=$MYAPP_RELEASE_STORE_PASSWORD
MYAPP_RELEASE_KEY_PASSWORD=$MYAPP_RELEASE_KEY_PASSWORD"

# Create the file in the android directory
echo "$CONTENT" > client/android/local.properties

echo "local.properties created successfully for Android release signing."

