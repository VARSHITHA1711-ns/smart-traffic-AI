/**
 * ============================================================================
 * 12-STEP GUIDED DEMONSTRATION TOUR MANAGER
 * Matches Section 39 ("PROJECT DEMONSTRATION") of the requirements.
 * Interactive Step-by-Step Walkthrough with Automated Simulation Actions
 * ============================================================================
 */

class DemoTourManager {
  constructor(appController) {
    this.app = appController;
    this.currentStep = 1;
    this.totalSteps = 12;
    this.isAutoPlaying = false;
    this.autoPlayTimer = null;

    this.steps = [
      {
        step: 1,
        title: "STEP 1: Baseline Normal Traffic",
        desc: "Initialize balanced mixed traffic across all 4 arms (North, South, East, West). The AI balances cycles dynamically with standard timing.",
        action: async () => {
          await this.app.loadScenario(1);
          this.app.switchTab('dashboard');
        }
      },
      {
        step: 2,
        title: "STEP 2: Increase East Traffic",
        desc: "Simulate a sudden traffic surge on the East approach. The AI detection pipeline calculates PCU units and detects high density.",
        action: async () => {
          await fetch('/api/simulation/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'spawn_vehicle', approach: 'East', type: 'truck' })
          });
          for (let i = 0; i < 6; i++) {
            await fetch('/api/simulation/control', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'spawn_vehicle', approach: 'East', type: 'bus' })
            });
          }
          this.app.switchTab('live-junction');
        }
      },
      {
        step: 3,
        title: "STEP 3: AI Automatically Increases East Green Time",
        desc: "Witness the AI Decision Engine in action: East approach receives an extended 45-55s green phase, adapting directly to high PCU load.",
        action: async () => {
          await this.app.loadScenario(10); // Unequal traffic: East heavy
          this.app.switchTab('ai-control');
        }
      },
      {
        step: 4,
        title: "STEP 4: Introduce Pedestrians",
        desc: "Pedestrians arrive at the intersection crosswalk. The AI computer vision identifies pedestrian count and evaluates crossing readiness.",
        action: async () => {
          await fetch('/api/simulation/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'spawn_pedestrians', approach: 'North', count: 12 })
          });
          this.app.switchTab('pedestrians');
        }
      },
      {
        step: 5,
        title: "STEP 5: Pedestrians Crossing → Free-Left Becomes BLOCKED",
        desc: "Notice the Free-Left slip lane: The instant pedestrians enter the zebra crossing, Free-Left transitions from ACTIVE (🟢) to BLOCKED (🔴).",
        action: async () => {
          await this.app.loadScenario(9); // Free left conflict
          this.app.switchTab('free-left');
        }
      },
      {
        step: 6,
        title: "STEP 6: Increase Pedestrian Crowd (Dynamic Timing)",
        desc: "Large pedestrian crowd detected (45+). Rather than a fixed 20s signal, the AI dynamically grants a 40s crossing phase.",
        action: async () => {
          await fetch('/api/simulation/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'spawn_pedestrians', approach: 'East', count: 35 })
          });
          this.app.switchTab('pedestrians');
        }
      },
      {
        step: 7,
        title: "STEP 7: Activate Weekend / Festival Mode",
        desc: "Switch the system to FESTIVAL Mode. The predictive model incorporates historical crowd multipliers and tunes signal pacing.",
        action: async () => {
          await fetch('/api/simulation/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'set_mode', mode: 'FESTIVAL' })
          });
          this.app.switchTab('events');
        }
      },
      {
        step: 8,
        title: "STEP 8: Large Festival Crowd Priority",
        desc: "85+ pedestrians detected near religious temple / festival route. AI implements an All-Red Pedestrian Scramble phase with safe slip locking.",
        action: async () => {
          await this.app.loadScenario(4); // Festival crowd surge
          this.app.switchTab('live-junction');
        }
      },
      {
        step: 9,
        title: "STEP 9: Introduce Emergency Ambulance",
        desc: "Ambulance detected on South approach! Safety protocol checks pedestrian positions, allows evacuation buffer, and grants a 35s GREEN corridor.",
        action: async () => {
          await this.app.loadScenario(8); // Emergency ambulance
          this.app.switchTab('emergency');
        }
      },
      {
        step: 10,
        title: "STEP 10: Dynamic Rebalance Across All Roads",
        desc: "Traffic surges on West & North approaches. AI rebalances timings and invokes the Anti-Starvation Rule to ensure zero starved approaches.",
        action: async () => {
          await this.app.loadScenario(2); // Peak hour
          this.app.switchTab('ai-control');
        }
      },
      {
        step: 11,
        title: "STEP 11: Trigger Predicted Congestion",
        desc: "The AI Traffic Predictor forecasts 82% congestion on West approach in the next 15 minutes and proactively adjusts upcoming cycles.",
        action: async () => {
          await this.app.loadScenario(11); // Predicted congestion
          this.app.switchTab('prediction');
        }
      },
      {
        step: 12,
        title: "STEP 12: Performance Analytics & Before vs After",
        desc: "Review final system performance: Traditional Fixed Timers vs AI Adaptive System. Demonstrates measurable 45% wait time reduction & 82% safety boost!",
        action: async () => {
          this.app.switchTab('reports');
        }
      }
    ];

    this.initUI();
  }

  initUI() {
    this.banner = document.getElementById('demoTourBanner');
    this.titleEl = document.getElementById('tourStepTitle');
    this.descEl = document.getElementById('tourStepDesc');
    this.prevBtn = document.getElementById('btnTourPrev');
    this.nextBtn = document.getElementById('btnTourNext');
    this.playBtn = document.getElementById('btnTourPlay');
    this.exitBtn = document.getElementById('btnTourExit');

    if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.nextStep());
    if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.prevStep());
    if (this.playBtn) this.playBtn.addEventListener('click', () => this.toggleAutoPlay());
    if (this.exitBtn) this.exitBtn.addEventListener('click', () => this.hide());
  }

  show() {
    if (this.banner) this.banner.style.display = 'flex';
    this.renderStep(this.currentStep);
  }

  hide() {
    if (this.banner) this.banner.style.display = 'none';
    this.stopAutoPlay();
  }

  async renderStep(stepNum) {
    this.currentStep = Math.max(1, Math.min(this.totalSteps, stepNum));
    const stepData = this.steps[this.currentStep - 1];

    if (this.titleEl) this.titleEl.textContent = `[${this.currentStep}/${this.totalSteps}] ${stepData.title}`;
    if (this.descEl) this.descEl.textContent = stepData.desc;

    if (this.prevBtn) this.prevBtn.disabled = (this.currentStep === 1);
    if (this.nextBtn) this.nextBtn.textContent = (this.currentStep === this.totalSteps) ? "Finish Tour ✓" : "Next Step ➔";

    // Execute step action
    if (stepData.action) {
      await stepData.action();
    }
  }

  nextStep() {
    if (this.currentStep >= this.totalSteps) {
      this.hide();
      return;
    }
    this.renderStep(this.currentStep + 1);
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.renderStep(this.currentStep - 1);
    }
  }

  toggleAutoPlay() {
    if (this.isAutoPlaying) {
      this.stopAutoPlay();
    } else {
      this.startAutoPlay();
    }
  }

  startAutoPlay() {
    this.isAutoPlaying = true;
    if (this.playBtn) this.playBtn.textContent = "⏸ Pause Tour";
    this.autoPlayTimer = setInterval(() => {
      if (this.currentStep < this.totalSteps) {
        this.nextStep();
      } else {
        this.stopAutoPlay();
      }
    }, 6000);
  }

  stopAutoPlay() {
    this.isAutoPlaying = false;
    if (this.playBtn) this.playBtn.textContent = "▶ Auto-Play Tour";
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
    }
  }
}
