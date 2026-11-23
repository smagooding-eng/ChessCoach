"""Rebuild a pasted key's line breaks: python3 pemfix.py < key > fixed (also imported by create_server.py)."""
def pem(text):
    """Rebuild a PEM key whose line breaks were lost or changed (e.g. pasted on a phone)."""
    import re
    t = text.replace("\r", "").strip()
    m = re.search(r"-----BEGIN ([A-Z ]+)-----(.*?)-----END \1-----", t, re.S)
    if not m:
        return t + "\n"
    body = re.sub(r"\s+", "", m.group(2))
    return f"-----BEGIN {m.group(1)}-----\n" + "\n".join(body[i:i + 64] for i in range(0, len(body), 64)) + f"\n-----END {m.group(1)}-----\n"


if __name__ == "__main__":
    import sys
    sys.stdout.write(pem(sys.stdin.read()))
