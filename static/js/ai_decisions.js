/**
 * ============================================================================
 * AI DECISION EXPLANATIONS & ADVISOR MANAGER
 * Transparent, Explainable AI reasoning engine renderer
 * ============================================================================
 */

class AIDecisionManager {
  constructor() {
    this.container = document.getElementById('aiDecisionCard');
    this.historyTableBody = document.getElementById('decisionsHistoryBody');
    this.advisorBanner = document.getElementById('advisorBannerText');
  }

  updateLatestDecision(decision, approachData) {
    if (!decision) return;

    const titleEl = document.getElementById('decisionTitle');
    const statementEl = document.getElementById('decisionStatement');
    const bulletsEl = document.getElementById('decisionBullets');
    const actionEl = document.getElementById('decisionAction');
    const timestampEl = document.getElementById('decisionTimestamp');

    if (titleEl) titleEl.textContent = `AI Decision: ${decision.type.replace(/_/g, ' ')}`;
    if (timestampEl) timestampEl.textContent = decision.timestamp || 'Just now';
    if (statementEl) statementEl.innerHTML = `<span>⚡</span> <span>${decision.reason}</span>`;
    if (actionEl) actionEl.innerHTML = `<span>Decision Action:</span> <span>${decision.action}</span>`;

    if (bulletsEl && decision.params) {
      bulletsEl.innerHTML = '';
      const params = typeof decision.params === 'string' ? JSON.parse(decision.params) : decision.params;
      
      const items = [
        { label: "Target Approach", val: decision.approach || "All" },
        { label: "Traffic Density", val: params.density ? `${params.density}%` : "Monitored" },
        { label: "Queue Length", val: params.queue ? `${params.queue} vehs` : "Normal" },
        { label: "Wait Duration", val: params.wait_time ? `${params.wait_time.toFixed ? params.wait_time.toFixed(0) : params.wait_time}s` : "0s" },
        { label: "Pedestrians", val: params.pedestrians ? `${params.pedestrians} active` : "Clear" },
        { label: "Starvation Guard", val: decision.type.includes("STARVATION") ? "TRIGGERED (Fairness)" : "Inactive" }
      ];

      items.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${item.label}:</strong> <span>${item.val}</span>`;
        bulletsEl.appendChild(li);
      });
    }
  }

  updateAdvisorTicker(messages) {
    if (!this.advisorBanner || !messages || messages.length === 0) return;
    const latest = messages[0];
    this.advisorBanner.textContent = latest.text;
  }

  async loadDecisionsHistory() {
    if (!this.historyTableBody) return;
    try {
      const res = await fetch('/api/decisions?limit=12');
      const data = await res.json();
      this.historyTableBody.innerHTML = '';
      
      data.forEach(d => {
        const tr = document.createElement('tr');
        let badgeColor = '#0284c7';
        if (d.decision_type.includes('EMERGENCY')) badgeColor = '#dc2626';
        if (d.decision_type.includes('PEDESTRIAN')) badgeColor = '#9333ea';
        if (d.decision_type.includes('STARVATION')) badgeColor = '#ea580c';
        if (d.decision_type.includes('FREE_LEFT')) badgeColor = '#059669';

        tr.innerHTML = `
          <td><span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">${d.timestamp.split(' ')[1] || d.timestamp}</span></td>
          <td><span style="background: ${badgeColor}22; color: ${badgeColor}; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;">${d.decision_type}</span></td>
          <td><strong>${d.approach}</strong></td>
          <td style="font-size: 12px; color: #cbd5e1;">${d.reason}</td>
          <td style="font-size: 12px; font-weight: 600; color: #6ee7b7;">${d.action_taken}</td>
        `;
        this.historyTableBody.appendChild(tr);
      });
    } catch (e) {
      console.warn("Failed to load decision history", e);
    }
  }
}
