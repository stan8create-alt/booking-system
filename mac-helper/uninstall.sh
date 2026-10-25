#!/bin/bash
# Stops the Zanchin Hub helper and removes its autostart. Leaves any folders it already made untouched.
LABEL="ca.zanchin.hub-helper"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/ca.zanchin.hub-helper-menu" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/ca.zanchin.hub-helper-menu.plist"
echo "Stopped and removed the autostart."
echo "Kept (delete by hand if you like): ~/Library/Application Support/Zanchin Hub Helper and ~/Library/Logs/Zanchin Hub Helper.log"
