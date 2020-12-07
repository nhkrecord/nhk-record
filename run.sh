#!/bin/sh

exec su-exec $UID:$GID node lib/src/index.js -c /config.json
