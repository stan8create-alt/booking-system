ZH_EOF

"$PY" - "$SUPPORT/config.json" "$HUB_URL" "$TOKEN" "$VOLUMES_DIR" <<'PYEOF' || fail "Could not save the settings."
import json, os, sys
path, hub, token, vols = sys.argv[1:5]
try:
    with open(path) as f:
        cfg = json.load(f)          # keep anything already set up on this Mac (hub address, drive name, ...)
    if not isinstance(cfg, dict):
        cfg = {}
except Exception:
    cfg = {}
cfg["token"] = token
if not cfg.get("hub_url"):
    cfg["hub_url"] = hub.rstrip("/")
if vols != "/Volumes":
    cfg["volumes_dir"] = vols
try:
    slow_enough = float(cfg.get("poll_seconds", 0)) >= 300
except (TypeError, ValueError):
    slow_enough = False
if not slow_enough:
    cfg["poll_seconds"] = 600       # asks the hub every 10 minutes (was every minute: it used up Netlify credits)
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

# 4. Start it now and at every login
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" || fail "Could not start the helper."
launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>/dev/null || true

# 5. Menu bar icon (optional; skipped if Apple's developer tools are not installed)
cat > "$SUPPORT/ZanchinHelperMenu.swift" <<'ZH_EOF'
