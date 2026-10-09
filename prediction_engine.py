from datetime import datetime, timedelta
import random

class PredictionEngine:
    def __init__(self):
        # Baseline time-of-day multipliers
        self.time_profiles = {
            "morning_rush": (8, 11, 1.6),
            "school_closing": (14, 16, 1.3),
            "evening_rush": (17, 21, 1.8),
            "night": (22, 6, 0.4),
            "regular": (11, 14, 1.0)
        }

    def get_time_multiplier(self, dt=None):
        if dt is None:
            dt = datetime.now()
        hr = dt.hour
        for profile, (start, end, mult) in self.time_profiles.items():
            if start <= hr < end or (start > end and (hr >= start or hr < end)):
                return mult
        return 1.0

    def predict_traffic(self, approaches_state, active_events=None, current_mode="NORMAL"):
        """
        Generates predictions for +5 min, +15 min, and +30 min horizons
        """
        now = datetime.now()
        horizons = [5, 15, 30]
        predictions = {}

        # Event amplification factor
        event_crowd_boost = 1.0
        event_veh_boost = 1.0
        event_names = []
        if active_events:
            for ev in active_events:
                event_names.append(ev.get("name", "Special Event"))
                if ev.get("active_mode") in ["FESTIVAL", "RELIGIOUS"]:
                    event_crowd_boost = max(event_crowd_boost, 2.4)
                    event_veh_boost = max(event_veh_boost, 1.7)
                elif ev.get("active_mode") in ["PUBLIC_EVENT", "STADIUM"]:
                    event_crowd_boost = max(event_crowd_boost, 2.1)
                    event_veh_boost = max(event_veh_boost, 2.2)

        if current_mode == "FESTIVAL":
            event_crowd_boost = max(event_crowd_boost, 2.5)
            event_veh_boost = max(event_veh_boost, 1.6)
        elif current_mode == "PEAK_HOUR":
            event_veh_boost = max(event_veh_boost, 1.8)

        base_multiplier = self.get_time_multiplier(now)

        for h in horizons:
            forecast_time = now + timedelta(minutes=h)
            h_time_mult = self.get_time_multiplier(forecast_time)
            horizon_key = f"{h}m"
            
            # Predict for each approach
            approaches_forecast = {}
            max_prob = 0
            bottleneck_app = "None"

            for app_name, current in approaches_state.items():
                cur_density = current.get("density_pct", 30.0)
                cur_queue = current.get("queue_length", 5)
                cur_wait = current.get("wait_time", 20.0)
                cur_peds = current.get("pedestrian_count", 10)

                # Growth model based on current trend + horizon + mode
                growth_rate = (0.015 * h) * event_veh_boost * h_time_mult
                predicted_density = min(98.0, round(cur_density * (1.0 + growth_rate), 1))
                predicted_queue = int(round(cur_queue * (1.0 + growth_rate * 1.2)))
                predicted_wait = round(cur_wait * (1.0 + growth_rate * 0.9), 1)

                ped_growth = (0.02 * h) * event_crowd_boost
                predicted_peds = int(round(cur_peds * (1.0 + ped_growth)))

                # Congestion probability calculation
                # Logit-like curve based on predicted density
                if predicted_density < 40:
                    prob = int(round(predicted_density * 0.4))
                elif predicted_density < 65:
                    prob = int(round(35 + (predicted_density - 40) * 1.2))
                elif predicted_density < 85:
                    prob = int(round(65 + (predicted_density - 65) * 1.1))
                else:
                    prob = int(min(98, round(85 + (predicted_density - 85) * 0.9)))

                if prob > max_prob:
                    max_prob = prob
                    bottleneck_app = app_name

                approaches_forecast[app_name] = {
                    "density_pct": predicted_density,
                    "queue_length": predicted_queue,
                    "wait_time": predicted_wait,
                    "pedestrian_count": predicted_peds,
                    "congestion_probability": prob,
                    "classification": "CRITICAL" if predicted_density >= 85 else ("HIGH" if predicted_density >= 65 else ("MEDIUM" if predicted_density >= 40 else "LOW"))
                }

            # Proactive AI Recommendations for this horizon
            recs = []
            if max_prob >= 75:
                recs.append(f"Proactive Signal Adjustment: Extend {bottleneck_app} green window by +{min(25, int(max_prob * 0.25))}s in advance.")
                recs.append(f"Dynamic Free-Left Alert: Transition {bottleneck_app} slip lane to CONTROLLED to buffer cross-merge.")
            if event_crowd_boost > 1.5:
                recs.append("Crowd Preemption: Schedule 45s Pedestrian Scramble phase every 2nd cycle.")
            if not recs:
                recs.append("Traffic flow stable: Maintain standard adaptive cycle rotation.")

            predictions[horizon_key] = {
                "horizon_minutes": h,
                "target_time": forecast_time.strftime("%H:%M"),
                "approaches": approaches_forecast,
                "peak_bottleneck": bottleneck_app,
                "max_congestion_prob": max_prob,
                "recommendations": recs
            }

        # Key High-level Alert
        high_prob_alert = None
        for h in [15, 5, 30]:
            h_key = f"{h}m"
            if predictions[h_key]["max_congestion_prob"] >= 70:
                high_prob_alert = {
                    "horizon": f"{h} minutes",
                    "approach": predictions[h_key]["peak_bottleneck"],
                    "probability": predictions[h_key]["max_congestion_prob"],
                    "level": "HIGH CONGESTION PREDICTED" if predictions[h_key]["max_congestion_prob"] < 85 else "CRITICAL CONGESTION WARNING",
                    "text": f"{predictions[h_key]['max_congestion_prob']}% probability of {predictions[h_key]['approaches'][predictions[h_key]['peak_bottleneck']]['classification']} congestion on {predictions[h_key]['peak_bottleneck']} approach within {h} minutes."
                }
                break

        return {
            "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
            "horizons": predictions,
            "proactive_alert": high_prob_alert,
            "event_context": {
                "active_events": event_names,
                "crowd_multiplier": round(event_crowd_boost, 2),
                "vehicle_multiplier": round(event_veh_boost, 2)
            }
        }
