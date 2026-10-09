"""
=============================================================================
CAMERA & SENSOR TELEMETRY MOCK FEEDER (CCTV / YOLOv11 / IoT Integration)
Simulates an Edge AI Computer Vision pipeline detecting mixed traffic
and streaming real-time sensor frames into the Traffic AI Control Platform.
=============================================================================
"""

import urllib.request
import json
import time
import random
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

SERVER_URL = "http://127.0.0.1:5000/api/sensor/telemetry"
APPROACHES = ["North", "South", "East", "West"]

def run_camera_feed(interval=3.0, iterations=10):
    print("=" * 70)
    print("[VISION FEED] STARTING CCTV / YOLO SENSOR STREAM SIMULATOR")
    print(f"[TARGET API] Streaming detection frames to {SERVER_URL}")
    print("=" * 70)

    count = 0
    try:
        while iterations is None or count < iterations:
            count += 1
            app = random.choice(APPROACHES)
            
            # Generate realistic mixed-traffic batch
            payload = {
                "approach": app,
                "detected_vehicles": {
                    "twowheeler": random.randint(1, 4),
                    "car": random.randint(1, 3),
                    "auto": random.randint(0, 2),
                    "bus": 1 if random.random() < 0.25 else 0
                },
                "detected_pedestrians": random.randint(0, 6)
            }

            req = urllib.request.Request(
                SERVER_URL,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )

            with urllib.request.urlopen(req) as resp:
                res_data = json.loads(resp.read().decode('utf-8'))
                total_v = sum(payload["detected_vehicles"].values())
                peds = payload["detected_pedestrians"]
                print(f"[FRAME #{count:03d}] {app} Camera: Ingested {total_v} mixed vehicles, {peds} pedestrians -> Status: {res_data.get('status')}")

            time.sleep(interval)
            
    except KeyboardInterrupt:
        print("\n[VISION FEED] Camera feed stopped by user.")

    print("=" * 70)
    print(f"[VISION FEED] Completed {count} camera frames.")
    print("=" * 70)

if __name__ == "__main__":
    run_camera_feed(interval=2.0, iterations=5)
