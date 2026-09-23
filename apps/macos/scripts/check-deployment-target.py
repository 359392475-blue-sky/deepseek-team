"""Validate native desktop payloads against the app's macOS 15 minimum."""
from pathlib import Path
import runpy
import sys

root = Path(__file__).resolve().parents[3]
checks = runpy.run_path(str(root / "scripts/check-macos-deployment-target.py"))
for path, version in checks["validate_deployment_targets"](
    [Path(value) for value in sys.argv[1:]], "macosx_15_0_arm64"
):
    print(f"{path}: macOS {'.'.join(map(str, version))} <= 15.0")
