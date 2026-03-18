#!/bin/sh
set -e
node dist/scripts/migrate.js
node dist/server.js
