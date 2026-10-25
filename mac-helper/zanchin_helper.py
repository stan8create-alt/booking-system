#!/usr/bin/env python3
"""Zanchin Hub helper: builds the local project folders on this Mac's drive.

Runs quietly in the background. About once a minute it asks the hub whether any project is
waiting for THIS machine; for each one it creates the same folders the old Project Ops app
made on Zanchin 12, copies the Lightroom template, and tells the hub it's done. If the drive
isn't connected it just waits and tries again. It only ever creates folders: it never
overwrites or deletes anything.

Only the Python 3 standard library is used (nothing to install).

Config: ~/Library/Application Support/Zanchin Hub Helper/config.json
  {"hub_url": "https://...", "token": "<this machine's token>"}
  optional: "volumes_dir" ("/Volumes"), "volume_name_glob" ("Zanchin 12*"),
            "marker" ("0000_DO_NOT_TOUCH"), "poll_seconds" (60)

Run once and exit:  python3 zanchin_helper.py --once
Check this Mac:      python3 zanchin_helper.py --selftest
"""
import glob
import json
import os
import re
import shutil
import ssl
import sys
import time
import urllib.error
import urllib.request

SUPPORT_DIR = os.path.expanduser("~/Library/Application Support/Zanchin Hub Helper")
CONFIG_PATH = os.environ.get("ZANCHIN_HELPER_CONFIG") or os.path.join(SUPPORT_DIR, "config.json")
LOG_PATH = os.environ.get("ZANCHIN_HELPER_LOG") or os.path.expanduser("~/Library/Logs/Zanchin Hub Helper.log")
STATUS_PATH = os.path.join(os.path.dirname(CONFIG_PATH), "status.json")        # read by the menu bar app
TRIGGER_PATH = os.path.join(os.path.dirname(CONFIG_PATH), "check-now")         # the menu bar app creates this for "Check now"

DEFAULTS = {
    "hub_url": "",
    "token": "",
    "volumes_dir": "/Volumes",
    "volume_name_glob": "Zanchin 12*",
    "marker": "0000_DO_NOT_TOUCH",      # system folder that proves it's the right drive
    "poll_seconds": 60,
}
LR_TEMPLATE_BASE = "Zanchin LR Template"
LOCAL_FOLDERS = ["01 Project File", "02 Footage", "03 Audio", "04 GPX", os.path.join("05 Stills", "RAW")]
DELIVERY_FOLDERS = ["Photo Exports", "Project File", "RAW Files", "Video Exports"]
FOLDER_NAME = re.compile(r"\d{4}_[^/\\\x00]+_zanchin")   # e.g. 0712_Woodbridge Nissan_Sales Video_2026-10-22_zanchin


def log(msg):
    line = "{}  {}".format(time.strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line, flush=True)
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


_status = {"state": "starting", "message": "Starting…", "checked_at": 0, "pending": 0, "last_number": None, "last_at": None}


def set_status(state, message, **extra):
    """Writes what the menu bar app shows: state is ok | drive_offline | hub_unreachable | auth_error | error."""
    _status.update(extra)
    _status.update({"state": state, "message": message, "checked_at": time.time()})
    try:
        tmp = STATUS_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(_status, f)
        os.replace(tmp, STATUS_PATH)
    except OSError:
        pass


def load_config():
    cfg = dict(DEFAULTS)
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg.update(json.load(f))
    if not cfg["hub_url"] or not cfg["token"]:
        raise SystemExit("config.json needs hub_url and token")
    cfg["hub_url"] = cfg["hub_url"].rstrip("/")
    return cfg


def find_drive_root(cfg):
    """The drive is recognised by its marker folder, so a remount as "Zanchin 12-1" (or any
    other name) is still found. Name matches are tried first."""
    vdir = cfg["volumes_dir"]
    candidates = sorted(glob.glob(os.path.join(vdir, cfg["volume_name_glob"])))
    try:
        for name in sorted(os.listdir(vdir)):
            path = os.path.join(vdir, name)
            if path not in candidates:
                candidates.append(path)
    except OSError:
        pass
    for path in candidates:
        try:
            if os.path.isdir(os.path.join(path, cfg["marker"])):
                return path
        except OSError:
            continue    # stale mount
    return None


def ssl_context():
    """python.org builds of Python on macOS ship without a certificate list, so use the one macOS
    itself provides when it exists; otherwise fall back to Python's own."""
    system_bundle = "/etc/ssl/cert.pem"
    if os.path.exists(system_bundle):
        return ssl.create_default_context(cafile=system_bundle)
    return ssl.create_default_context()


def api(cfg, payload):
    req = urllib.request.Request(
        cfg["hub_url"] + "/.netlify/functions/ops-helper",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + cfg["token"]},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20, context=ssl_context()) as resp:
        return json.loads(resp.read().decode("utf-8"))


def copy_missing(src, dst):
    """Copy a file or folder, leaving anything that already exists untouched."""
    if os.path.isdir(src):
        os.makedirs(dst, exist_ok=True)
        for name in os.listdir(src):
            copy_missing(os.path.join(src, name), os.path.join(dst, name))
    elif not os.path.exists(dst):
        shutil.copy2(src, dst)


def copy_lightroom_template(cfg, root, stills_dir, base_name):
    template_dir = os.path.join(root, cfg["marker"], "Lightroom Template", LR_TEMPLATE_BASE)
    if not os.path.isdir(template_dir):
        return False
    items = os.listdir(template_dir)
    for item in items:
        new_name = item.replace(LR_TEMPLATE_BASE, base_name, 1) if item.startswith(LR_TEMPLATE_BASE) else item
        copy_missing(os.path.join(template_dir, item), os.path.join(stills_dir, new_name))
    return bool(items)


def build_project(cfg, root, folder):
    """Same layout as the old app. Returns (project_path, lightroom_ok)."""
    if not FOLDER_NAME.fullmatch(folder) or folder in (".", ".."):
        raise ValueError("invalid folder name")
    real_root = os.path.realpath(root)
    project = os.path.realpath(os.path.join(root, folder))
    if os.path.dirname(project) != real_root:
        raise ValueError("folder is outside the drive")
    for sub in LOCAL_FOLDERS:
        os.makedirs(os.path.join(project, sub), exist_ok=True)
    for sub in DELIVERY_FOLDERS:
        os.makedirs(os.path.join(project, folder, sub), exist_ok=True)
    lr_ok = copy_lightroom_template(cfg, root, os.path.join(project, "05 Stills"), folder)
    return project, lr_ok


def run_once(cfg):
    root = find_drive_root(cfg)
    if root is None:
        log("Drive not connected (marker folder {} not found); will keep waiting.".format(cfg["marker"]))
        set_status("drive_offline", "Zanchin 12 is not connected")
        return
    pending = api(cfg, {"action": "pending"}).get("pending", [])
    failed = 0
    for item in pending:
        number, folder = str(item.get("number")), str(item.get("folder"))
        try:
            path, lr_ok = build_project(cfg, root, folder)
        except Exception as e:      # never crash the loop over one project
            log("{}: could not build ({})".format(number, e))
            api(cfg, {"action": "failed", "number": number, "error": str(e)})
            failed += 1
            continue
        log("{}: created {}{}".format(number, path, "" if lr_ok else "  (Lightroom template not found)"))
        api(cfg, {"action": "done", "number": number, "path": path, "lightroom": lr_ok})
        _status.update({"last_number": number, "last_at": time.time()})
    if failed:
        set_status("error", "{} project(s) could not be built; see the log".format(failed), pending=failed)
    else:
        set_status("ok", "Running. Nothing waiting.", pending=0)


def selftest():
    """Checks this Mac end to end without creating a real project. Run:  python3 zanchin_helper.py --selftest"""
    ok = True

    def line(passed, text):
        nonlocal ok
        ok = ok and passed
        print("  [{}] {}".format("OK" if passed else "PROBLEM", text))

    print("Zanchin Hub helper self-check\n")
    try:
        cfg = load_config()
        line(True, "Config found, hub is {}".format(cfg["hub_url"]))
    except (OSError, ValueError, SystemExit) as e:
        line(False, "Config problem at {} ({})".format(CONFIG_PATH, e))
        return False
    try:
        res = api(cfg, {"action": "pending"})
        n = len(res.get("pending", []))
        line(True, "Hub accepted this Mac as '{}' ({} project(s) waiting for it)".format(res.get("machine"), n))
    except urllib.error.HTTPError as e:
        line(False, "Hub refused this Mac (HTTP {}). {}".format(e.code, "The token is wrong or not on the hub yet." if e.code == 401 else ""))
    except Exception as e:
        line(False, "Can't reach the hub: {}".format(e))
    root = find_drive_root(cfg)
    if root is None:
        line(False, "Drive not found (no volume with a {} folder). Is it connected?".format(cfg["marker"]))
    else:
        line(True, "Drive found: {}".format(root))
        probe = os.path.join(root, ".zanchin-helper-selftest-{}".format(os.getpid()))
        try:
            os.makedirs(os.path.join(probe, "a"))
            os.rmdir(os.path.join(probe, "a"))
            os.rmdir(probe)
            line(True, "Can create folders on the drive (test folder made and removed)")
        except OSError as e:
            line(False, "Can't write to the drive: {}. macOS may need permission: System Settings > Privacy & Security > Files and Folders / Full Disk Access.".format(e))
        template = os.path.join(root, cfg["marker"], "Lightroom Template", LR_TEMPLATE_BASE)
        if os.path.isdir(template) and os.listdir(template):
            line(True, "Lightroom template found ({} items)".format(len(os.listdir(template))))
        else:
            line(False, "Lightroom template missing at {}".format(template))
    print("\n" + ("ALL GOOD: this Mac will build the folders for projects created in the hub." if ok else "Something needs fixing (see PROBLEM above)."))
    return ok


def main():
    if "--selftest" in sys.argv:
        sys.exit(0 if selftest() else 1)
    cfg = load_config()
    once = "--once" in sys.argv
    log("Helper started ({}).".format("single run" if once else "polling every {}s".format(cfg["poll_seconds"])))
    try:    # remember the last project built across restarts
        with open(STATUS_PATH, encoding="utf-8") as f:
            old = json.load(f)
        _status.update({k: old.get(k) for k in ("last_number", "last_at")})
    except (OSError, ValueError):
        pass
    while True:
        try:
            run_once(cfg)
        except urllib.error.HTTPError as e:
            log("Hub said {} {}".format(e.code, "(check the token)" if e.code == 401 else ""))
            set_status("auth_error" if e.code == 401 else "hub_unreachable",
                       "The hub rejected this Mac's token" if e.code == 401 else "The hub returned an error ({})".format(e.code))
        except Exception as e:
            log("Could not reach the hub: {}".format(e))
            set_status("hub_unreachable", "Can't reach the hub (internet?)")
        if once:
            return
        # wait for the next poll, but wake early if the menu bar app asks for "Check now"
        waited = 0
        limit = max(15, int(cfg["poll_seconds"]))
        while waited < limit and not os.path.exists(TRIGGER_PATH):
            time.sleep(1)
            waited += 1
        try:
            os.remove(TRIGGER_PATH)
        except OSError:
            pass


if __name__ == "__main__":
    main()
