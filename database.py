import sqlite3
import json
import os
from datetime import datetime, timedelta
import random

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "traffic_system.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Approaches table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS approaches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        density REAL DEFAULT 0.0,
        vehicle_count INTEGER DEFAULT 0,
        queue_length INTEGER DEFAULT 0,
        wait_time REAL DEFAULT 0.0,
        signal_state TEXT DEFAULT 'RED',
        signal_timer INTEGER DEFAULT 0,
        free_left_state TEXT DEFAULT 'ACTIVE',
        pedestrian_count INTEGER DEFAULT 0,
        pedestrian_state TEXT DEFAULT 'WAITING',
        pcu_load REAL DEFAULT 0.0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Vehicle history
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS vehicle_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approach TEXT,
        vehicle_type TEXT,
        pcu_weight REAL,
        wait_time REAL,
        lane INTEGER,
        is_emergency INTEGER DEFAULT 0
    )
    """)

    # Pedestrian history
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pedestrian_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approach TEXT,
        crowd_count INTEGER,
        crossing_time REAL,
        safety_state TEXT
    )
    """)

    # Traffic snapshots (for time-series charts)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS traffic_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_vehicles INTEGER,
        total_pedestrians INTEGER,
        avg_wait_time REAL,
        avg_queue REAL,
        safety_score REAL,
        efficiency_score REAL,
        congestion_index REAL,
        mode TEXT
    )
    """)

    # AI Decisions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        decision_type TEXT,
        approach TEXT,
        reason TEXT,
        parameters_json TEXT,
        action_taken TEXT
    )
    """)

    # Scheduled Events
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        location TEXT NOT NULL,
        expected_crowd INTEGER DEFAULT 0,
        expected_vehicles INTEGER DEFAULT 0,
        active_mode TEXT DEFAULT 'FESTIVAL',
        status TEXT DEFAULT 'SCHEDULED',
        notes TEXT
    )
    """)

    # Emergency events log
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS emergency_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        vehicle_type TEXT,
        approach TEXT,
        transit_time REAL,
        clearance_strategy TEXT,
        conflict_resolution TEXT
    )
    """)

    # System Settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT
    )
    """)

    conn.commit()

    # Initialize default settings if missing
    default_settings = [
        ("pcu_twowheeler", "0.5", "PCU weight for motorcycles and scooters"),
        ("pcu_car", "1.0", "PCU weight for standard cars and sedans"),
        ("pcu_auto", "1.0", "PCU weight for 3-wheeler auto-rickshaws"),
        ("pcu_bus", "3.0", "PCU weight for public transport buses"),
        ("pcu_truck", "3.0", "PCU weight for commercial freight trucks"),
        ("min_green_time", "15", "Minimum adaptive green duration in seconds"),
        ("max_green_time", "75", "Maximum adaptive green duration in seconds"),
        ("yellow_time", "3", "Standard yellow transition duration in seconds"),
        ("starvation_threshold", "75", "Maximum wait time before starvation priority triggers"),
        ("free_left_ped_conflict_threshold", "3", "Pedestrian count that forces free-left to BLOCKED"),
        ("camera_ai_confidence_threshold", "85", "Minimum detection confidence percentage"),
        ("emergency_clearance_buffer", "5", "Safe pedestrian clearance seconds during emergency priority")
    ]

    for key, val, desc in default_settings:
        cursor.execute("INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)", (key, val, desc))

    # Initialize 4 approaches
    for app in ["North", "South", "East", "West"]:
        cursor.execute("""
        INSERT OR IGNORE INTO approaches (id, name, density, vehicle_count, queue_length, wait_time, signal_state, signal_timer, free_left_state, pedestrian_count, pedestrian_state, pcu_load)
        VALUES (?, ?, 25.0, 8, 4, 18.0, 'RED', 0, 'ACTIVE', 5, 'WAITING', 12.0)
        """, (app, app))

    conn.commit()

    # Seed events if empty
    cursor.execute("SELECT COUNT(*) as count FROM events")
    if cursor.fetchone()["count"] == 0:
        seed_events(cursor)

    # Seed historical snapshots for charts if empty
    cursor.execute("SELECT COUNT(*) as count FROM traffic_snapshots")
    if cursor.fetchone()["count"] == 0:
        seed_historical_snapshots(cursor)

    conn.commit()
    conn.close()

def seed_events(cursor):
    events_data = [
        ("Ganesh Visarjan Grand Procession", "Festival", "2026-10-12", "16:00", "23:00", "Central Temple Junction", 4500, 1800, "FESTIVAL", "Heavy pedestrian crowding, route diversions active"),
        ("Navratri Garba Celebration Surge", "Religious", "2026-10-14", "19:00", "01:30", "Community Ground Crossing", 3200, 1400, "RELIGIOUS", "Continuous pedestrian crossings in evening hours"),
        ("Diwali Bazaar & Shopping Rush", "Market", "2026-10-20", "11:00", "22:00", "Old City Commercial Hub", 2800, 2200, "FESTIVAL", "High auto-rickshaw and two-wheeler mixed traffic"),
        ("Cricket Championship Finals", "Stadium", "2026-10-18", "17:30", "23:30", "City Stadium Boulevard", 5500, 3100, "PUBLIC_EVENT", "Sudden synchronized exit wave at 23:00"),
        ("St. Mary's School Closing Bell", "School", "2026-10-09", "14:15", "15:45", "North School Corridor", 850, 420, "PEAK_HOUR", "High school bus and pedestrian child density"),
        ("Weekly Sunday Organic Market", "Market", "2026-10-11", "07:30", "13:00", "West Market Plaza", 1900, 650, "WEEKEND", "Slow moving mixed pedestrians and cycle rickshaws")
    ]
    for ev in events_data:
        cursor.execute("""
        INSERT INTO events (name, event_type, date, start_time, end_time, location, expected_crowd, expected_vehicles, active_mode, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, ev)

def seed_historical_snapshots(cursor):
    # Seed 24 hours of realistic data comparing normal weekday vs festival evening
    now = datetime.now()
    for i in range(24, 0, -1):
        snap_time = now - timedelta(hours=i)
        is_peak = (8 <= snap_time.hour <= 11) or (17 <= snap_time.hour <= 21)
        
        base_veh = random.randint(140, 220) if is_peak else random.randint(50, 110)
        base_ped = random.randint(40, 95) if is_peak else random.randint(15, 35)
        avg_wait = random.uniform(32.0, 48.0) if is_peak else random.uniform(18.0, 28.0)
        avg_queue = random.uniform(10.0, 18.0) if is_peak else random.uniform(3.0, 7.0)
        safety = random.uniform(88.0, 96.0)
        efficiency = random.uniform(84.0, 93.0)
        congestion = random.uniform(55.0, 75.0) if is_peak else random.uniform(20.0, 40.0)
        mode = "PEAK_HOUR" if is_peak else "NORMAL"

        cursor.execute("""
        INSERT INTO traffic_snapshots (timestamp, total_vehicles, total_pedestrians, avg_wait_time, avg_queue, safety_score, efficiency_score, congestion_index, mode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (snap_time.strftime("%Y-%m-%d %H:%M:%S"), base_veh, base_ped, avg_wait, avg_queue, safety, efficiency, congestion, mode))

    # Also log a few initial AI decisions
    sample_decisions = [
        ("SIGNAL_EXTEND", "East", "East traffic density reached 88% with 24 queued vehicles", '{"density": 88, "queue": 24, "wait": 68}', "Extended East GREEN by +20 seconds"),
        ("FREE_LEFT_BLOCKED", "North", "Pedestrian crowd of 22 crossing north slip-lane zebra", '{"pedestrians": 22, "conflict_zone": true}', "North Free-Left switch to BLOCKED (Red)"),
        ("PEDESTRIAN_PRIORITY", "All", "Religious gathering exit detected; 84 pedestrians waiting", '{"pedestrians": 84, "mode": "RELIGIOUS"}', "Activated All-Red Pedestrian Scramble Phase for 50s"),
        ("EMERGENCY_CORRIDOR", "South", "Ambulance detected on South approach (ETA 12s)", '{"vehicle": "Ambulance", "distance_m": 85}', "Preempted signals: South GREEN Corridor + Pedestrian clearance broadcast")
    ]
    for d in sample_decisions:
        cursor.execute("""
        INSERT INTO ai_decisions (decision_type, approach, reason, parameters_json, action_taken)
        VALUES (?, ?, ?, ?, ?)
        """, d)

def log_ai_decision(decision_type, approach, reason, parameters, action_taken):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO ai_decisions (decision_type, approach, reason, parameters_json, action_taken)
    VALUES (?, ?, ?, ?, ?)
    """, (decision_type, approach, reason, json.dumps(parameters), action_taken))
    conn.commit()
    conn.close()

def log_traffic_snapshot(total_vehicles, total_pedestrians, avg_wait, avg_queue, safety_score, efficiency_score, congestion_index, mode):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO traffic_snapshots (total_vehicles, total_pedestrians, avg_wait_time, avg_queue, safety_score, efficiency_score, congestion_index, mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (total_vehicles, total_pedestrians, avg_wait, avg_queue, safety_score, efficiency_score, congestion_index, mode))
    conn.commit()
    conn.close()

def get_recent_decisions(limit=15):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ai_decisions ORDER BY id DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    decisions = [dict(row) for row in rows]
    conn.close()
    return decisions

def get_recent_snapshots(limit=24):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM traffic_snapshots ORDER BY id DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    snaps = [dict(row) for row in rows]
    snaps.reverse() # chronological
    conn.close()
    return snaps

def get_all_events():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM events ORDER BY date ASC, start_time ASC")
    rows = cursor.fetchall()
    events = [dict(row) for row in rows]
    conn.close()
    return events

def create_event(data):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO events (name, event_type, date, start_time, end_time, location, expected_crowd, expected_vehicles, active_mode, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get("name"),
        data.get("event_type", "Festival"),
        data.get("date"),
        data.get("start_time"),
        data.get("end_time"),
        data.get("location"),
        int(data.get("expected_crowd", 500)),
        int(data.get("expected_vehicles", 200)),
        data.get("active_mode", "FESTIVAL"),
        data.get("notes", "")
    ))
    conn.commit()
    event_id = cursor.lastrowid
    conn.close()
    return event_id

def delete_event_by_id(event_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()

def get_all_settings():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM system_settings")
    rows = cursor.fetchall()
    settings = {row["key"]: {"value": row["value"], "description": row["description"]} for row in rows}
    conn.close()
    return settings

def update_system_setting(key, value):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE system_settings SET value = ? WHERE key = ?", (str(value), key))
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
