"""Read only REL_X/REL_Y from Linux mouse devices; never grab or inject input."""
import glob
import json
import os
from pathlib import Path
import select
import struct
import subprocess
import time

EVENT = struct.Struct('@llHHi')


def mouse_devices():
    devices = []
    for entry in sorted(glob.glob('/sys/class/input/event*')):
        try:
            # sysfs bitmaps are printed most-significant word first.
            bits = int(''.join(Path(entry, 'device/capabilities/rel').read_text().split()), 16)
            if bits & 3 == 3:
                devices.append('/dev/input/' + Path(entry).name)
        except (OSError, ValueError):
            continue
    selected = os.environ.get('SKINCAST_MOUSE_DEVICE')
    if selected:
        devices = [device for device in devices if device == os.path.realpath(selected)]
    return devices


def deltas(data, dropped=False):
    dx = dy = 0
    for offset in range(0, len(data), EVENT.size):
        _, _, kind, code, value = EVENT.unpack_from(data, offset)
        if kind == 0 and code == 3:  # SYN_DROPPED: discard an incomplete batch.
            dropped = True
            dx = dy = 0
        elif kind == 0 and code == 0:
            dropped = False
        if dropped:
            continue
        if kind == 2 and code == 0:
            dx += value
        elif kind == 2 and code == 1:
            dy += value
    return dx, dy, dropped


def main():
    opened = {}
    dropped = {}
    next_scan = 0
    x = y = 0
    x11 = bool(os.environ.get('DISPLAY')) and not os.environ.get('WAYLAND_DISPLAY')
    while True:
        now = time.monotonic()
        if now >= next_scan:
            devices = mouse_devices()
            for device in list(opened):
                if device not in devices or not os.access(device, os.R_OK):
                    fd = opened.pop(device)
                    os.close(fd)
                    dropped.pop(fd, None)
            for device in devices:
                if device not in opened:
                    try:
                        opened[device] = os.open(device, os.O_RDONLY | os.O_NONBLOCK)
                    except OSError:
                        pass
            next_scan = now + 1
        ready, _, _ = select.select(list(opened.values()), [], [], 1 / 30)
        dx = dy = 0
        for fd in ready:
            try:
                data = os.read(fd, EVENT.size * 4096)
                if not data:
                    raise OSError('Mouse disconnected')
                a, b, dropped[fd] = deltas(data, dropped.get(fd, False))
                dx += a
                dy += b
            except BlockingIOError:
                pass
            except OSError:
                device = next(key for key, value in opened.items() if value == fd)
                os.close(opened.pop(device))
                dropped.pop(fd, None)
        if x11:
            try:
                width, height = map(int, subprocess.check_output(['xdotool', 'getdisplaygeometry'], text=True, timeout=1).split())
                point = dict(line.split('=', 1) for line in subprocess.check_output(['xdotool', 'getmouselocation', '--shell'], text=True, timeout=1).splitlines())
                x = max(-1, min(1, int(point['X']) / width * 2 - 1))
                y = max(-1, min(1, int(point['Y']) / height * 2 - 1))
            except (OSError, ValueError, subprocess.SubprocessError):
                x11 = False
        available = bool(opened)
        message = ('Listening to Linux mouse movement.' if available else
                   'Mouse read access needed. See docs/game-mouse.md for Fedora setup.')
        print(json.dumps(dict(x=x, y=y, dx=dx, dy=dy,
                              display='X11 desktop' if x11 else 'Wayland · Game mouse only',
                              relativeAvailable=available, relativeMessage=message)), flush=True)
        # Limit output even when a high-polling-rate mouse is active.
        time.sleep(max(0, 1 / 30 - (time.monotonic() - now)))


if __name__ == '__main__':
    main()
