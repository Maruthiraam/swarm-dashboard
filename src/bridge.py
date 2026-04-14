import eventlet
eventlet.monkey_patch()

import json, threading, math, time
import paho.mqtt.client as mqtt
from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173"])
sio = SocketIO(app, cors_allowed_origins=["http://localhost:5173"])

# ── Your GPS anchor (from your NEO-6M output) ────────────────
ANCHOR_LAT = 12.999290
ANCHOR_LON = 77.618171
MAP_RANGE_M = 50.0

swarm  = {}
scores = {}
leader = None

mq = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, "bridge")

def gps_to_xy(lat, lon):
    dx = (lon - ANCHOR_LON) * 111320 * math.cos(math.radians(ANCHOR_LAT))
    dy = (lat - ANCHOR_LAT) * 111320
    x  = round(max(5, min(95, 50 + (dx / MAP_RANGE_M) * 50)), 1)
    y  = round(max(5, min(95, 50 - (dy / MAP_RANGE_M) * 50)), 1)
    return x, y

def on_connect(client, userdata, flags, rc):
    print("MQTT connected — rc:" + str(rc))
    client.subscribe("swarm/#")

def on_message(client, userdata, msg):
    global leader, scores
    t = msg.topic
    try:
        data = json.loads(msg.payload)
    except:
        return

    if t == "swarm/announce":
        mac = data.get("mac", "")
        rid = data.get("id", "")
        print(f"Robot announced — MAC:{mac} ID:{rid}")
        sio.emit("robot_announced", {"mac": mac, "robot_id": rid})

    elif "gps" in t:
        rid  = data.get("robot_id", "")
        lat  = data.get("lat", ANCHOR_LAT)
        lon  = data.get("lon", ANCHOR_LON)
        x, y = gps_to_xy(lat, lon)

        # ── Save with last_seen timestamp ─────────────────────
        swarm[rid] = {**data, "x": x, "y": y, "last_seen": time.time()}

        sio.emit("robot_update", {
            "robot_id": rid,
            "x":        x,
            "y":        y,
            "heading":  data.get("course", 0),
            "speed":    round(data.get("speed_kmh", 0) / 3.6, 2),
            "status":   data.get("role", "PEER"),
            "active":   True,            # robot is sending = online
            "battery":  data.get("battery", 100),
            "score":    data.get("score", 0),
            "lat":      lat,
            "lon":      lon,
        })
        print(f"[{rid}] x={x} y={y} lat={lat:.6f} lon={lon:.6f}")

    elif t == "swarm/scores":
        rid   = data.get("robot_id", "")
        score = data.get("score", 0)
        scores[rid] = score
        print(f"Score received: {rid} = {score:.1f}")
        threading.Timer(1.5, declare_winner).start()

def declare_winner():
    global leader, scores
    if not scores: return
    winner = max(scores, key=scores.get)
    leader = winner
    scores = {}
    print(f"LEADER ELECTED: {winner}")
    mq.publish("swarm/leader", json.dumps({"leader_id": winner}))
    sio.emit("leader_elected", {"leader_id": winner})

# ── FIXED: while True loop is reliable for emitting ──────────
def timeout_checker():
    offline_robots = set()
    while True:
        time.sleep(3)
        now = time.time()
        for rid, r in list(swarm.items()):
            last = r.get("last_seen", now)
            seconds_silent = now - last
            if seconds_silent > 5:
                if rid not in offline_robots:
                    offline_robots.add(rid)
                    print(f"[{rid}] OFFLINE — silent for {int(seconds_silent)}s")
                    sio.emit("robot_update", {
                        "robot_id": rid,
                        "x":        r.get("x", 50),
                        "y":        r.get("y", 50),
                        "heading":  0,
                        "speed":    0,
                        "status":   "OFFLINE",
                        "active":   False,
                        "battery":  0,
                        "signal":   0,
                        "lat":      r.get("lat", 0),
                        "lon":      r.get("lon", 0),
                    })
                    global leader
                    if rid == leader:
                        print(f"Leader {rid} went offline — re-electing...")
                        leader = None
                        mq.publish("swarm/elect", json.dumps({"reason": "leader_offline"}))
                        sio.emit("leader_lost", {"reason": "leader offline"})
            else:
                if rid in offline_robots:
                    offline_robots.discard(rid)
                    print(f"[{rid}] BACK ONLINE")

# ── Dashboard → robots ────────────────────────────────────────
@sio.on("start_election")
def handle_election(data=None):
    global scores, leader
    scores = {}
    mq.publish("swarm/elect", json.dumps({"trigger": "dashboard"}))
    sio.emit("election_started", {})
    print("Election triggered")

@sio.on("end_leader_mode")
def handle_end_leader(data=None):
    global leader
    leader = None
    mq.publish("swarm/leader", json.dumps({"leader_id": "none"}))
    sio.emit("leader_cleared", {})
    print("Peer mode restored")

@sio.on("send_command")
def handle_cmd(data):
    rid = data.get("robot_id", "all")
    if rid == "all":
        mq.publish("swarm/cmd/all", json.dumps(data))
    else:
        mq.publish(f"swarm/robot/{rid}/cmd", json.dumps(data))
    print(f"Command sent: {data}")

def mqtt_thread():
    mq.on_connect = on_connect
    mq.on_message = on_message
    mq.connect("127.0.0.1", 1883)
    mq.loop_forever()

if __name__ == "__main__":
    threading.Thread(target=mqtt_thread, daemon=True).start()
    threading.Thread(target=timeout_checker, daemon=True).start()
    print("Bridge running → http://localhost:5000")
    sio.run(app, host="0.0.0.0", port=5000)
