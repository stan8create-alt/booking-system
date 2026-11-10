#!/bin/bash
# Rebuilds zanchin-helper-install.sh (the one-line Mac installer served from the site root) from
# the helper source in this folder. Run this after changing zanchin_helper.py or ZanchinHelperMenu.swift:
#     bash mac-helper/build-installer.sh
set -euo pipefail
cd "$(dirname "$0")"
cat installer/1-head.sh zanchin_helper.py installer/2-mid.sh ZanchinHelperMenu.swift installer/3-tail.sh > ../zanchin-helper-install.sh
bash -n ../zanchin-helper-install.sh
echo "Built zanchin-helper-install.sh"
