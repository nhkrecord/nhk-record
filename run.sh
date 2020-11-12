#!/bin/sh

exec su-exec $UID:$GID node lib/index.js -c /config.json
