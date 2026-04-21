#!/bin/bash
# Creates a Multi-Output Device: MacBook Air Speakers + BlackHole 2ch
# Run once after installing BlackHole and rebooting.

PLIST="$HOME/Library/Audio/AudioMIDISetup/AMSUserDevices.plist"
mkdir -p "$(dirname "$PLIST")"

# Check BlackHole is present
if ! system_profiler SPAudioDataType 2>/dev/null | grep -q "BlackHole 2ch"; then
    echo "BlackHole 2ch not found. Please reboot first."
    exit 1
fi

python3 - <<'PYEOF'
import subprocess, os, plistlib, uuid
from pathlib import Path

plist_path = Path(os.path.expanduser("~/Library/Audio/AudioMIDISetup/AMSUserDevices.plist"))
plist_path.parent.mkdir(parents=True, exist_ok=True)

existing = []
if plist_path.exists():
    with open(plist_path, 'rb') as f:
        data = plistlib.load(f)
        existing = data if isinstance(data, list) else []

# Remove old Therapy Multi-Output if present
existing = [d for d in existing if d.get('name') != 'Therapy Multi-Output']

multi_out = {
    'IOObject': 0,
    'classUID': 'AMAMultiOutputDevice',
    'name': 'Therapy Multi-Output',
    'subDevices': [
        {'UID': 'BuiltInSpeakerDevice', 'enabled': True, 'master': True},
        {'UID': 'BlackHoleUID', 'enabled': True, 'master': False},
    ],
    'uid': str(uuid.uuid4()).upper()
}
existing.append(multi_out)

with open(plist_path, 'wb') as f:
    plistlib.dump(existing, f, fmt=plistlib.FMT_XML)
print("Written to", plist_path)
PYEOF

# Restart CoreAudio to pick up changes
sudo killall coreaudiod 2>/dev/null || true
echo "Done. Set 'Therapy Multi-Output' as your Zoom speaker output."
echo "Then open Therapy Assistant and select 'BlackHole 2ch' as system audio source."
