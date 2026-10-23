#!/bin/bash
# Installs the Zanchin Hub helper on this Mac and makes it start at login.
#   ./install.sh <hub_url> <token> [volumes_dir]
# Example: ./install.sh https://your-site.netlify.app <this machine's token>
# Safe to run again (it updates the config and restarts the helper).
set -euo pipefail

HUB_URL="${1:-}"; TOKEN="${2:-}"; VOLUMES_DIR="${3:-/Volumes}"
if [ -z "$HUB_URL" ] || [ -z "$TOKEN" ]; then
  echo "Usage: ./install.sh <hub_url> <token> [volumes_dir]"; exit 1
fi

SRC="$(cd "$(dirname "$0")" && pwd)/zanchin_helper.py"
SUPPORT="$HOME/Library/Application Support/Zanchin Hub Helper"
LABEL="ca.zanchin.hub-helper"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/Zanchin Hub Helper.log"

PY="$(command -v python3 || true)"
if [ -z "$PY" ] || ! "$PY" -c 'import sys; assert sys.version_info >= (3, 8)' 2>/dev/null; then
  echo "Python 3.8 or newer is needed. Install it from python.org, then run this again."; exit 1
fi

mkdir -p "$SUPPORT" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp "$SRC" "$SUPPORT/zanchin_helper.py"

# config.json holds this machine's secret token, so only this user can read it
"$PY" - "$SUPPORT/config.json" "$HUB_URL" "$TOKEN" "$VOLUMES_DIR" <<'PYEOF'
import json, os, sys
path, hub, token, vols = sys.argv[1:5]
cfg = {"hub_url": hub.rstrip("/"), "token": token}
if vols != "/Volumes":
    cfg["volumes_dir"] = vols
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
os.chmod(path, 0o600)
PYEOF

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$PY</string><string>$SUPPORT/zanchin_helper.py</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>/dev/null</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/Zanchin Hub Helper.errors.log</string>
</dict></plist>
PLISTEOF

# (re)load it for this login session
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>/dev/null || true

echo "Installed. The helper is running and will start at every login."
echo "Log: $LOG   (crashes, if any: Zanchin Hub Helper.errors.log)"
