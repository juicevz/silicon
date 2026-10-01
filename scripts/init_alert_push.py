"""Create a persistent VAPID identity without printing private key material."""
import argparse
import base64
import os
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization


def initialize(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    key_path = root / "vapid.pem"
    if key_path.exists():
        key = serialization.load_pem_private_key(key_path.read_bytes(), password=None)
    else:
        key = ec.generate_private_key(ec.SECP256R1())
        raw = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        descriptor = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as file:
            file.write(raw)
    public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    encoded = base64.urlsafe_b64encode(public).decode().rstrip("=")
    env = root / "alerts.env"
    descriptor = os.open(env, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as file:
        file.write(f"ALERTS_VAPID_PUBLIC_KEY={encoded}\nALERTS_VAPID_PRIVATE_KEY_PATH={key_path.resolve()}\n")
    print("Push identity ready. Private key preserved outside the repository; alerts.env contains its path and the public key.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True, type=Path)
    initialize(parser.parse_args().directory)
