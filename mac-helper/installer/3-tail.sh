ZH_EOF
MENU_LABEL="ca.zanchin.hub-helper-menu"
MENU_PLIST="$HOME/Library/LaunchAgents/$MENU_LABEL.plist"
if xcode-select -p >/dev/null 2>&1 && command -v swiftc >/dev/null 2>&1 \
   && swiftc -O -swift-version 5 "$SUPPORT/ZanchinHelperMenu.swift" -o "$SUPPORT/ZanchinHelperMenu" 2>"$SUPPORT/menu-build.log"; then
  cat > "$MENU_PLIST" <<MENUEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$MENU_LABEL</string>
  <key>ProgramArguments</key><array><string>$SUPPORT/ZanchinHelperMenu</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Interactive</string>
</dict></plist>
MENUEOF
  launchctl bootout "gui/$(id -u)/$MENU_LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$MENU_PLIST" 2>/dev/null || true
  launchctl kickstart -k "gui/$(id -u)/$MENU_LABEL" 2>/dev/null || true
fi

# 6. Check everything and tell the user in plain words
sleep 2
CHECK="$("$PY" "$SUPPORT/zanchin_helper.py" --selftest 2>&1 || true)"
echo "$CHECK"
if echo "$CHECK" | grep -q "Can't reach the hub"; then
  say "The helper is installed, but it cannot reach the hub. Check the internet connection. If this keeps happening, the token may be wrong: ask Stan for a new one.

$CHECK"
elif echo "$CHECK" | grep -qi "token\|unauthor\|401"; then
  say "The helper is installed, but the hub did not accept the token. Ask Stan to double-check it.

$CHECK"
elif echo "$CHECK" | grep -q "Drive not found"; then
  say "DONE. The helper is installed and talking to the hub.

One thing left: plug in the Zanchin 12 drive. The helper will build the project folders by itself once it is connected."
elif echo "$CHECK" | grep -q "PROBLEM"; then
  say "The helper is installed, but something still needs fixing:

$CHECK"
else
  say "ALL DONE. The helper is installed and working. It starts by itself every time you log in. You can close this window."
fi
exit 0
