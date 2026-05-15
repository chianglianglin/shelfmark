import json
import os
import pathlib
import tempfile

CONFIG_PATH = str(pathlib.Path(__file__).parent / "settings.json")

def load_settings() -> dict:
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {"vault_path": ""}

def save_settings(data: dict):
    dir_ = os.path.dirname(CONFIG_PATH) or "."
    with tempfile.NamedTemporaryFile("w", dir=dir_, delete=False, suffix=".tmp", encoding="utf-8") as tmp:
        json.dump(data, tmp, indent=2)
        tmp_path = tmp.name
    os.replace(tmp_path, CONFIG_PATH)
