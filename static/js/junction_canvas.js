/**
 * ============================================================================
 * JUNCTION CANVAS RENDERER - 60 FPS INTERACTIVE 4-WAY MIXED TRAFFIC SIMULATOR
 * Realistic Indian Mixed Traffic: Cars, 2-Wheelers, Autos, Buses, Trucks,
 * Ambulances, Fire Engines, Free-Left Slip Lanes, Zebra Crosswalks, AI YOLO Bounding Boxes
 * ============================================================================
 */

class JunctionCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    this.showBoundingBoxes = true;
    this.showTrajectories = false;
    this.cameraView = 'OVERVIEW'; // 'OVERVIEW', 'NORTH', 'SOUTH', 'EAST', 'WEST'
    this.audioEnabled = false;
    this.audioCtx = null;
    
    // Scale and dimension management
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;
    this.roadWidth = 140; // width of road on each arm
    this.laneWidth = this.roadWidth / 3;
    
    // Animation loop
    this.lastFrameTime = performance.now();
    this.animFrameId = null;
    this.pedAnimTick = 0;
    this.sirenFlashTick = 0;
    
    this.currentState = null;
    
    this.initAudio();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    this.startLoop();
  }

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;
  }

  initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  playBeep(freq = 800, duration = 0.08) {
    if (!this.audioEnabled || !this.audioCtx) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.05, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {}
  }

  playSiren() {
    if (!this.audioEnabled || !this.audioCtx) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      const now = this.audioCtx.currentTime;
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.linearRampToValueAtTime(1050, now + 0.25);
      osc.frequency.linearRampToValueAtTime(750, now + 0.5);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(now + 0.5);
    } catch (e) {}
  }

  updateState(state) {
    this.currentState = state;
    if (state.emergency_state && state.emergency_state.active && Math.random() < 0.25) {
      this.playSiren();
    }
  }

  startLoop() {
    const loop = (time) => {
      this.render();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.pedAnimTick += 0.05;
    this.sirenFlashTick += 0.15;
    
    // Apply camera view zoom & panning
    this.ctx.save();
    if (this.cameraView === 'NORTH') {
      this.ctx.translate(this.centerX, this.centerY);
      this.ctx.scale(1.4, 1.4);
      this.ctx.translate(-this.centerX, -(this.centerY - 90));
    } else if (this.cameraView === 'SOUTH') {
      this.ctx.translate(this.centerX, this.centerY);
      this.ctx.scale(1.4, 1.4);
      this.ctx.translate(-this.centerX, -(this.centerY + 90));
    } else if (this.cameraView === 'EAST') {
      this.ctx.translate(this.centerX, this.centerY);
      this.ctx.scale(1.4, 1.4);
      this.ctx.translate(-(this.centerX + 90), -this.centerY);
    } else if (this.cameraView === 'WEST') {
      this.ctx.translate(this.centerX, this.centerY);
      this.ctx.scale(1.4, 1.4);
      this.ctx.translate(-(this.centerX - 90), -this.centerY);
    }

    // Draw background terrain
    this.drawTerrain();
    
    // Draw roads, lane dividers, medians
    this.drawRoads();
    
    // Draw Free-Left slip lanes & corner curves
    this.drawFreeLeftSlipLanes();
    
    // Draw zebra crosswalks & stop lines
    this.drawCrosswalksAndMarkings();
    
    if (this.currentState) {
      // Draw traffic signals & countdown timers
      this.drawTrafficSignals();
      
      // Draw pedestrians
      this.drawPedestrians();
      
      // Draw vehicles
      this.drawVehicles();
    }
    
    this.ctx.restore(); // Restore camera transform

    // Draw CCTV camera overlay vignette if active
    this.drawCameraOverlay();
  }

  drawTerrain() {
    this.ctx.fillStyle = "#090f1d";
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    // Subtle city grid / building footprint background
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
    this.ctx.lineWidth = 1;
    const gridSpacing = 40;
    for (let x = 0; x < this.width; x += gridSpacing) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.height; y += gridSpacing) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
    
    // Grass/Sidewalk corners
    this.ctx.fillStyle = "#0d1829";
    const cornerSize = 130;
    // Top-left
    this.ctx.fillRect(0, 0, this.centerX - this.roadWidth, this.centerY - this.roadWidth);
    // Top-right
    this.ctx.fillRect(this.centerX + this.roadWidth, 0, this.width, this.centerY - this.roadWidth);
    // Bottom-left
    this.ctx.fillRect(0, this.centerY + this.roadWidth, this.centerX - this.roadWidth, this.height);
    // Bottom-right
    this.ctx.fillRect(this.centerX + this.roadWidth, this.centerY + this.roadWidth, this.width, this.height);
  }

  drawRoads() {
    this.ctx.save();
    
    // Main asphalt intersection
    this.ctx.fillStyle = "#111827";
    // Vertical road (North-South)
    this.ctx.fillRect(this.centerX - this.roadWidth, 0, this.roadWidth * 2, this.height);
    // Horizontal road (East-West)
    this.ctx.fillRect(0, this.centerY - this.roadWidth, this.width, this.roadWidth * 2);
    
    // Central intersection box
    this.ctx.fillStyle = "#0f172a";
    this.ctx.fillRect(this.centerX - this.roadWidth, this.centerY - this.roadWidth, this.roadWidth * 2, this.roadWidth * 2);
    
    // Road center divider / yellow median
    this.ctx.strokeStyle = "#eab308";
    this.ctx.lineWidth = 2.5;
    
    // North median
    this.ctx.beginPath();
    this.ctx.moveTo(this.centerX, 0);
    this.ctx.lineTo(this.centerX, this.centerY - this.roadWidth - 25);
    this.ctx.stroke();
    
    // South median
    this.ctx.beginPath();
    this.ctx.moveTo(this.centerX, this.centerY + this.roadWidth + 25);
    this.ctx.lineTo(this.centerX, this.height);
    this.ctx.stroke();
    
    // West median
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.centerY);
    this.ctx.lineTo(this.centerX - this.roadWidth - 25, this.centerY);
    this.ctx.stroke();
    
    // East median
    this.ctx.beginPath();
    this.ctx.moveTo(this.centerX + this.roadWidth + 25, this.centerY);
    this.ctx.lineTo(this.width, this.centerY);
    this.ctx.stroke();
    
    // Dashed white lane dividers
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([8, 8]);
    
    // North approach lanes
    this.drawDashedLine(this.centerX - this.laneWidth, 0, this.centerX - this.laneWidth, this.centerY - this.roadWidth - 25);
    this.drawDashedLine(this.centerX + this.laneWidth, 0, this.centerX + this.laneWidth, this.centerY - this.roadWidth - 25);
    
    // South approach lanes
    this.drawDashedLine(this.centerX - this.laneWidth, this.centerY + this.roadWidth + 25, this.centerX - this.laneWidth, this.height);
    this.drawDashedLine(this.centerX + this.laneWidth, this.centerY + this.roadWidth + 25, this.centerX + this.laneWidth, this.height);
    
    // West approach lanes
    this.drawDashedLine(0, this.centerY - this.laneWidth, this.centerX - this.roadWidth - 25, this.centerY - this.laneWidth);
    this.drawDashedLine(0, this.centerY + this.laneWidth, this.centerX - this.roadWidth - 25, this.centerY + this.laneWidth);
    
    // East approach lanes
    this.drawDashedLine(this.centerX + this.roadWidth + 25, this.centerY - this.laneWidth, this.width, this.centerY - this.laneWidth);
    this.drawDashedLine(this.centerX + this.roadWidth + 25, this.centerY + this.laneWidth, this.width, this.centerY + this.laneWidth);
    
    this.ctx.setLineDash([]);
    this.ctx.restore();
  }

  drawDashedLine(x1, y1, x2, y2) {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  drawFreeLeftSlipLanes() {
    this.ctx.save();
    // Curved corner slip lanes (Bypass lanes for Indian left-turn rule)
    const corners = [
      { name: "North-West", cx: this.centerX - this.roadWidth, cy: this.centerY - this.roadWidth, startAngle: Math.PI, endAngle: 1.5 * Math.PI, approach: "East" },
      { name: "North-East", cx: this.centerX + this.roadWidth, cy: this.centerY - this.roadWidth, startAngle: 1.5 * Math.PI, endAngle: 2 * Math.PI, approach: "North" },
      { name: "South-East", cx: this.centerX + this.roadWidth, cy: this.centerY + this.roadWidth, startAngle: 0, endAngle: 0.5 * Math.PI, approach: "West" },
      { name: "South-West", cx: this.centerX - this.roadWidth, cy: this.centerY + this.roadWidth, startAngle: 0.5 * Math.PI, endAngle: Math.PI, approach: "South" }
    ];

    corners.forEach(corner => {
      // Draw island curb arc
      this.ctx.strokeStyle = "rgba(0, 242, 254, 0.4)";
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(corner.cx, corner.cy, 50, corner.startAngle, corner.endAngle);
      this.ctx.stroke();
      
      // Draw slip lane path surface
      this.ctx.strokeStyle = "#162032";
      this.ctx.lineWidth = 26;
      this.ctx.beginPath();
      this.ctx.arc(corner.cx, corner.cy, 35, corner.startAngle, corner.endAngle);
      this.ctx.stroke();

      // Free-Left Signal Beacon Indicator
      if (this.currentState && this.currentState.approaches) {
        const appState = this.currentState.approaches[corner.approach];
        if (appState) {
          const flState = appState.free_left_state;
          let flColor = "#10b981";
          if (flState === "CONTROLLED") flColor = "#f59e0b";
          if (flState === "BLOCKED") flColor = "#ef4444";
          
          // Draw beacon circle
          const bx = corner.cx + Math.cos((corner.startAngle + corner.endAngle) / 2) * 55;
          const by = corner.cy + Math.sin((corner.startAngle + corner.endAngle) / 2) * 55;
          
          this.ctx.fillStyle = flColor;
          this.ctx.shadowColor = flColor;
          this.ctx.shadowBlur = 12;
          this.ctx.beginPath();
          this.ctx.arc(bx, by, 7, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.shadowBlur = 0;
          
          // Small text tag
          this.ctx.fillStyle = "#ffffff";
          this.ctx.font = "bold 9px var(--font-mono)";
          this.ctx.textAlign = "center";
          this.ctx.fillText(`FL: ${flState[0]}`, bx, by - 10);
        }
      }
    });

    this.ctx.restore();
  }

  drawCrosswalksAndMarkings() {
    this.ctx.save();
    
    // Stop lines (thick solid white before intersection)
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineWidth = 4;
    
    // North stopline (incoming is left side in India, i.e., x: centerX - roadWidth to centerX)
    this.ctx.beginPath();
    this.ctx.moveTo(this.centerX - this.roadWidth, this.centerY - this.roadWidth - 25);
    this.ctx.lineTo(this.centerX, this.centerY - this.roadWidth - 25);
    this.ctx.stroke();
    
    // South stopline
    this.ctx.beginPath();
    this.ctx.moveTo(this.centerX, this.centerY + this.roadWidth + 25);
    this.ctx.lineTo(this.centerX + this.roadWidth, this.centerY + this.roadWidth + 25);
    this.ctx.stroke();
    
    // West stopline
    this.ctx.beginPath();
    this.ctx.moveTo(this.centerX - this.roadWidth - 25, this.centerY);
    this.ctx.lineTo(this.centerX - this.roadWidth - 25, this.centerY + this.roadWidth);
    this.ctx.stroke();
    
    // East stopline
    this.ctx.beginPath();
    this.ctx.moveTo(this.centerX + this.roadWidth + 25, this.centerY - this.roadWidth);
    this.ctx.lineTo(this.centerX + this.roadWidth + 25, this.centerY);
    this.ctx.stroke();
    
    // Zebra crosswalks (striped bars)
    this.drawZebraCrossing(this.centerX - this.roadWidth, this.centerY - this.roadWidth - 22, this.roadWidth * 2, 18, true); // North
    this.drawZebraCrossing(this.centerX - this.roadWidth, this.centerY + this.roadWidth + 4, this.roadWidth * 2, 18, true); // South
    this.drawZebraCrossing(this.centerX - this.roadWidth - 22, this.centerY - this.roadWidth, 18, this.roadWidth * 2, false); // West
    this.drawZebraCrossing(this.centerX + this.roadWidth + 4, this.centerY - this.roadWidth, 18, this.roadWidth * 2, false); // East

    this.ctx.restore();
  }

  drawZebraCrossing(x, y, w, h, isHorizontal) {
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    const barWidth = 6;
    const gap = 6;
    
    if (isHorizontal) {
      for (let px = x + 4; px < x + w - 4; px += barWidth + gap) {
        this.ctx.fillRect(px, y, barWidth, h);
      }
    } else {
      for (let py = y + 4; py < y + h - 4; py += barWidth + gap) {
        this.ctx.fillRect(x, py, w, barWidth);
      }
    }
  }

  drawTrafficSignals() {
    this.ctx.save();
    
    const signals = [
      { approach: "North", x: this.centerX - this.roadWidth - 14, y: this.centerY - this.roadWidth - 35, angle: 0 },
      { approach: "South", x: this.centerX + this.roadWidth + 14, y: this.centerY + this.roadWidth + 35, angle: Math.PI },
      { approach: "West", x: this.centerX - this.roadWidth - 35, y: this.centerY + this.roadWidth + 14, angle: -Math.PI / 2 },
      { approach: "East", x: this.centerX + this.roadWidth + 35, y: this.centerY - this.roadWidth - 14, angle: Math.PI / 2 }
    ];

    signals.forEach(sig => {
      const appState = this.currentState.approaches[sig.approach];
      if (!appState) return;

      const state = appState.signal_state;
      const timer = this.currentState.active_approach === sig.approach ? this.currentState.phase_remaining : 0;
      
      // Draw housing box
      this.ctx.fillStyle = "#020617";
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      this.ctx.lineWidth = 1.5;
      
      const boxW = 20;
      const boxH = 46;
      this.ctx.fillRect(sig.x - boxW / 2, sig.y - boxH / 2, boxW, boxH);
      this.ctx.strokeRect(sig.x - boxW / 2, sig.y - boxH / 2, boxW, boxH);
      
      // Draw 3 lenses (Red, Yellow, Green)
      const lensR = 4.5;
      const lensSpacing = 12;
      
      // Red
      this.ctx.fillStyle = (state === "RED") ? "#ff334b" : "#450a0a";
      if (state === "RED") {
        this.ctx.shadowColor = "#ff334b";
        this.ctx.shadowBlur = 10;
      }
      this.ctx.beginPath();
      this.ctx.arc(sig.x, sig.y - lensSpacing, lensR, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
      
      // Yellow
      this.ctx.fillStyle = (state === "YELLOW") ? "#ffb703" : "#422006";
      if (state === "YELLOW") {
        this.ctx.shadowColor = "#ffb703";
        this.ctx.shadowBlur = 10;
      }
      this.ctx.beginPath();
      this.ctx.arc(sig.x, sig.y, lensR, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
      
      // Green
      this.ctx.fillStyle = (state === "GREEN") ? "#00f59b" : "#022c22";
      if (state === "GREEN") {
        this.ctx.shadowColor = "#00f59b";
        this.ctx.shadowBlur = 12;
      }
      this.ctx.beginPath();
      this.ctx.arc(sig.x, sig.y + lensSpacing, lensR, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
      
      // Countdown Timer Badge
      if (state === "GREEN" || state === "YELLOW") {
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        this.ctx.fillRect(sig.x - 12, sig.y - boxH / 2 - 16, 24, 14);
        this.ctx.fillStyle = (state === "GREEN") ? "#00f59b" : "#ffb703";
        this.ctx.font = "bold 10px var(--font-mono)";
        this.ctx.textAlign = "center";
        this.ctx.fillText(`${timer}s`, sig.x, sig.y - boxH / 2 - 5);
      }
    });

    this.ctx.restore();
  }

  drawPedestrians() {
    this.ctx.save();
    
    // Draw pedestrians crossing zebra crosswalks
    const crosswalkPositions = {
      "North": { x1: this.centerX - this.roadWidth + 10, y: this.centerY - this.roadWidth - 13, x2: this.centerX + this.roadWidth - 10, dir: "horizontal" },
      "South": { x1: this.centerX - this.roadWidth + 10, y: this.centerY + this.roadWidth + 13, x2: this.centerX + this.roadWidth - 10, dir: "horizontal" },
      "West": { y1: this.centerY - this.roadWidth + 10, x: this.centerX - this.roadWidth - 13, y2: this.centerY + this.roadWidth - 10, dir: "vertical" },
      "East": { y1: this.centerY - this.roadWidth + 10, x: this.centerX + this.roadWidth + 13, y2: this.centerY + this.roadWidth - 10, dir: "vertical" }
    };

    APPROACH_NAMES.forEach(app => {
      const appState = this.currentState.approaches[app];
      if (!appState) return;

      const pedsCrossing = appState.pedestrians_crossing || 0;
      const pedsWaiting = appState.pedestrians_waiting || 0;
      const pos = crosswalkPositions[app];

      // 1. Draw Waiting Pedestrians cluster on sidewalks
      if (pedsWaiting > 0) {
        const clusterSize = Math.min(18, pedsWaiting);
        for (let i = 0; i < clusterSize; i++) {
          const offsetX = (i % 4) * 6 - 8;
          const offsetY = Math.floor(i / 4) * 6;
          let wx = 0, wy = 0;
          if (app === "North") { wx = this.centerX - this.roadWidth - 12 + offsetX; wy = this.centerY - this.roadWidth - 15 + offsetY; }
          if (app === "South") { wx = this.centerX + this.roadWidth + 12 + offsetX; wy = this.centerY + this.roadWidth + 15 + offsetY; }
          if (app === "West") { wx = this.centerX - this.roadWidth - 15 + offsetX; wy = this.centerY + this.roadWidth + 12 + offsetY; }
          if (app === "East") { wx = this.centerX + this.roadWidth + 15 + offsetX; wy = this.centerY - this.roadWidth - 12 + offsetY; }

          this.drawHumanFigure(wx, wy, "#a855f7", false);
        }
        
        // Pedestrian Count Tag
        let tx = 0, ty = 0;
        if (app === "North") { tx = this.centerX - this.roadWidth - 25; ty = this.centerY - this.roadWidth - 25; }
        if (app === "South") { tx = this.centerX + this.roadWidth + 25; ty = this.centerY + this.roadWidth + 25; }
        if (app === "West") { tx = this.centerX - this.roadWidth - 25; ty = this.centerY + this.roadWidth + 25; }
        if (app === "East") { tx = this.centerX + this.roadWidth + 25; ty = this.centerY - this.roadWidth - 25; }
        
        this.ctx.fillStyle = "#c084fc";
        this.ctx.font = "bold 9px var(--font-sans)";
        this.ctx.textAlign = "center";
        this.ctx.fillText(`🚶 ${pedsWaiting} waiting`, tx, ty);
      }

      // 2. Draw Actively Crossing Pedestrians
      if (pedsCrossing > 0) {
        const drawCount = Math.min(22, pedsCrossing);
        for (let i = 0; i < drawCount; i++) {
          const progress = ((this.pedAnimTick * 0.4 + (i / drawCount)) % 1.0);
          let px = 0, py = 0;
          if (pos.dir === "horizontal") {
            px = pos.x1 + progress * (pos.x2 - pos.x1);
            py = pos.y + ((i % 3) - 1) * 4;
          } else {
            py = pos.y1 + progress * (pos.y2 - pos.y1);
            px = pos.x + ((i % 3) - 1) * 4;
          }
          this.drawHumanFigure(px, py, "#ec4899", true);
        }

        // Bounding Box for Pedestrian Group (YOLO Vision)
        if (this.showBoundingBoxes) {
          this.ctx.strokeStyle = "#ec4899";
          this.ctx.lineWidth = 1;
          this.ctx.setLineDash([3, 3]);
          if (pos.dir === "horizontal") {
            this.ctx.strokeRect(pos.x1, pos.y - 10, pos.x2 - pos.x1, 20);
            this.drawDetectionTag(pos.x1 + 10, pos.y - 14, `Pedestrians [${pedsCrossing}] 97%`, "#ec4899");
          } else {
            this.ctx.strokeRect(pos.x - 10, pos.y1, 20, pos.y2 - pos.y1);
            this.drawDetectionTag(pos.x - 10, pos.y1 - 6, `Pedestrians [${pedsCrossing}] 97%`, "#ec4899");
          }
          this.ctx.setLineDash([]);
        }
      }
    });

    this.ctx.restore();
  }

  drawHumanFigure(x, y, color = "#a855f7", isWalking = false) {
    this.ctx.fillStyle = color;
    // Head
    this.ctx.beginPath();
    this.ctx.arc(x, y - 4, 2.5, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Body
    this.ctx.fillRect(x - 2, y - 2, 4, 5);
    
    // Legs
    const legOffset = isWalking ? Math.sin(this.pedAnimTick * 4) * 2 : 0;
    this.ctx.fillRect(x - 2, y + 3, 1.5, 3 + legOffset);
    this.ctx.fillRect(x + 0.5, y + 3, 1.5, 3 - legOffset);
  }

  drawVehicles() {
    this.ctx.save();

    APPROACH_NAMES.forEach(app => {
      const appState = this.currentState.approaches[app];
      if (!appState) return;

      const allVehs = [...(appState.vehicles || []), ...(appState.free_left_vehicles || [])];
      
      allVehs.forEach(v => {
        this.renderSingleVehicle(v, app);
      });
    });

    this.ctx.restore();
  }

  renderSingleVehicle(vehicle, approach) {
    // Coordinate mapping based on distance from stopline
    // Stop line coordinates:
    // North: x = centerX - (lane + 0.5)*laneWidth, y = centerY - roadWidth - 25 - distance*3.5
    // South: x = centerX + (lane + 0.5)*laneWidth, y = centerY + roadWidth + 25 + distance*3.5
    // West:  x = centerX - roadWidth - 25 - distance*3.5, y = centerY + (lane + 0.5)*laneWidth
    // East:  x = centerX + roadWidth + 25 + distance*3.5, y = centerY - (lane + 0.5)*laneWidth

    const pxPerMeter = 3.2;
    let x = 0, y = 0, angle = 0;
    const laneOffset = (vehicle.lane + 0.5) * this.laneWidth;

    if (approach === "North") {
      angle = Math.PI / 2; // facing South
      x = this.centerX - laneOffset;
      y = (this.centerY - this.roadWidth - 25) - (vehicle.distance * pxPerMeter);
      if (vehicle.in_intersection && vehicle.turning === "left") {
        // Curve to East
        angle = Math.PI;
      }
    } else if (approach === "South") {
      angle = -Math.PI / 2; // facing North
      x = this.centerX + laneOffset;
      y = (this.centerY + this.roadWidth + 25) + (vehicle.distance * pxPerMeter);
    } else if (approach === "West") {
      angle = 0; // facing East
      x = (this.centerX - this.roadWidth - 25) - (vehicle.distance * pxPerMeter);
      y = this.centerY + laneOffset;
    } else if (approach === "East") {
      angle = Math.PI; // facing West
      x = (this.centerX + this.roadWidth + 25) + (vehicle.distance * pxPerMeter);
      y = this.centerY - laneOffset;
    }

    // Don't draw if outside viewport
    if (x < -50 || x > this.width + 50 || y < -50 || y > this.height + 50) return;

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(angle);

    // Physical dimensions based on vehicle type
    let w = vehicle.length * pxPerMeter;
    let h = 14;
    if (vehicle.type === "twowheeler") { w = 10; h = 6; }
    if (vehicle.type === "auto") { w = 15; h = 12; }
    if (vehicle.type === "bus") { w = 42; h = 18; }
    if (vehicle.type === "truck") { w = 46; h = 18; }
    if (vehicle.type === "ambulance") { w = 24; h = 15; }
    if (vehicle.type === "fire_engine") { w = 38; h = 18; }

    // Draw vehicle chassis
    this.drawChassis(vehicle, w, h);

    // Emergency Flashing Beacon
    if (vehicle.is_emergency) {
      const isRedFlash = Math.sin(this.sirenFlashTick * 6) > 0;
      const beaconColor = isRedFlash ? "#ef4444" : "#3b82f6";
      this.ctx.fillStyle = beaconColor;
      this.ctx.shadowColor = beaconColor;
      this.ctx.shadowBlur = 18;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }

    this.ctx.restore();

    // AI YOLO Bounding Box & Label Tag
    if (this.showBoundingBoxes) {
      this.ctx.save();
      const bColor = vehicle.is_emergency ? "#ef4444" : "#00f2fe";
      this.ctx.strokeStyle = bColor;
      this.ctx.lineWidth = 1;
      
      const boxSize = Math.max(w, h) + 6;
      this.ctx.strokeRect(x - boxSize / 2, y - boxSize / 2, boxSize, boxSize);
      
      const typeLabel = vehicle.type.toUpperCase();
      const conf = (91 + ((vehicle.id * 7) % 8)).toFixed(0);
      this.drawDetectionTag(x - boxSize / 2, y - boxSize / 2 - 4, `${typeLabel} ${conf}%`, bColor);
      this.ctx.restore();
    }
  }

  drawChassis(vehicle, w, h) {
    const vType = vehicle.type;

    if (vType === "twowheeler") {
      // Sleek 2-wheeler bike + rider
      this.ctx.fillStyle = vehicle.color || "#06b6d4";
      this.ctx.fillRect(-w / 2, -h / 2, w, h);
      // Wheels
      this.ctx.fillStyle = "#1e293b";
      this.ctx.fillRect(-w / 2, -h / 2 - 1, 3, h + 2);
      this.ctx.fillRect(w / 2 - 3, -h / 2 - 1, 3, h + 2);
      // Helmet dot
      this.ctx.fillStyle = "#f8fafc";
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      this.ctx.fill();
    } 
    else if (vType === "auto") {
      // Indian Auto-Rickshaw (Yellow roof, green/black body)
      this.ctx.fillStyle = "#15803d"; // Green lower body
      this.ctx.fillRect(-w / 2, -h / 2, w, h);
      this.ctx.fillStyle = "#eab308"; // Iconic Yellow roof
      this.ctx.fillRect(-w / 2 + 2, -h / 2 + 1, w - 4, h - 2);
      // Front tapering
      this.ctx.fillStyle = "#0f172a";
      this.ctx.fillRect(w / 2 - 3, -h / 4, 3, h / 2);
    } 
    else if (vType === "bus") {
      // Long public transport bus
      this.ctx.fillStyle = vehicle.color || "#8b5cf6";
      this.ctx.fillRect(-w / 2, -h / 2, w, h);
      // Windows strip
      this.ctx.fillStyle = "#38bdf8";
      this.ctx.fillRect(-w / 2 + 5, -h / 2 + 2, w - 10, 2.5);
      this.ctx.fillRect(-w / 2 + 5, h / 2 - 4.5, w - 10, 2.5);
      // Front windshield
      this.ctx.fillRect(w / 2 - 4, -h / 2 + 2, 3, h - 4);
    } 
    else if (vType === "truck") {
      // Heavy cargo truck
      this.ctx.fillStyle = "#ea580c";
      this.ctx.fillRect(-w / 2, -h / 2, w - 10, h); // Cargo bed
      this.ctx.fillStyle = "#c2410c";
      this.ctx.fillRect(w / 2 - 10, -h / 2, 10, h); // Cabin
      this.ctx.fillStyle = "#94a3b8";
      this.ctx.fillRect(w / 2 - 3, -h / 2 + 2, 2.5, h - 4); // Windshield
    } 
    else if (vType === "ambulance") {
      // White emergency ambulance with red crosses
      this.ctx.fillStyle = "#f8fafc";
      this.ctx.fillRect(-w / 2, -h / 2, w, h);
      // Red cross
      this.ctx.fillStyle = "#dc2626";
      this.ctx.fillRect(-3, -h / 2 + 3, 6, 2);
      this.ctx.fillRect(-1, -h / 2 + 1, 2, 6);
      this.ctx.fillRect(-3, h / 2 - 5, 6, 2);
      this.ctx.fillRect(-1, h / 2 - 7, 2, 6);
    } 
    else if (vType === "fire_engine") {
      // Red fire engine
      this.ctx.fillStyle = "#b91c1c";
      this.ctx.fillRect(-w / 2, -h / 2, w, h);
      // Yellow ladder on top
      this.ctx.fillStyle = "#fef08a";
      this.ctx.fillRect(-w / 2 + 6, -3, w - 12, 6);
    } 
    else {
      // Standard car / sedan
      this.ctx.fillStyle = vehicle.color || "#3b82f6";
      this.ctx.fillRect(-w / 2, -h / 2, w, h);
      // Roof / windshields
      this.ctx.fillStyle = "#1e293b";
      this.ctx.fillRect(-w / 4, -h / 2 + 2, w / 2, h - 4);
      this.ctx.fillStyle = "#93c5fd";
      this.ctx.fillRect(w / 4 - 2, -h / 2 + 2.5, 2, h - 5); // Front glass
    }

    // Headlights (illumination beams when moving)
    if (vehicle.speed > 0.5) {
      this.ctx.fillStyle = "rgba(254, 240, 138, 0.35)";
      this.ctx.beginPath();
      this.ctx.moveTo(w / 2, -h / 3);
      this.ctx.lineTo(w / 2 + 15, -h / 2 - 4);
      this.ctx.lineTo(w / 2 + 15, h / 2 + 4);
      this.ctx.lineTo(w / 2, h / 3);
      this.ctx.fill();
    }
  }

  drawDetectionTag(x, y, text, color = "#00f2fe") {
    this.ctx.fillStyle = "rgba(6, 11, 22, 0.85)";
    this.ctx.fillRect(x, y - 10, text.length * 5.5 + 6, 12);
    this.ctx.fillStyle = color;
    this.ctx.font = "bold 8px var(--font-mono)";
    this.ctx.fillText(text, x + 3, y - 1);
  }

  drawCameraOverlay() {
    // Subtle CCTV frame borders & status info in top corners
    this.ctx.save();
    this.ctx.strokeStyle = "rgba(0, 242, 254, 0.2)";
    this.ctx.lineWidth = 1.5;
    
    const m = 14;
    const len = 20;
    // Top-left corner mark
    this.ctx.beginPath();
    this.ctx.moveTo(m, m + len); this.ctx.lineTo(m, m); this.ctx.lineTo(m + len, m);
    this.ctx.stroke();
    // Top-right
    this.ctx.beginPath();
    this.ctx.moveTo(this.width - m - len, m); this.ctx.lineTo(this.width - m, m); this.ctx.lineTo(this.width - m, m + len);
    this.ctx.stroke();
    // Bottom-left
    this.ctx.beginPath();
    this.ctx.moveTo(m, this.height - m - len); this.ctx.lineTo(m, this.height - m); this.ctx.lineTo(m + len, this.height - m);
    this.ctx.stroke();
    // Bottom-right
    this.ctx.beginPath();
    this.ctx.moveTo(this.width - m - len, this.height - m); this.ctx.lineTo(this.width - m, this.height - m); this.ctx.lineTo(this.width - m, this.height - m - len);
    this.ctx.stroke();

    // Live AI Vision Feed watermark
    const camNames = {
      'OVERVIEW': 'CAM-01 [JUNCTION_4WAY_HD] • OVERVIEW',
      'NORTH': 'CAM-02 [NORTH_INFLOW_HD] • NORTH ARTERIAL ZOOM',
      'SOUTH': 'CAM-03 [SOUTH_HOSPITAL_ROUTE_HD] • SOUTH CORRIDOR ZOOM',
      'EAST': 'CAM-04 [EAST_HIGHWAY_HD] • EAST MAIN LINK ZOOM',
      'WEST': 'CAM-05 [WEST_COMMERCIAL_HD] • WEST PLAZA ZOOM'
    };
    const activeCamText = camNames[this.cameraView] || camNames['OVERVIEW'];
    
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    this.ctx.font = "bold 10px var(--font-mono)";
    this.ctx.fillText(`${activeCamText} • AI YOLO-v11 INFERENCE (60 FPS)`, m + 10, m + 14);

    this.ctx.restore();
  }
}
