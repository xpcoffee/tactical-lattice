#!/bin/sh
set -e

# Start a virtual display with access control disabled (-ac) so any process
# (including Electron subprocesses spawned by Playwright) can connect without
# needing an Xauth cookie.
Xvfb :99 -screen 0 1280x800x24 -ac &
export DISPLAY=:99

# Wait until the display is ready
until xdpyinfo -display :99 >/dev/null 2>&1; do sleep 0.1; done

exec "$@"
