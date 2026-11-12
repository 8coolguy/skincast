import json
import subprocess
import time

try:
    geometry = subprocess.check_output(["xdotool", "getdisplaygeometry"], text=True).split()
    width, height = map(int, geometry)
    while True:
        lines = subprocess.check_output(["xdotool", "getmouselocation", "--shell"], text=True).splitlines()
        point = dict(line.split("=", 1) for line in lines)
        print(json.dumps({"x": max(-1, min(1, int(point["X"]) / width * 2 - 1)),
                          "y": max(-1, min(1, int(point["Y"]) / height * 2 - 1)),
                          "display": "X11 desktop"}), flush=True)
        time.sleep(1 / 30)
except FileNotFoundError:
    raise SystemExit("Install xdotool and Python 3 for global tracking on X11.")
