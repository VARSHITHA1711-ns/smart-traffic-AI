/**
 * ============================================================================
 * ANALYTICS & CHARTS MANAGER
 * Interactive Chart.js Telemetry, Mixed-Traffic Breakdowns, Normal vs Festival Analytics
 * ============================================================================
 */

class AnalyticsManager {
  constructor() {
    this.volumeChart = null;
    this.typeChart = null;
    this.densityChart = null;
    this.pedestrianChart = null;
    this.chartsInitialized = false;
  }

  initCharts() {
    if (this.chartsInitialized || typeof Chart === 'undefined') return;

    // 1. Vehicle Volume History
    const volCtx = document.getElementById('chartVolumeHistory');
    if (volCtx) {
      this.volumeChart = new Chart(volCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Total Vehicles (PCU)',
            data: [],
            borderColor: '#00f2fe',
            backgroundColor: 'rgba(0, 242, 254, 0.1)',
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 2
          }]
        },
        options: this.getChartOptions('Vehicles Active')
      });
    }

    // 2. Mixed Vehicle Type Breakdown (Indian Traffic)
    const typeCtx = document.getElementById('chartVehicleTypes');
    if (typeCtx) {
      this.typeChart = new Chart(typeCtx, {
        type: 'doughnut',
        data: {
          labels: ['Two-Wheelers', 'Cars', 'Auto-Rickshaws', 'Buses', 'Trucks'],
          datasets: [{
            data: [42, 30, 16, 7, 5],
            backgroundColor: ['#06b6d4', '#3b82f6', '#eab308', '#8b5cf6', '#f97316'],
            borderWidth: 1,
            borderColor: '#090f1d'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } } }
          }
        }
      });
    }

    // 3. Directional Density Comparison
    const densCtx = document.getElementById('chartApproachDensity');
    if (densCtx) {
      this.densityChart = new Chart(densCtx, {
        type: 'bar',
        data: {
          labels: ['North', 'South', 'East', 'West'],
          datasets: [{
            label: 'Density (%)',
            data: [35, 45, 80, 50],
            backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#f59e0b'],
            borderRadius: 6
          }]
        },
        options: this.getChartOptions('Density %', 100)
      });
    }

    // 4. Pedestrian Volume & Safety
    const pedCtx = document.getElementById('chartPedestrianTrends');
    if (pedCtx) {
      this.pedestrianChart = new Chart(pedCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Pedestrian Crowd',
            data: [],
            borderColor: '#ec4899',
            backgroundColor: 'rgba(236, 72, 153, 0.1)',
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 2
          }]
        },
        options: this.getChartOptions('Pedestrian Crowd')
      });
    }

    this.chartsInitialized = true;
  }

  getChartOptions(title, maxVal = null) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10, 16, 30, 0.9)',
          borderColor: '#00f2fe',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#64748b', font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          max: maxVal,
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#64748b', font: { size: 10 } }
        }
      }
    };
  }

  async refreshData() {
    this.initCharts();
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();

      // Update Volume & Pedestrian line charts
      if (data.snapshots && data.snapshots.length > 0) {
        const labels = data.snapshots.map(s => {
          const parts = s.timestamp.split(' ');
          return parts[1] ? parts[1].substring(0, 5) : s.timestamp;
        });
        const vehData = data.snapshots.map(s => s.total_vehicles);
        const pedData = data.snapshots.map(s => s.total_pedestrians);

        if (this.volumeChart) {
          this.volumeChart.data.labels = labels;
          this.volumeChart.data.datasets[0].data = vehData;
          this.volumeChart.update('none');
        }

        if (this.pedestrianChart) {
          this.pedestrianChart.data.labels = labels;
          this.pedestrianChart.data.datasets[0].data = pedData;
          this.pedestrianChart.update('none');
        }
      }

      // Update Vehicle Type Doughnut
      if (this.typeChart && data.vehicle_breakdown) {
        const b = data.vehicle_breakdown;
        this.typeChart.data.datasets[0].data = [
          b.twowheeler || 10,
          b.car || 8,
          b.auto || 5,
          b.bus || 2,
          b.truck || 2
        ];
        this.typeChart.update('none');
      }

      // Populate Normal vs Festival Table
      const compBody = document.getElementById('festivalComparisonTableBody');
      if (compBody && data.comparison_table) {
        compBody.innerHTML = '';
        data.comparison_table.forEach(row => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${row.metric}</strong></td>
            <td><span class="veh-chip" style="color: #93c5fd;">${row.normal}</span></td>
            <td><span class="veh-chip" style="color: #f472b6; font-weight: 700;">${row.festival}</span></td>
            <td style="color: var(--text-dim); font-size: 11px;">${row.unit}</td>
          `;
          compBody.appendChild(tr);
        });
      }
    } catch (e) {
      console.warn("Analytics refresh failed", e);
    }
  }

  updateLiveApproachDensity(approaches) {
    if (!this.densityChart || !approaches) return;
    const names = ['North', 'South', 'East', 'West'];
    const densities = names.map(n => approaches[n] ? approaches[n].density_pct : 0);
    const colors = densities.map(d => d >= 85 ? '#ef4444' : (d >= 65 ? '#f97316' : (d >= 40 ? '#f59e0b' : '#10b981')));

    this.densityChart.data.datasets[0].data = densities;
    this.densityChart.data.datasets[0].backgroundColor = colors;
    this.densityChart.update('none');
  }
}
