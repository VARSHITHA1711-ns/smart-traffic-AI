/**
 * ============================================================================
 * MAIN DASHBOARD CONTROLLER
 * Coordinates 12 views, state synchronization, REST API integration, and controls
 * ============================================================================
 */

class TrafficAppController {
  constructor() {
    this.canvasManager = null;
    this.aiManager = null;
    this.analyticsManager = null;
    this.tourManager = null;
    this.activeTab = 'dashboard';
    this.currentState = null;
    this.pollInterval = null;

    document.addEventListener('DOMContentLoaded', () => this.init());
  }

  async init() {
    console.log("🚦 Initializing Smart Traffic AI Control Center...");

    // Initialize sub-managers
    this.canvasManager = new JunctionCanvas('junctionCanvas');
    this.aiManager = new AIDecisionManager();
    this.analyticsManager = new AnalyticsManager();
    this.tourManager = new DemoTourManager(this);

    this.bindEvents();
    this.bindControls();

    // Start state polling
    await this.fetchStatus();
    this.pollInterval = setInterval(() => this.fetchStatus(), 1000);

    // Initial background loads
    this.loadEvents();
    this.loadSettings();
    this.loadDecisionsHistory();
  }

  bindEvents() {
    // Camera Angle Selector
    const camSelect = document.getElementById('cameraAngleSelect');
    if (camSelect) {
      camSelect.addEventListener('change', (e) => {
        if (this.canvasManager) {
          this.canvasManager.cameraView = e.target.value;
        }
      });
    }

    // 12-Tab Switching
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetView = tab.getAttribute('data-target');
        this.switchTab(targetView);
      });
    });

    // Tour Launch Button
    const startTourBtn = document.getElementById('btnStartTour');
    if (startTourBtn) {
      startTourBtn.addEventListener('click', () => {
        this.tourManager.show();
      });
    }

    // Audio Mute Toggle
    const audioBtn = document.getElementById('btnToggleAudio');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        if (!this.canvasManager) return;
        this.canvasManager.audioEnabled = !this.canvasManager.audioEnabled;
        audioBtn.textContent = this.canvasManager.audioEnabled ? "🔊 Sound ON" : "🔇 Sound OFF";
        if (this.canvasManager.audioEnabled && this.canvasManager.audioCtx) {
          if (this.canvasManager.audioCtx.state === 'suspended') {
            this.canvasManager.audioCtx.resume();
          }
        }
      });
    }

    // Bounding Box Toggle
    const bboxBtn = document.getElementById('btnToggleBBoxes');
    if (bboxBtn) {
      bboxBtn.addEventListener('click', () => {
        if (!this.canvasManager) return;
        this.canvasManager.showBoundingBoxes = !this.canvasManager.showBoundingBoxes;
        bboxBtn.classList.toggle('active', this.canvasManager.showBoundingBoxes);
      });
    }

    // Quick Scenario Buttons (1 through 12)
    const scenarioChips = document.querySelectorAll('.scenario-chip');
    scenarioChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const sid = chip.getAttribute('data-scenario');
        this.loadScenario(sid);
      });
    });

    // Print / Export Report Button
    const printBtn = document.getElementById('btnPrintReport');
    if (printBtn) {
      printBtn.addEventListener('click', () => window.print());
    }
  }

  bindControls() {
    // Spawner buttons
    const spawnButtons = document.querySelectorAll('[data-spawn-type]');
    spawnButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const vType = btn.getAttribute('data-spawn-type');
        const approachSelect = document.getElementById('spawnApproachSelect');
        const approach = approachSelect ? approachSelect.value : 'North';
        await fetch('/api/simulation/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'spawn_vehicle', approach: approach, type: vType })
        });
      });
    });

    // Pedestrian spawn buttons
    const pedButtons = document.querySelectorAll('[data-spawn-ped]');
    pedButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const count = parseInt(btn.getAttribute('data-spawn-ped'), 10);
        const approachSelect = document.getElementById('spawnApproachSelect');
        const approach = approachSelect ? approachSelect.value : 'North';
        await fetch('/api/simulation/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'spawn_pedestrians', approach: approach, count: count })
        });
      });
    });

    // Speed buttons
    const speedButtons = document.querySelectorAll('[data-sim-speed]');
    speedButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const speed = parseFloat(btn.getAttribute('data-sim-speed'));
        speedButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        await fetch('/api/simulation/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set_speed', speed: speed })
        });
      });
    });

    // AI Adaptive Toggle
    const toggleAiBtn = document.getElementById('btnToggleAi');
    if (toggleAiBtn) {
      toggleAiBtn.addEventListener('click', async () => {
        const isEnabled = this.currentState ? this.currentState.ai_adaptive_enabled : true;
        const newState = !isEnabled;
        await fetch('/api/simulation/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'toggle_ai', enabled: newState })
        });
      });
    }

    // Smart Free-Left Toggle
    const toggleFlBtn = document.getElementById('btnToggleSmartFL');
    if (toggleFlBtn) {
      toggleFlBtn.addEventListener('click', async () => {
        const isEnabled = this.currentState ? this.currentState.free_left_smart_enabled : true;
        const newState = !isEnabled;
        await fetch('/api/simulation/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'toggle_free_left', enabled: newState })
        });
      });
    }

    // Mode Selector Dropdown
    const modeSelect = document.getElementById('globalModeSelect');
    if (modeSelect) {
      modeSelect.addEventListener('change', async () => {
        await fetch('/api/simulation/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set_mode', mode: modeSelect.value })
        });
      });
    }

    // Emergency Triggers
    const triggerAmbulanceBtn = document.getElementById('btnTriggerAmbulance');
    if (triggerAmbulanceBtn) {
      triggerAmbulanceBtn.addEventListener('click', async () => {
        const app = document.getElementById('emergApproachSelect') ? document.getElementById('emergApproachSelect').value : 'South';
        await fetch('/api/emergency/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approach: app, type: 'ambulance' })
        });
      });
    }

    const triggerFireBtn = document.getElementById('btnTriggerFire');
    if (triggerFireBtn) {
      triggerFireBtn.addEventListener('click', async () => {
        const app = document.getElementById('emergApproachSelect') ? document.getElementById('emergApproachSelect').value : 'South';
        await fetch('/api/emergency/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approach: app, type: 'fire_engine' })
        });
      });
    }

    const clearEmergBtn = document.getElementById('btnClearEmergency');
    if (clearEmergBtn) {
      clearEmergBtn.addEventListener('click', async () => {
        await fetch('/api/emergency/clear', { method: 'POST' });
      });
    }

    // Event Creation Modal
    const btnOpenEventModal = document.getElementById('btnOpenEventModal');
    const btnCloseEventModal = document.getElementById('btnCloseEventModal');
    const eventModal = document.getElementById('eventModal');
    const eventForm = document.getElementById('eventForm');

    if (btnOpenEventModal && eventModal) {
      btnOpenEventModal.addEventListener('click', () => eventModal.classList.add('active'));
    }
    if (btnCloseEventModal && eventModal) {
      btnCloseEventModal.addEventListener('click', () => eventModal.classList.remove('active'));
    }
    if (eventForm) {
      eventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
          name: document.getElementById('evName').value,
          event_type: document.getElementById('evType').value,
          date: document.getElementById('evDate').value,
          start_time: document.getElementById('evStart').value,
          end_time: document.getElementById('evEnd').value,
          location: document.getElementById('evLocation').value,
          expected_crowd: document.getElementById('evCrowd').value,
          expected_vehicles: document.getElementById('evVehicles').value,
          active_mode: document.getElementById('evMode').value,
          notes: document.getElementById('evNotes').value
        };
        await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        eventModal.classList.remove('active');
        eventForm.reset();
        this.loadEvents();
      });
    }

    // Settings Form Submit
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
      settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const settingsPayload = {
          pcu_twowheeler: document.getElementById('settingPcu2w').value,
          pcu_car: document.getElementById('settingPcuCar').value,
          pcu_auto: document.getElementById('settingPcuAuto').value,
          pcu_bus: document.getElementById('settingPcuBus').value,
          pcu_truck: document.getElementById('settingPcuTruck').value,
          min_green_time: document.getElementById('settingMinGreen').value,
          max_green_time: document.getElementById('settingMaxGreen').value,
          yellow_time: document.getElementById('settingYellow').value,
          starvation_threshold: document.getElementById('settingStarve').value
        };
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settingsPayload)
        });
        alert('System settings updated and applied live to the AI Engine!');
      });
    }
  }

  switchTab(targetView) {
    this.activeTab = targetView;
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-target') === targetView);
    });

    const views = document.querySelectorAll('.view-section');
    views.forEach(v => {
      v.classList.toggle('active', v.id === `view-${targetView}`);
    });

    // Seamless Canvas Reparenting
    const canvasWrap = document.getElementById('junctionCanvasWrapper');
    if (targetView === 'live-junction') {
      const liveHost = document.getElementById('liveJunctionCanvasHost');
      if (liveHost && canvasWrap && canvasWrap.parentElement !== liveHost) {
        liveHost.appendChild(canvasWrap);
      }
      if (this.canvasManager) {
        setTimeout(() => this.canvasManager.resizeCanvas(), 50);
      }
    } else if (targetView === 'dashboard') {
      const dashHost = document.getElementById('dashboardCanvasHost');
      if (dashHost && canvasWrap && canvasWrap.parentElement !== dashHost) {
        dashHost.appendChild(canvasWrap);
      }
      if (this.canvasManager) {
        setTimeout(() => this.canvasManager.resizeCanvas(), 50);
      }
    }

    if (targetView === 'analytics' && this.analyticsManager) {
      this.analyticsManager.refreshData();
    }
    if (targetView === 'prediction') {
      this.fetchPredictions();
    }
    if (targetView === 'reports') {
      this.fetchComparison();
    }
  }

  async loadScenario(scenarioId) {
    try {
      const res = await fetch('/api/scenario/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: scenarioId })
      });
      const data = await res.json();
      if (data.state) {
        this.renderState(data.state);
      }
    } catch (e) {
      console.warn("Error loading scenario", e);
    }
  }

  async fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      this.currentState = data;
      this.renderState(data);
    } catch (e) {
      console.warn("Failed to fetch traffic status", e);
    }
  }

  renderState(state) {
    if (!state) return;

    // 1. Pass state to Canvas
    if (this.canvasManager) {
      this.canvasManager.updateState(state);
    }

    // 2. Update Header Elements
    const modeBadge = document.getElementById('headerModeBadge');
    if (modeBadge) {
      modeBadge.textContent = state.current_mode;
    }
    const modeSelect = document.getElementById('globalModeSelect');
    if (modeSelect && modeSelect.value !== state.current_mode) {
      modeSelect.value = state.current_mode;
    }

    const emergBeacon = document.getElementById('headerEmergencyBeacon');
    if (emergBeacon) {
      emergBeacon.classList.toggle('active', !!(state.emergency_state && state.emergency_state.active));
    }

    // AI Adaptive Switch text
    const btnToggleAi = document.getElementById('btnToggleAi');
    if (btnToggleAi) {
      btnToggleAi.textContent = state.ai_adaptive_enabled ? "🧠 AI Adaptive: ON" : "⏱ Fixed 60s: ON";
      btnToggleAi.classList.toggle('active', state.ai_adaptive_enabled);
    }

    // Smart Free-Left Switch text
    const btnToggleSmartFL = document.getElementById('btnToggleSmartFL');
    if (btnToggleSmartFL) {
      btnToggleSmartFL.textContent = state.free_left_smart_enabled ? "↩️ Smart Free-Left: ON" : "↩️ Free-Left: UNMONITORED";
      btnToggleSmartFL.classList.toggle('active', state.free_left_smart_enabled);
    }

    // 3. Update Overall KPIs
    let totalVehs = 0;
    let totalPeds = 0;
    let totalWait = 0;
    let totalQueue = 0;
    const approachesList = Object.values(state.approaches || {});

    approachesList.forEach(app => {
      totalVehs += app.vehicle_count || 0;
      totalPeds += (app.pedestrians_waiting || 0) + (app.pedestrians_crossing || 0);
      totalWait += app.wait_time || 0;
      totalQueue += app.queue_length || 0;
    });

    const avgWait = (totalWait / Math.max(1, approachesList.length)).toFixed(0);
    const avgQueue = (totalQueue / Math.max(1, approachesList.length)).toFixed(1);

    this.setText('kpiTotalVehicles', totalVehs);
    this.setText('kpiTotalPedestrians', totalPeds);
    this.setText('kpiAvgWait', `${avgWait}s`);
    this.setText('kpiAvgQueue', `${avgQueue} vehs`);
    this.setText('kpiSafetyScore', `${state.safety_score}/100`);
    this.setText('kpiEfficiency', `${state.efficiency_score}%`);

    // 4. Update 4-Approach Directional Cards
    ['North', 'South', 'East', 'West'].forEach(app => {
      const appData = state.approaches[app];
      if (!appData) return;

      const isCurrentActive = state.active_approach === app;
      const cardEl = document.getElementById(`cardApp-${app}`);
      if (cardEl) {
        cardEl.classList.toggle('is-green', isCurrentActive && state.active_signal_phase === 'GREEN');
        cardEl.classList.toggle('is-emergency', !!(state.emergency_state && state.emergency_state.approach === app));
      }

      // Signal status pill
      const sigPill = document.getElementById(`sigPill-${app}`);
      if (sigPill) {
        sigPill.className = `signal-status-pill ${appData.signal_state.toLowerCase()}`;
        const timerText = isCurrentActive ? `${state.phase_remaining}s` : '';
        sigPill.innerHTML = `<span>${appData.signal_state}</span> <span class="timer-countdown">${timerText}</span>`;
      }

      // Density Progress Bar
      const densFill = document.getElementById(`densityFill-${app}`);
      const densVal = document.getElementById(`densityVal-${app}`);
      const densBadge = document.getElementById(`densityBadge-${app}`);
      if (densFill) {
        densFill.style.width = `${appData.density_pct}%`;
        densFill.className = `density-fill ${appData.density_level.toLowerCase()}`;
      }
      if (densVal) densVal.textContent = `${appData.density_pct}%`;
      if (densBadge) {
        densBadge.textContent = appData.density_badge;
      }

      // Mini metrics
      this.setText(`vehCount-${app}`, appData.vehicle_count);
      this.setText(`queueLen-${app}`, appData.queue_length);
      this.setText(`waitTime-${app}`, `${appData.wait_time.toFixed(0)}s`);

      // Free-Left Badge
      const flBadge = document.getElementById(`flBadge-${app}`);
      if (flBadge) {
        flBadge.className = `free-left-badge ${appData.free_left_state.toLowerCase()}`;
        flBadge.textContent = appData.free_left_state;
      }

      // Pedestrian Count
      this.setText(`pedCount-${app}`, `${appData.pedestrians_waiting} wait / ${appData.pedestrians_crossing} cross`);

      // Vehicle Chips
      const chipsEl = document.getElementById(`vehChips-${app}`);
      if (chipsEl && appData.vehicle_breakdown) {
        const b = appData.vehicle_breakdown;
        chipsEl.innerHTML = `
          <span class="veh-chip">🏍️ ${b.twowheeler}</span>
          <span class="veh-chip">🚗 ${b.car}</span>
          <span class="veh-chip">🛺 ${b.auto}</span>
          <span class="veh-chip">🚌 ${b.bus}</span>
          <span class="veh-chip">🚚 ${b.truck}</span>
        `;
      }
    });

    // 5. Update Explainable AI & Advisor
    if (this.aiManager) {
      this.aiManager.updateLatestDecision(state.last_decision, state.approaches);
      this.aiManager.updateAdvisorTicker(state.advisor_messages);
    }

    // 6. Update Analytics density chart
    if (this.analyticsManager) {
      this.analyticsManager.updateLiveApproachDensity(state.approaches);
    }

    // 7. Update Free-Left Tab cards
    this.renderFreeLeftView(state);

    // 8. Update Pedestrian Tab cards
    this.renderPedestrianView(state);

    // 9. Update Emergency Tab
    this.renderEmergencyView(state);
  }

  renderFreeLeftView(state) {
    ['North', 'South', 'East', 'West'].forEach(app => {
      const appData = state.approaches[app];
      if (!appData) return;

      const card = document.getElementById(`flViewCard-${app}`);
      const badge = document.getElementById(`flViewBadge-${app}`);
      const reason = document.getElementById(`flViewReason-${app}`);

      if (card) card.classList.toggle('blocked-state', appData.free_left_state === 'BLOCKED');
      if (badge) {
        badge.className = `free-left-badge ${appData.free_left_state.toLowerCase()}`;
        badge.textContent = appData.free_left_state;
      }
      if (reason) reason.textContent = appData.free_left_reason;
    });
  }

  renderPedestrianView(state) {
    let maxWait = 0;
    let totalCrossing = 0;
    Object.values(state.approaches).forEach(a => {
      maxWait = Math.max(maxWait, a.pedestrians_waiting || 0);
      totalCrossing += a.pedestrians_crossing || 0;
    });

    this.setText('pedActiveCrossCount', totalCrossing);
    this.setText('pedMaxWaitCrowd', maxWait);

    // Current Dynamic Tier
    let tierText = "Tier 1: 20s (Low < 15)";
    if (maxWait > 70) tierText = "Tier 4: 55-60s (Very High 70+)";
    else if (maxWait > 35) tierText = "Tier 3: 40s (High 36-70)";
    else if (maxWait >= 15) tierText = "Tier 2: 30s (Medium 15-35)";

    this.setText('pedDynamicTierBadge', tierText);
  }

  renderEmergencyView(state) {
    const emerg = state.emergency_state;
    const statusEl = document.getElementById('emergActiveStatus');
    const clearanceEl = document.getElementById('emergClearanceStatus');

    if (emerg && emerg.active) {
      if (statusEl) statusEl.innerHTML = `<span style="color: #ef4444; font-weight: 800;">🚨 ACTIVE: ${emerg.type} on ${emerg.approach} Approach</span>`;
      if (clearanceEl) {
        if (emerg.needs_clearance) {
          clearanceEl.innerHTML = `<span style="color: #f59e0b;">⏳ Pedestrian Safety Evacuation Countdown: <strong>${Math.ceil(emerg.clearance_countdown)}s</strong></span>`;
        } else {
          clearanceEl.innerHTML = `<span style="color: #10b981;">✓ Green Corridor Established (35s transit guarantee)</span>`;
        }
      }
    } else {
      if (statusEl) statusEl.innerHTML = `<span style="color: #10b981;">🟢 Standby: No emergency vehicles in transit</span>`;
      if (clearanceEl) clearanceEl.innerHTML = `<span style="color: var(--text-dim);">Ready for instant preemption protocol</span>`;
    }
  }

  async fetchPredictions() {
    try {
      const res = await fetch('/api/predictions');
      const data = await res.json();

      if (data.proactive_alert) {
        const alertBox = document.getElementById('predictionAlertBanner');
        if (alertBox) {
          alertBox.style.display = 'block';
          alertBox.innerHTML = `<strong>⚠️ ${data.proactive_alert.level}:</strong> ${data.proactive_alert.text}`;
        }
      }

      // Populate 5m, 15m, 30m cards
      ['5m', '15m', '30m'].forEach(hKey => {
        const hData = data.horizons[hKey];
        if (!hData) return;

        this.setText(`predTime-${hKey}`, `${hData.target_time} (+${hData.horizon_minutes}m)`);
        this.setText(`predBottleneck-${hKey}`, `${hData.peak_bottleneck} Approach`);
        this.setText(`predProb-${hKey}`, `${hData.max_congestion_prob}% Probability`);

        const recsEl = document.getElementById(`predRecs-${hKey}`);
        if (recsEl && hData.recommendations) {
          recsEl.innerHTML = hData.recommendations.map(r => `<li>⚡ ${r}</li>`).join('');
        }
      });
    } catch (e) {
      console.warn("Error fetching predictions", e);
    }
  }

  async fetchComparison() {
    try {
      const res = await fetch('/api/comparison');
      const data = await res.json();

      this.setText('compTradWait', `${data.traditional.avg_wait_time}s`);
      this.setText('compTradQueue', `${data.traditional.avg_queue_length} vehs`);
      this.setText('compTradPed', data.traditional.pedestrian_priority);
      this.setText('compTradEmerg', data.traditional.emergency_priority);
      this.setText('compTradFL', data.traditional.dynamic_free_left);
      this.setText('compTradSafety', `${data.traditional.safety_score}/100`);

      this.setText('compAiWait', `${data.ai_adaptive.avg_wait_time}s`);
      this.setText('compAiQueue', `${data.ai_adaptive.avg_queue_length} vehs`);
      this.setText('compAiPed', data.ai_adaptive.pedestrian_priority);
      this.setText('compAiEmerg', data.ai_adaptive.emergency_priority);
      this.setText('compAiFL', data.ai_adaptive.dynamic_free_left);
      this.setText('compAiSafety', `${data.ai_adaptive.safety_score}/100`);

      this.setText('impWaitPct', `-${data.improvements.wait_time_reduction_pct}%`);
      this.setText('impQueuePct', `-${data.improvements.queue_reduction_pct}%`);
      this.setText('impSafetyPct', `+${data.improvements.pedestrian_safety_improvement_pct}%`);
      this.setText('impThroughputPct', `+${data.improvements.junction_throughput_increase_pct}%`);
    } catch (e) {
      console.warn("Error fetching comparison", e);
    }
  }

  async loadEvents() {
    try {
      const res = await fetch('/api/events');
      const events = await res.json();
      const body = document.getElementById('eventsTableBody');
      if (!body) return;

      body.innerHTML = '';
      events.forEach(ev => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${ev.name}</strong></td>
          <td><span class="veh-chip" style="color: #00f2fe;">${ev.event_type}</span></td>
          <td>${ev.date} (${ev.start_time} - ${ev.end_time})</td>
          <td>${ev.location}</td>
          <td><span style="color: #ec4899; font-weight: 700;">🚶 ${ev.expected_crowd}</span></td>
          <td><span style="color: #3b82f6; font-weight: 700;">🚗 ${ev.expected_vehicles}</span></td>
          <td><span class="free-left-badge active">${ev.active_mode}</span></td>
          <td><button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="window.appController.deleteEvent(${ev.id})">Delete</button></td>
        `;
        body.appendChild(tr);
      });
    } catch (e) {
      console.warn("Error loading events", e);
    }
  }

  async deleteEvent(eventId) {
    await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
    this.loadEvents();
  }

  async loadSettings() {
    try {
      const res = await fetch('/api/settings');
      const settings = await res.json();
      
      const setVal = (id, key) => {
        const el = document.getElementById(id);
        if (el && settings[key]) el.value = settings[key].value;
      };

      setVal('settingPcu2w', 'pcu_twowheeler');
      setVal('settingPcuCar', 'pcu_car');
      setVal('settingPcuAuto', 'pcu_auto');
      setVal('settingPcuBus', 'pcu_bus');
      setVal('settingPcuTruck', 'pcu_truck');
      setVal('settingMinGreen', 'min_green_time');
      setVal('settingMaxGreen', 'max_green_time');
      setVal('settingYellow', 'yellow_time');
      setVal('settingStarve', 'starvation_threshold');
    } catch (e) {
      console.warn("Error loading settings", e);
    }
  }

  async loadDecisionsHistory() {
    if (this.aiManager) {
      await this.aiManager.loadDecisionsHistory();
    }
  }

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

// Global bootstrap instance
window.appController = new TrafficAppController();
