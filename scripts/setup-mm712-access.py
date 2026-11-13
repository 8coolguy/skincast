#!/usr/bin/env python3
"""Install persistent read-only mouse access for the invoking desktop user."""
import os
from pathlib import Path
import subprocess
import tempfile

RULE_PATH = Path('/etc/udev/rules.d/99-skincast-mm712.rules')


def rules(uid):
    return ('# Skincast: read-only motion access for the wired MM712 and wireless dongle.\n'
            '# Only mouse event interfaces are included, not keyboard or hidraw nodes.\n' +
            ''.join(
                'ACTION=="add|change", SUBSYSTEM=="input", KERNEL=="event*", '
                'ENV{ID_INPUT_MOUSE}=="1", ENV{ID_VENDOR_ID}=="2516", '
                f'ENV{{ID_MODEL_ID}}=="{product}", '
                f'RUN+="/usr/bin/setfacl -m u:{uid}:r $env{{DEVNAME}}"\n'
                for product in ('0169', '01b7')))


def main():
    uid = os.environ.get('SUDO_UID', '')
    if os.geteuid() != 0 or not uid.isdecimal() or int(uid) == 0:
        raise SystemExit('Run with sudo from your desktop account: sudo python3 scripts/setup-mm712-access.py')
    content = rules(int(uid))
    # Verify syntax before installing. Keep the rule local to these two devices.
    with tempfile.TemporaryDirectory() as directory:
        candidate = Path(directory, RULE_PATH.name)
        candidate.write_text(content)
        subprocess.run(['/usr/bin/udevadm', 'verify', str(candidate)], check=True)
    RULE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', dir=RULE_PATH.parent, delete=False) as output:
        pending = Path(output.name)
        try:
            output.write(content)
            output.flush()
            os.fchmod(output.fileno(), 0o644)
            os.replace(pending, RULE_PATH)
        finally:
            pending.unlink(missing_ok=True)
    subprocess.run(['/usr/bin/udevadm', 'control', '--reload-rules'], check=True)
    for device in Path('/sys/class/input').glob('event*'):
        result = subprocess.run(['/usr/bin/udevadm', 'info', '--query=property', str(device)],
                                capture_output=True, text=True)
        if result.returncode:
            continue  # A device may disappear while enumerating.
        properties = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
        if (properties.get('ID_INPUT_MOUSE') == '1' and properties.get('ID_VENDOR_ID') == '2516'
                and properties.get('ID_MODEL_ID') in ('0169', '01b7')):
            subprocess.run(['/usr/bin/udevadm', 'trigger', '--action=change', str(device)], check=True)
    subprocess.run(['/usr/bin/udevadm', 'settle'], check=True)
    print(f'Installed {RULE_PATH}. Wired and dongle connections automatically receive read access for UID {uid}.')


if __name__ == '__main__':
    main()
