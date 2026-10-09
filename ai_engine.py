import math
from datetime import datetime

class AIEngine:
    def __init__(self, settings=None):
        self.settings = settings or {
            "pcu_twowheeler": 0.5,
            "pcu_car": 1.0,
            "pcu_auto": 1.0,
            "pcu_bus": 3.0,
            "pcu_truck": 3.0,
            "min_green_time": 15,
            "max_green_time": 75,
            "yellow_time": 3,
            "starvation_threshold": 75,
            "free_left_ped_conflict_threshold": 3,
            "emergency_clearance_buffer": 5
        }
        self.capacity_per_approach = 50.0  # reference PCU capacity per arm

    def update_settings(self, new_settings):
        for k, v in new_settings.items():
            if k in self.settings:
                try:
                    self.settings[k] = float(v)
                except (ValueError, TypeError):
                    self.settings[k] = v

    def calculate_pcu(self, vehicle_breakdown):
        """
        Calculate Passenger Car Units (PCU) for Indian mixed traffic
        """
        tw = vehicle_breakdown.get("twowheeler", 0) * float(self.settings.get("pcu_twowheeler", 0.5))
        car = vehicle_breakdown.get("car", 0) * float(self.settings.get("pcu_car", 1.0))
        auto = vehicle_breakdown.get("auto", 0) * float(self.settings.get("pcu_auto", 1.0))
        bus = vehicle_breakdown.get("bus", 0) * float(self.settings.get("pcu_bus", 3.0))
        truck = vehicle_breakdown.get("truck", 0) * float(self.settings.get("pcu_truck", 3.0))
        emergency = vehicle_breakdown.get("ambulance", 0) + vehicle_breakdown.get("fire_engine", 0)
        
        total_pcu = tw + car + auto + bus + truck
        return round(total_pcu, 2), emergency > 0

    def calculate_traffic_load(self, pcu, queue_length, wait_time, road_occupancy):
        """
        Combined multi-factor traffic load calculation
        """
        # Load index incorporates physical PCU volume, queue accumulation, waiting fatigue, and road coverage
        load = (pcu * 1.5) + (queue_length * 0.8) + (wait_time * 0.35) + (road_occupancy * 0.25)
        return round(load, 2)

    def classify_density(self, pcu_load):
        """
        Classifies density as LOW, MEDIUM, HIGH, or CRITICAL
        """
        density_pct = min(100.0, max(5.0, round((pcu_load / self.capacity_per_approach) * 100, 1)))
        
        if density_pct < 40.0:
            level = "LOW"
            color = "green"
            badge = "🟢 LOW"
        elif density_pct < 65.0:
            level = "MEDIUM"
            color = "yellow"
            badge = "🟡 MEDIUM"
        elif density_pct < 85.0:
            level = "HIGH"
            color = "orange"
            badge = "🟠 HIGH"
        else:
            level = "CRITICAL"
            color = "red"
            badge = "🔴 CRITICAL"
            
        return density_pct, level, color, badge

    def calculate_adaptive_green_time(self, density_pct, queue_length, wait_time, mode="NORMAL"):
        """
        Dynamically calculate green duration (e.g. 15s to 75s)
        """
        min_g = float(self.settings.get("min_green_time", 15))
        max_g = float(self.settings.get("max_green_time", 75))
        
        # Base green proportional to density
        base_green = min_g + ((density_pct / 100.0) * (max_g - min_g))
        
        # Queue clearance bonus
        queue_bonus = min(20.0, queue_length * 1.2)
        
        # Waiting fatigue bonus
        wait_bonus = min(15.0, wait_time * 0.15)
        
        # Mode adjustment
        mode_factor = 1.0
        if mode == "PEAK_HOUR":
            mode_factor = 1.15
        elif mode in ["FESTIVAL", "RELIGIOUS"]:
            mode_factor = 0.95 # Balance vehicle time for pedestrian windows

        recommended = (base_green + queue_bonus + wait_bonus) * mode_factor
        final_green = int(round(max(min_g, min(max_g, recommended))))
        return final_green

    def calculate_pedestrian_crossing_time(self, pedestrian_count, mode="NORMAL"):
        """
        Dynamic pedestrian crossing time based on crowd size & event mode
        """
        if pedestrian_count < 15:
            base_time = 20
            tier = "LOW"
            badge = "🟢 LOW (<15)"
        elif pedestrian_count <= 35:
            base_time = 30
            tier = "MEDIUM"
            badge = "🟡 MEDIUM (15-35)"
        elif pedestrian_count <= 70:
            base_time = 40
            tier = "HIGH"
            badge = "🟠 HIGH (36-70)"
        else:
            base_time = 55
            tier = "VERY HIGH"
            badge = "🔴 VERY HIGH (70+)"

        if mode in ["FESTIVAL", "RELIGIOUS"]:
            base_time = min(65, int(base_time * 1.2))

        return base_time, tier, badge

    def evaluate_free_left(self, approach_name, pedestrians_crossing, pedestrians_waiting, conflicting_traffic_high=False, emergency_active=False):
        """
        Intelligent Free-Left Turn Management
        States: ACTIVE (🟢), CONTROLLED (🟡), BLOCKED (🔴)
        """
        if emergency_active:
            return {
                "state": "BLOCKED",
                "badge": "🔴 BLOCKED",
                "color": "#ef4444",
                "reason": "Emergency vehicle corridor active — all conflicting slip lanes locked.",
                "action": "Hold turning traffic behind slip stop-line."
            }
        
        if pedestrians_crossing > 0:
            return {
                "state": "BLOCKED",
                "badge": "🔴 BLOCKED",
                "color": "#ef4444",
                "reason": f"{pedestrians_crossing} pedestrians detected inside crosswalk conflict zone.",
                "action": "Immediate slip-lane red signal. Complete pedestrian clearance priority."
            }
            
        conflict_thresh = float(self.settings.get("free_left_ped_conflict_threshold", 3))
        if pedestrians_waiting >= conflict_thresh or conflicting_traffic_high:
            return {
                "state": "CONTROLLED",
                "badge": "🟡 CONTROLLED",
                "color": "#f59e0b",
                "reason": f"{pedestrians_waiting} pedestrians waiting at curb or high merge conflict.",
                "action": "Flashing yellow warning. Max speed 15 km/h; yield to pedestrians."
            }
            
        return {
            "state": "ACTIVE",
            "badge": "🟢 ACTIVE",
            "color": "#10b981",
            "reason": "Zero pedestrian conflict on slip crossing. Clear exit merge zone.",
            "action": "Continuous free-flow left turn permitted."
        }

    def evaluate_emergency_priority(self, approach_name, emergency_type, pedestrians_crossing):
        """
        Emergency vehicle priority handling with safety-aware pedestrian clearance
        """
        clearance_buf = int(self.settings.get("emergency_clearance_buffer", 5))
        if pedestrians_crossing > 0:
            return {
                "immediate_green": False,
                "needs_clearance": True,
                "clearance_seconds": clearance_buf,
                "reason": f"Emergency vehicle on {approach_name}, but {pedestrians_crossing} pedestrians in intersection.",
                "action": f"Safe {clearance_buf}s evacuation countdown with siren alert before green corridor release.",
                "target_approach": approach_name
            }
        else:
            return {
                "immediate_green": True,
                "needs_clearance": False,
                "clearance_seconds": 0,
                "reason": f"{emergency_type} detected on {approach_name} with clear pedestrian zone.",
                "action": f"Immediate green corridor on {approach_name} (35s). Conflicting approaches held at RED.",
                "target_approach": approach_name
            }

    def determine_next_signal(self, approaches_data, current_active_approach=None, mode="NORMAL", emergency_info=None):
        """
        Selects next green approach based on:
        1. Emergency override
        2. Starvation prevention (Maximum wait time rule)
        3. Highest weighted traffic load
        """
        # 1. Emergency Override
        if emergency_info and emergency_info.get("active"):
            target = emergency_info.get("approach")
            green_time = 35
            reason = f"Emergency {emergency_info.get('type')} detected on {target} approach."
            return {
                "approach": target,
                "green_time": green_time,
                "reason": reason,
                "type": "EMERGENCY_OVERRIDE",
                "starved": False
            }

        # 2. Check for Starvation (Fairness Rule)
        starve_thresh = float(self.settings.get("starvation_threshold", 75))
        starved_candidates = []
        for app_name, data in approaches_data.items():
            if app_name != current_active_approach and data.get("wait_time", 0) >= starve_thresh:
                starved_candidates.append((app_name, data.get("wait_time", 0)))
                
        if starved_candidates:
            # Pick the longest waiting starved approach
            starved_candidates.sort(key=lambda x: x[1], reverse=True)
            chosen_app = starved_candidates[0][0]
            density = approaches_data[chosen_app].get("density_pct", 30)
            green_time = self.calculate_adaptive_green_time(density, approaches_data[chosen_app].get("queue_length", 5), approaches_data[chosen_app].get("wait_time", 80), mode)
            reason = f"{chosen_app} approached starved threshold ({starved_candidates[0][1]:.0f}s wait >= {starve_thresh}s). Forced fairness green."
            return {
                "approach": chosen_app,
                "green_time": green_time,
                "reason": reason,
                "type": "STARVATION_PREVENTION",
                "starved": True
            }

        # 3. Dynamic Optimization based on Load
        candidates = []
        for app_name, data in approaches_data.items():
            if app_name == current_active_approach and len(approaches_data) > 1:
                # Give slight penalty to current to allow rotation unless overwhelmingly congested
                penalty = 0.7
            else:
                penalty = 1.0
            
            score = (data.get("pcu_load", 0) * 1.5 + 
                     data.get("queue_length", 0) * 1.0 + 
                     data.get("wait_time", 0) * 0.4) * penalty
            candidates.append((app_name, score, data))

        candidates.sort(key=lambda x: x[1], reverse=True)
        chosen_app = candidates[0][0]
        chosen_data = candidates[0][2]
        density = chosen_data.get("density_pct", 50)
        queue = chosen_data.get("queue_length", 8)
        wait = chosen_data.get("wait_time", 20)
        
        green_time = self.calculate_adaptive_green_time(density, queue, wait, mode)
        reason = f"{chosen_app} has highest weighted load ({candidates[0][1]:.1f}) with {density}% density & {queue} vehicles."

        return {
            "approach": chosen_app,
            "green_time": green_time,
            "reason": reason,
            "type": "ADAPTIVE_LOAD_OPTIMIZATION",
            "starved": False
        }

    def calculate_scores(self, approaches_data, pedestrian_status, emergency_active, mode="NORMAL"):
        """
        Calculates Junction Safety Score (0-100) and Traffic Efficiency (0-100)
        """
        # Safety Score Factors:
        # Base: 95
        # Penalty if pedestrians crossing without blocked free-left: -35
        # Penalty if waiting time exceeds starvation threshold: -15
        # Penalty if critical density without green extension: -10
        safety_score = 96.0
        
        # Check free-left conflict safety
        for app_name, app in approaches_data.items():
            if app.get("pedestrians_crossing", 0) > 0 and app.get("free_left_state") != "BLOCKED":
                safety_score -= 25.0
            if app.get("wait_time", 0) > 90:
                safety_score -= 8.0
            if app.get("density_pct", 0) > 90 and app.get("signal_state") == "RED" and app.get("wait_time", 0) > 60:
                safety_score -= 5.0
                
        if emergency_active:
            safety_score += 2.0 # active priority protocol bonus
            
        safety_score = max(45.0, min(100.0, round(safety_score, 1)))

        # Efficiency Score Factors:
        # Based on average queue length, wait times, throughput
        avg_wait = sum(app.get("wait_time", 0) for app in approaches_data.values()) / max(1, len(approaches_data))
        avg_queue = sum(app.get("queue_length", 0) for app in approaches_data.values()) / max(1, len(approaches_data))
        
        # Target ideal wait time is ~20s, ideal queue is ~3
        wait_penalty = max(0, (avg_wait - 20) * 0.6)
        queue_penalty = max(0, (avg_queue - 3) * 1.5)
        
        efficiency_score = 100.0 - wait_penalty - queue_penalty
        if mode == "PEAK_HOUR":
            efficiency_score = max(50.0, efficiency_score)
        elif mode == "FESTIVAL":
            efficiency_score = max(55.0, efficiency_score)
            
        efficiency_score = max(35.0, min(99.0, round(efficiency_score, 1)))
        
        # Congestion Index
        max_density = max(app.get("density_pct", 0) for app in approaches_data.values()) if approaches_data else 30
        avg_density = sum(app.get("density_pct", 0) for app in approaches_data.values()) / max(1, len(approaches_data))
        congestion_index = round((max_density * 0.6 + avg_density * 0.4), 1)

        return safety_score, efficiency_score, congestion_index

    def generate_explanation(self, decision_type, approach, reason, details):
        """
        Explainable AI: Generates structured why did AI make this decision payload
        """
        return {
            "title": f"AI Decision: {decision_type}",
            "approach": approach,
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "core_reason": reason,
            "metrics": details,
            "ai_action": details.get("action_taken", "Adjusted signal parameters.")
        }
