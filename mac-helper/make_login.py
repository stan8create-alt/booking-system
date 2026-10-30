#!/usr/bin/env python3
"""Makes Andrew's Zanchin Hub login. Type a password when asked; this prints ONE line to send to Stan.
The line contains only a scrambled version of the password (a hash), so it is safe to send by text or
email, and nobody can turn it back into the password. Uses only Python 3's standard library."""
import getpass
import hashlib
import json
import os
import sys

USERNAME, NAME, ROLE, EMAIL = "andrew", "Andrew", "admin", "andrewkotovych@gmail.com"

pw = getpass.getpass("Choose your Zanchin Hub password (at least 12 characters): ")
if len(pw) < 12:
    sys.exit("That is too short. Run this again and use at least 12 characters.")
if getpass.getpass("Type it again to confirm: ") != pw:
    sys.exit("The two passwords did not match. Run this again.")

salt = os.urandom(16)
key = hashlib.scrypt(pw.encode("utf-8"), salt=salt, n=16384, r=8, p=1, dklen=64)
entry = {"username": USERNAME, "name": NAME, "role": ROLE, "email": EMAIL,
         "hash": "scrypt$16384${}${}".format(salt.hex(), key.hex())}
print("\nDone. Send Stan this whole line (it is safe to send):\n")
print(json.dumps(entry, separators=(",", ":")))
print("\nRemember your password. Stan never sees it and can't recover it.")
