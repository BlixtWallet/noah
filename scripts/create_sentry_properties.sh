#!/bin/bash

# This script creates sentry.properties for Android and iOS platforms.

echo "Creating sentry.properties for Android and iOS..."

# Check if SENTRY_AUTH_TOKEN is set
if [ -z "$SENTRY_AUTH_TOKEN" ]; then
  echo "Error: SENTRY_AUTH_TOKEN environment variable is not set."
  exit 1
fi

# Define the content for sentry.properties
CONTENT="auth.token=$SENTRY_AUTH_TOKEN
defaults.org=dunder-rn
defaults.project=react-native
defaults.url=https://sentry.io/"

# Create the file in the android directory
echo "$CONTENT" > android/sentry.properties

# Create the file in the ios directory
echo "$CONTENT" > ios/sentry.properties

echo "sentry.properties created successfully for Android and iOS."