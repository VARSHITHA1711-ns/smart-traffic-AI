import random
import time
from datetime import datetime
from ai_engine import AIEngine
from prediction_engine import PredictionEngine
import database

VEHICLE_SPECS = {
    "twowheeler": {"length": 2.0, "pcu": 0.5, "speed": 9.0, "color": "#06b6d4"},
    "car": {"length": 4.5, "pcu": 1.0, "speed": 8.0, "color": "#3b82f6"},
    "auto": {"length": 3.0, "pcu": 1.0, "speed": 7.0, "color": "#eab308"},
    "bus": {"length": 11.0, "pcu": 3.0, "speed": 5.5, "color": "#8b5cf6"},
    "truck": {"length": 12.0, "pcu": 3.0, "speed": 5.0, "color": "#f97316"},
    "ambulance": {"length": 5.5, "pcu": 1.5, "speed": 11.0, "color": "#ef4444", "emergency": True},
    "fire_engine": {"length": 9.5, "pcu": 2.5, "speed": 10.0, "color": "#dc2626", "emergency": True}
}

APPROACH_NAMES = ["North", "South", "East", "West"]

class SimulationState:
    def __init__(self):
        self.ai_engine = AIEngine()
        self.prediction_engine = PredictionEngine()
        
        self.current_mode = "NORMAL"
        self.ai_adaptive_enabled = True
        self.free_left_smart_enabled = True
        self.simulation_speed = 1.0
        
        self.active_approach = "North"
        self.active_signal_phase = "GREEN"  # "GREEN", "YELLOW", "ALL_RED"
        self.phase_remaining = 25  # seconds remaining in current phase
        
        self.pedestrian_phase_active = False
        self.pedestrian_phase_timer = 0
        
        self.emergency_state = None  # None or {approach, type, status, clearance_countdown}
        self.last_decision = None
        self.advisor_messages = []
        
        # Approaches state
        self.approaches = {}
        for app in APPROACH_NAMES:
            self.approaches[app] = {
                "name": app,
                "vehicles": [],
                "free_left_vehicles": [],
                "signal_state": "RED",
                "free_left_state": "ACTIVE",
                "free_left_reason": "Clear passage",
                "pedestrians_waiting": 4,
                "pedestrians_crossing": 0,
                "pedestrian_timer": 0,
                "pedestrian_total_duration": 20,
                "wait_time": 10.0,
                "queue_length": 2,
                "vehicle_count": 4,
                "density_pct": 22.0,
                "density_level": "LOW",
                "density_badge": "🟢 LOW",
                "density_color": "#10b981",
                "pcu_load": 4.5,
                "vehicle_breakdown": {
                    "twowheeler": 2,
                    "car": 1,
                    "auto": 1,
                    "bus": 0,
                    "truck": 0,
                    "ambulance": 0,
                    "fire_engine": 0
                }
            }
            
        self.safety_score = 94.0
        self.efficiency_score = 88.0
        self.congestion_index = 28.0
        
        # Traditional system comparison counters
        self.traditional_wait_time = 65.0
        self.traditional_queue = 16.0
        
        # Vehicle ID counter
        self.vehicle_id_counter = 1000
        
        # Start initial signals
        self.approaches[self.active_approach]["signal_state"] = "GREEN"
        
        # Initial population of realistic vehicles
        self._seed_initial_vehicles()
        self.update_telemetry()
        self.add_advisor_message("AI Traffic Engine initialized. Adaptive mixed-traffic control active.", "info")

    def _seed_initial_vehicles(self):
        for app in APPROACH_NAMES:
            count = random.randint(3, 7)
            for _ in range(count):
                v_type = random.choices(["twowheeler", "car", "auto", "bus", "truck"], weights=[0.4, 0.3, 0.15, 0.08, 0.07])[0]
                self.spawn_vehicle(app, v_type)

    def spawn_vehicle(self, approach, v_type, is_emergency=False, turning=None):
        if approach not in self.approaches:
            return None
        
        self.vehicle_id_counter += 1
        spec = VEHICLE_SPECS.get(v_type, VEHICLE_SPECS["car"])
        
        # Determine turning movement (straight, left, right)
        if turning is None:
            if is_emergency:
                turning = "straight"
            else:
                turning = random.choices(["straight", "left", "right"], weights=[0.65, 0.22, 0.13])[0]
                
        # Assign lane: Lane 0 (left-turn/slip), Lane 1 (straight), Lane 2 (straight/right)
        lane = 0 if turning == "left" else (1 if random.random() < 0.55 else 2)
        
        # Distance from stopline: queue up behind existing vehicles in same lane
        same_lane_vehs = [v for v in self.approaches[approach]["vehicles"] if v["lane"] == lane]
        if same_lane_vehs:
            furthest = max(v["distance"] for v in same_lane_vehs)
            distance = furthest + spec["length"] + random.uniform(2.5, 4.0)
        else:
            distance = random.uniform(15.0, 35.0)

        vehicle = {
            "id": self.vehicle_id_counter,
            "type": v_type,
            "approach": approach,
            "lane": lane,
            "turning": turning,
            "distance": distance,  # distance from intersection stopline (meters)
            "speed": 0.0,
            "target_speed": spec["speed"],
            "length": spec["length"],
            "pcu": spec["pcu"],
            "color": spec["color"],
            "is_emergency": is_emergency or spec.get("emergency", False),
            "wait_time": 0.0,
            "in_intersection": False,
            "cleared": False
        }
        
        if turning == "left":
            self.approaches[approach]["free_left_vehicles"].append(vehicle)
        else:
            self.approaches[approach]["vehicles"].append(vehicle)
            
        self.update_approach_breakdown(approach)
        return vehicle

    def spawn_pedestrians(self, approach, count):
        if approach in self.approaches:
            self.approaches[approach]["pedestrians_waiting"] += count
            self.update_telemetry()
            self.add_advisor_message(f"Pedestrian surge detected at {approach} crosswalk (+{count} pedestrians).", "pedestrian")

    def trigger_emergency(self, approach, v_type="ambulance"):
        if approach not in self.approaches:
            return
            
        self.spawn_vehicle(approach, v_type, is_emergency=True, turning="straight")
        
        # Check pedestrian conflicts
        peds_crossing = sum(app["pedestrians_crossing"] for app in self.approaches.values())
        eval_result = self.ai_engine.evaluate_emergency_priority(approach, v_type, peds_crossing)
        
        self.emergency_state = {
            "active": True,
            "approach": approach,
            "type": v_type.upper(),
            "needs_clearance": eval_result["needs_clearance"],
            "clearance_countdown": eval_result["clearance_seconds"],
            "granted": False,
            "reason": eval_result["reason"]
        }
        
        if eval_result["needs_clearance"]:
            self.add_advisor_message(f"🚨 {v_type.upper()} on {approach}! Safety protocol: Safe {eval_result['clearance_seconds']}s evacuation for pedestrians before green corridor.", "emergency")
            self.log_decision(
                "EMERGENCY_CLEARANCE_BUFFER",
                approach,
                eval_result["reason"],
                {"pedestrians": peds_crossing, "buffer": eval_result["clearance_seconds"]},
                eval_result["action"]
            )
        else:
            self._activate_emergency_corridor(approach, v_type)

    def _activate_emergency_corridor(self, approach, v_type):
        self.emergency_state["granted"] = True
        self.emergency_state["needs_clearance"] = False
        self.active_approach = approach
        self.active_signal_phase = "GREEN"
        self.phase_remaining = 35
        
        # Set all other signals RED
        for app in APPROACH_NAMES:
            if app == approach:
                self.approaches[app]["signal_state"] = "GREEN"
            else:
                self.approaches[app]["signal_state"] = "RED"
            # Emergency blocks conflicting free-lefts
            self.approaches[app]["free_left_state"] = "BLOCKED"
            self.approaches[app]["free_left_reason"] = "Emergency priority corridor engaged."
            
        self.add_advisor_message(f"🚑 GREEN CORRIDOR ACTIVE: {approach} approach cleared for {v_type.upper()} transit.", "emergency")
        self.log_decision(
            "EMERGENCY_GREEN_CORRIDOR",
            approach,
            f"Preempted all signals for incoming {v_type}.",
            {"approach": approach, "duration": 35},
            f"Dedicated GREEN corridor granted to {approach} (35s)."
        )

    def clear_emergency(self):
        if self.emergency_state:
            self.emergency_state = None
            self.add_advisor_message("Emergency vehicle cleared junction. Normal AI adaptive control restored.", "info")
            self.switch_to_next_approach()

    def set_mode(self, mode):
        self.current_mode = mode
        # Auto-adjust pedestrian & traffic spawn behaviors
        if mode == "FESTIVAL":
            for app in APPROACH_NAMES:
                self.approaches[app]["pedestrians_waiting"] += random.randint(18, 35)
            self.add_advisor_message("Festival Mode active: Prioritizing crowd crossing durations & slip-lane safety.", "warning")
        elif mode == "RELIGIOUS":
            self.approaches["North"]["pedestrians_waiting"] += random.randint(30, 50)
            self.add_advisor_message("Religious Event Mode: North temple approach pedestrian crowd monitored.", "warning")
        elif mode == "PEAK_HOUR":
            for app in ["North", "South"]:
                for _ in range(8):
                    self.spawn_vehicle(app, random.choice(["car", "twowheeler", "bus"]))
            self.add_advisor_message("Peak Hour Rush Mode: Optimizing high-PCU arterial throughput.", "info")
        elif mode == "WEEKEND":
            self.add_advisor_message("Weekend Mode: Recreational mixed-traffic pacing applied.", "info")
        elif mode == "NORMAL":
            self.add_advisor_message("Normal Weekday Mode: Dynamic adaptive balancing active.", "info")
            
        self.update_telemetry()

    def update_approach_breakdown(self, approach):
        app = self.approaches[approach]
        breakdown = {"twowheeler": 0, "car": 0, "auto": 0, "bus": 0, "truck": 0, "ambulance": 0, "fire_engine": 0}
        
        all_vehs = app["vehicles"] + app["free_left_vehicles"]
        for v in all_vehs:
            v_type = v.get("type", "car")
            if v_type in breakdown:
                breakdown[v_type] += 1
            else:
                breakdown["car"] += 1
                
        app["vehicle_breakdown"] = breakdown
        app["vehicle_count"] = len(all_vehs)
        
        # Calculate queue length (vehicles with speed < 1.0 within 40m)
        queue = sum(1 for v in all_vehs if v["distance"] < 40 and v["speed"] < 1.0)
        app["queue_length"] = queue
        
        # Calculate PCU and density
        pcu, has_emerg = self.ai_engine.calculate_pcu(breakdown)
        road_occ = min(100.0, len(all_vehs) * 6.5)
        pcu_load = self.ai_engine.calculate_traffic_load(pcu, queue, app["wait_time"], road_occ)
        density_pct, level, color, badge = self.ai_engine.classify_density(pcu_load)
        
        app["pcu_load"] = pcu_load
        app["density_pct"] = density_pct
        app["density_level"] = level
        app["density_color"] = color
        app["density_badge"] = badge

    def update_telemetry(self):
        for app in APPROACH_NAMES:
            self.update_approach_breakdown(app)
            
            # Evaluate Free-Left State
            if self.free_left_smart_enabled:
                fl_eval = self.ai_engine.evaluate_free_left(
                    app,
                    self.approaches[app]["pedestrians_crossing"],
                    self.approaches[app]["pedestrians_waiting"],
                    conflicting_traffic_high=(self.approaches[app]["density_pct"] > 75),
                    emergency_active=(self.emergency_state is not None and self.emergency_state.get("active"))
                )
                self.approaches[app]["free_left_state"] = fl_eval["state"]
                self.approaches[app]["free_left_reason"] = fl_eval["reason"]
            else:
                self.approaches[app]["free_left_state"] = "ACTIVE"
                self.approaches[app]["free_left_reason"] = "Fixed rule: Free-left always unmonitored"

        # Calculate Safety & Efficiency scores
        safety, eff, cong = self.ai_engine.calculate_scores(
            self.approaches,
            None,
            self.emergency_state is not None and self.emergency_state.get("active"),
            self.current_mode
        )
        self.safety_score = safety
        self.efficiency_score = eff
        self.congestion_index = cong

    def tick(self, dt=1.0):
        effective_dt = dt * self.simulation_speed
        
        # 1. Handle Emergency clearance countdown if active
        if self.emergency_state and self.emergency_state.get("needs_clearance"):
            self.emergency_state["clearance_countdown"] -= effective_dt
            if self.emergency_state["clearance_countdown"] <= 0:
                self._activate_emergency_corridor(self.emergency_state["approach"], self.emergency_state["type"])

        # 2. Handle Phase Timer
        self.phase_remaining -= effective_dt
        
        # 3. Handle Pedestrian Crossing
        self._tick_pedestrians(effective_dt)
        
        # 4. Handle Phase Transition when phase_remaining <= 0
        if self.phase_remaining <= 0:
            self._handle_phase_transition()

        # 5. Move Vehicles Physics
        self._tick_vehicles(effective_dt)
        
        # 6. Random vehicle arrivals (proportional to mode)
        self._simulate_random_traffic(effective_dt)
        
        # 7. Update Telemetry metrics
        self.update_telemetry()

    def _tick_pedestrians(self, dt):
        for app in APPROACH_NAMES:
            approach_data = self.approaches[app]
            
            # If pedestrians are crossing, tick timer
            if approach_data["pedestrians_crossing"] > 0:
                approach_data["pedestrian_timer"] -= dt
                
                # Check for dynamic safety extension if pedestrians still crossing near timer end
                if approach_data["pedestrian_timer"] <= 3 and approach_data["pedestrians_crossing"] > 10:
                    approach_data["pedestrian_timer"] += 8
                    approach_data["pedestrian_total_duration"] += 8
                    self.add_advisor_message(f"Pedestrian safety extension: +8s granted at {app} (crowd still crossing).", "pedestrian")
                    self.log_decision(
                        "PEDESTRIAN_EXTENSION",
                        app,
                        f"{approach_data['pedestrians_crossing']} pedestrians still in crosswalk corridor.",
                        {"remaining_crowd": approach_data["pedestrians_crossing"], "extension": 8},
                        "Extended pedestrian crossing phase by +8s for safe clearance."
                    )
                
                if approach_data["pedestrian_timer"] <= 0:
                    # Crossing complete
                    approach_data["pedestrians_crossing"] = 0
                    approach_data["pedestrian_timer"] = 0
                    approach_data["pedestrian_state"] = "WAITING"
            else:
                # If pedestrians waiting and this approach is RED or in Pedestrian Phase, start crossing
                if approach_data["signal_state"] == "RED" and approach_data["pedestrians_waiting"] > 0:
                    # In festival mode or if crowd > 20, they get crossing green
                    cross_duration, tier, _ = self.ai_engine.calculate_pedestrian_crossing_time(
                        approach_data["pedestrians_waiting"], self.current_mode
                    )
                    approach_data["pedestrians_crossing"] = approach_data["pedestrians_waiting"]
                    approach_data["pedestrians_waiting"] = 0
                    approach_data["pedestrian_timer"] = cross_duration
                    approach_data["pedestrian_total_duration"] = cross_duration
                    approach_data["pedestrian_state"] = "CROSSING"

    def _handle_phase_transition(self):
        if not self.ai_adaptive_enabled:
            # Traditional Fixed System: 60s green, 3s yellow, round-robin
            if self.active_signal_phase == "GREEN":
                self.active_signal_phase = "YELLOW"
                self.phase_remaining = 3
                self.approaches[self.active_approach]["signal_state"] = "YELLOW"
            elif self.active_signal_phase == "YELLOW":
                self.approaches[self.active_approach]["signal_state"] = "RED"
                idx = APPROACH_NAMES.index(self.active_approach)
                self.active_approach = APPROACH_NAMES[(idx + 1) % len(APPROACH_NAMES)]
                self.active_signal_phase = "GREEN"
                self.phase_remaining = 60
                self.approaches[self.active_approach]["signal_state"] = "GREEN"
            return

        # AI Adaptive Transition
        if self.active_signal_phase == "GREEN":
            # Switch to Yellow
            self.active_signal_phase = "YELLOW"
            self.phase_remaining = int(self.ai_engine.settings.get("yellow_time", 3))
            self.approaches[self.active_approach]["signal_state"] = "YELLOW"
        elif self.active_signal_phase == "YELLOW":
            # Switch current to RED and select next approach intelligently
            self.approaches[self.active_approach]["signal_state"] = "RED"
            self.switch_to_next_approach()

    def switch_to_next_approach(self):
        next_sig = self.ai_engine.determine_next_signal(
            self.approaches,
            current_active_approach=self.active_approach,
            mode=self.current_mode,
            emergency_info=self.emergency_state
        )
        
        self.active_approach = next_sig["approach"]
        self.active_signal_phase = "GREEN"
        self.phase_remaining = next_sig["green_time"]
        
        for app in APPROACH_NAMES:
            if app == self.active_approach:
                self.approaches[app]["signal_state"] = "GREEN"
                self.approaches[app]["wait_time"] = 0.0  # Reset wait time on green
            else:
                self.approaches[app]["signal_state"] = "RED"

        # Log AI Decision
        action_text = f"Allocated {next_sig['green_time']}s GREEN to {self.active_approach} approach."
        if next_sig.get("starved"):
            action_text += " [Anti-Starvation Maximum Wait Rule Invoked]"
            
        self.log_decision(
            next_sig["type"],
            self.active_approach,
            next_sig["reason"],
            {
                "density": self.approaches[self.active_approach]["density_pct"],
                "queue": self.approaches[self.active_approach]["queue_length"],
                "wait_time": self.approaches[self.active_approach]["wait_time"],
                "green_allocated": next_sig["green_time"]
            },
            action_text
        )
        
        self.add_advisor_message(f"🚦 Signal optimized: {self.active_approach} GREEN for {next_sig['green_time']}s ({next_sig['type']})", "signal")

    def _tick_vehicles(self, dt):
        for app in APPROACH_NAMES:
            app_data = self.approaches[app]
            is_green = (app_data["signal_state"] == "GREEN")
            fl_state = app_data["free_left_state"]
            
            # Increment wait time for red approaches
            if not is_green:
                app_data["wait_time"] += dt
            else:
                app_data["wait_time"] = max(0.0, app_data["wait_time"] - dt * 2.5)

            # 1. Update straight/right vehicles
            self._update_vehicle_stream(app_data["vehicles"], is_green, dt, is_slip=False)
            
            # 2. Update free-left slip lane vehicles
            fl_can_proceed = (fl_state == "ACTIVE") or (fl_state == "CONTROLLED" and random.random() < 0.6)
            self._update_vehicle_stream(app_data["free_left_vehicles"], fl_can_proceed, dt, is_slip=True)

    def _update_vehicle_stream(self, vehicles, can_proceed, dt, is_slip=False):
        vehicles.sort(key=lambda v: v["distance"])
        
        remaining_vehs = []
        for i, v in enumerate(vehicles):
            v_front = vehicles[i - 1] if i > 0 else None
            
            # Target distance ahead
            if v["distance"] <= 0:
                # Inside intersection or completed
                v["in_intersection"] = True
                v["distance"] -= v["target_speed"] * dt
                if v["distance"] < -28.0:
                    v["cleared"] = True
                    # Check if cleared emergency
                    if v.get("is_emergency") and self.emergency_state:
                        self.clear_emergency()
                    continue
            else:
                # Approaching stop line
                if can_proceed:
                    # Accelerate towards intersection
                    target_stop = 0.0
                    if v_front and v_front["distance"] > 0:
                        target_stop = v_front["distance"] + v_front["length"] + 2.5
                        
                    if v["distance"] > target_stop:
                        v["speed"] = min(v["target_speed"], v["speed"] + 3.0 * dt)
                        v["distance"] -= v["speed"] * dt
                    else:
                        v["speed"] = max(0.0, v["speed"] - 5.0 * dt)
                        v["wait_time"] += dt
                else:
                    # Must stop before stop line (distance ~ 1.5m)
                    target_stop = 1.5
                    if v_front and v_front["distance"] > 0:
                        target_stop = v_front["distance"] + v_front["length"] + 2.5
                        
                    dist_to_target = v["distance"] - target_stop
                    if dist_to_target > 2.0:
                        v["speed"] = min(v["target_speed"], max(1.5, dist_to_target * 0.4))
                        v["distance"] -= v["speed"] * dt
                    else:
                        v["speed"] = 0.0
                        v["wait_time"] += dt
                        
            remaining_vehs.append(v)
            
        vehicles[:] = remaining_vehs

    def _simulate_random_traffic(self, dt):
        arrival_prob = 0.28 * dt
        if self.current_mode == "PEAK_HOUR":
            arrival_prob = 0.55 * dt
        elif self.current_mode == "FESTIVAL":
            arrival_prob = 0.40 * dt
            
        for app in APPROACH_NAMES:
            if random.random() < arrival_prob:
                v_type = random.choices(["twowheeler", "car", "auto", "bus", "truck"], weights=[0.42, 0.30, 0.16, 0.07, 0.05])[0]
                self.spawn_vehicle(app, v_type)
                
            # Random pedestrians
            ped_rate = 0.12 * dt
            if self.current_mode in ["FESTIVAL", "RELIGIOUS", "WEEKEND"]:
                ped_rate = 0.35 * dt
            if random.random() < ped_rate:
                self.approaches[app]["pedestrians_waiting"] += random.randint(1, 4)

    def log_decision(self, dec_type, approach, reason, params, action):
        self.last_decision = {
            "type": dec_type,
            "approach": approach,
            "reason": reason,
            "params": params,
            "action": action,
            "timestamp": datetime.now().strftime("%H:%M:%S")
        }
        database.log_ai_decision(dec_type, approach, reason, params, action)

    def add_advisor_message(self, text, category="info"):
        self.advisor_messages.insert(0, {
            "text": text,
            "category": category,
            "time": datetime.now().strftime("%H:%M:%S")
        })
        if len(self.advisor_messages) > 20:
            self.advisor_messages.pop()

    def load_scenario(self, scenario_id):
        """
        Loads one of the 12 Predefined Demo Scenarios
        """
        # Clear vehicles
        for app in APPROACH_NAMES:
            self.approaches[app]["vehicles"] = []
            self.approaches[app]["free_left_vehicles"] = []
            self.approaches[app]["pedestrians_waiting"] = 2
            self.approaches[app]["pedestrians_crossing"] = 0
            self.approaches[app]["wait_time"] = 12.0
            
        self.emergency_state = None
        self.ai_adaptive_enabled = True

        if scenario_id == 1 or scenario_id == "normal":
            self.current_mode = "NORMAL"
            for app in APPROACH_NAMES:
                for _ in range(4):
                    self.spawn_vehicle(app, random.choice(["car", "twowheeler", "auto"]))
            self.add_advisor_message("Scenario 1 Loaded: Normal Traffic baseline with mixed vehicle distribution.", "info")

        elif scenario_id == 2 or scenario_id == "peak_hour":
            self.current_mode = "PEAK_HOUR"
            for _ in range(12):
                self.spawn_vehicle("North", random.choice(["car", "twowheeler", "bus", "auto"]))
                self.spawn_vehicle("South", random.choice(["car", "twowheeler", "bus", "truck"]))
            for _ in range(4):
                self.spawn_vehicle("East", "car")
                self.spawn_vehicle("West", "twowheeler")
            self.add_advisor_message("Scenario 2 Loaded: Peak Hour Rush on North & South corridors.", "warning")

        elif scenario_id == 3 or scenario_id == "mixed_traffic":
            self.current_mode = "NORMAL"
            # High proportion of autos, two-wheelers, heavy buses
            for app in APPROACH_NAMES:
                for _ in range(5):
                    self.spawn_vehicle(app, "twowheeler")
                for _ in range(4):
                    self.spawn_vehicle(app, "auto")
                for _ in range(2):
                    self.spawn_vehicle(app, "bus")
            self.add_advisor_message("Scenario 3 Loaded: Indian Mixed Traffic heavy in Auto-Rickshaws & 2-Wheelers.", "info")

        elif scenario_id == 4 or scenario_id == "festival_crowd":
            self.current_mode = "FESTIVAL"
            self.approaches["East"]["pedestrians_waiting"] = 82
            self.approaches["West"]["pedestrians_waiting"] = 45
            for app in APPROACH_NAMES:
                for _ in range(5):
                    self.spawn_vehicle(app, random.choice(["car", "auto"]))
            self.add_advisor_message("Scenario 4 Loaded: Festival Crowd Surge (82 pedestrians waiting at East).", "pedestrian")

        elif scenario_id == 5 or scenario_id == "weekend_crowd":
            self.current_mode = "WEEKEND"
            for app in APPROACH_NAMES:
                self.approaches[app]["pedestrians_waiting"] = 28
                for _ in range(4):
                    self.spawn_vehicle(app, random.choice(["car", "twowheeler"]))
            self.add_advisor_message("Scenario 5 Loaded: Weekend Market Traffic with steady pedestrian crossings.", "info")

        elif scenario_id == 6 or scenario_id == "religious_event":
            self.current_mode = "RELIGIOUS"
            self.approaches["North"]["pedestrians_waiting"] = 95
            for _ in range(6):
                self.spawn_vehicle("South", "bus")
            self.add_advisor_message("Scenario 6 Loaded: Religious Gathering Exit (95 worshippers crossing North).", "pedestrian")

        elif scenario_id == 7 or scenario_id == "stadium_event":
            self.current_mode = "PUBLIC_EVENT"
            # Huge sudden surge on South approach
            for _ in range(16):
                self.spawn_vehicle("South", random.choice(["car", "auto", "twowheeler", "bus"]))
            self.approaches["South"]["wait_time"] = 45.0
            self.add_advisor_message("Scenario 7 Loaded: Stadium Championship Exit (Sudden surge on South).", "warning")

        elif scenario_id == 8 or scenario_id == "emergency_ambulance":
            self.current_mode = "EMERGENCY"
            for app in ["North", "East", "West"]:
                for _ in range(6):
                    self.spawn_vehicle(app, "car")
            self.trigger_emergency("South", "ambulance")
            self.add_advisor_message("Scenario 8 Loaded: Emergency Ambulance arriving on South approach.", "emergency")

        elif scenario_id == 9 or scenario_id == "free_left_conflict":
            self.current_mode = "NORMAL"
            for _ in range(6):
                self.spawn_vehicle("East", "car", turning="left")
            self.approaches["East"]["pedestrians_crossing"] = 18
            self.approaches["East"]["pedestrian_timer"] = 22
            self.add_advisor_message("Scenario 9 Loaded: Free-Left Slip Lane Pedestrian Conflict (Slip BLOCKED).", "warning")

        elif scenario_id == 10 or scenario_id == "unequal_traffic":
            self.current_mode = "NORMAL"
            # East CRITICAL, North LOW
            for _ in range(15):
                self.spawn_vehicle("East", random.choice(["car", "truck", "bus", "auto"]))
            self.approaches["East"]["wait_time"] = 62.0
            self.spawn_vehicle("North", "twowheeler")
            self.approaches["North"]["wait_time"] = 15.0
            self.add_advisor_message("Scenario 10 Loaded: Severe Asymmetric Traffic (East 90% vs North 15%).", "warning")

        elif scenario_id == 11 or scenario_id == "predicted_congestion":
            self.current_mode = "PEAK_HOUR"
            for _ in range(11):
                self.spawn_vehicle("West", random.choice(["truck", "bus", "car"]))
            self.approaches["West"]["wait_time"] = 50.0
            self.add_advisor_message("Scenario 11 Loaded: Congestion Influx Triggered (AI Predictor engaged).", "warning")

        elif scenario_id == 12 or scenario_id == "emergency_pedestrian":
            self.current_mode = "EMERGENCY"
            self.approaches["South"]["pedestrians_crossing"] = 26
            self.approaches["South"]["pedestrian_timer"] = 18
            self.trigger_emergency("South", "fire_engine")
            self.add_advisor_message("Scenario 12 Loaded: Emergency Fire Engine + Active Pedestrian Conflict.", "emergency")

        self.update_telemetry()
        return True

    def get_full_state(self):
        return {
            "current_mode": self.current_mode,
            "ai_adaptive_enabled": self.ai_adaptive_enabled,
            "free_left_smart_enabled": self.free_left_smart_enabled,
            "simulation_speed": self.simulation_speed,
            "active_approach": self.active_approach,
            "active_signal_phase": self.active_signal_phase,
            "phase_remaining": max(0, int(round(self.phase_remaining))),
            "pedestrian_phase_active": self.pedestrian_phase_active,
            "emergency_state": self.emergency_state,
            "approaches": self.approaches,
            "safety_score": self.safety_score,
            "efficiency_score": self.efficiency_score,
            "congestion_index": self.congestion_index,
            "last_decision": self.last_decision,
            "advisor_messages": self.advisor_messages[:6],
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
