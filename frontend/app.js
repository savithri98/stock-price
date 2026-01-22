// --- API hook (calls your Flask backend) ----------------------

async function fetchStockAndPrediction(symbol, startDate, endDate, horizon, model) {
  const payload = { symbol, startDate, endDate, horizon, model };
  const token = localStorage.getItem("sv_access_token");

  if (!token) {
    throw new Error("Not authenticated. Please log in first.");
  }

  const res = await fetch("http://127.0.0.1:5000/api/predict", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "API request failed");
  }

  const data = await res.json();
  return {
    history: data.history,
    preds: data.preds,
  };
}


// --- Utilities -------------------------------------------------

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

// --- Chart setup -----------------------------------------------

let priceChart = null;

function createOrUpdateChart(canvas, data, logScale, showBand) {
  const labels = data.history.map((d) => d.date).concat(data.preds.map((d) => d.date));
  const histValues = data.history.map((d) => d.close);
  const predValues = new Array(data.history.length)
    .fill(null)
    .concat(data.preds.map((d) => d.pred));

  const lowerBand = new Array(data.history.length)
    .fill(null)
    .concat(data.preds.map((d) => d.lower));
  const upperBand = new Array(data.history.length)
    .fill(null)
    .concat(data.preds.map((d) => d.upper));

  if (priceChart) {
    priceChart.destroy();
  }

  const ctx = canvas.getContext("2d");

  const datasets = [
    {
      label: "Historical",
      data: histValues,
      borderColor: "#3b82f6",
      backgroundColor: "rgba(59,130,246,0.18)",
      tension: 0.25,
      fill: false,
      pointRadius: 0,
      borderWidth: 2,
    },
    {
      label: "Predicted",
      data: predValues,
      borderColor: "#f97316",
      backgroundColor: "rgba(249,115,22,0.08)",
      tension: 0.3,
      pointRadius: 0,
      borderDash: [6, 4],
      borderWidth: 2,
    },
  ];

  if (showBand) {
    datasets.push(
      {
        label: "Lower bound",
        data: lowerBand,
        borderColor: "rgba(249,115,22,0.0)",
        backgroundColor: "rgba(249,115,22,0.0)",
        pointRadius: 0,
        fill: "+1",
      },
      {
        label: "Upper bound",
        data: upperBand,
        borderColor: "rgba(249,115,22,0.0)",
        backgroundColor: "rgba(249,115,22,0.15)",
        pointRadius: 0,
        fill: false,
      }
    );
  }

  priceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          mode: "index",
          intersect: false,
        },
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 8,
          },
          grid: {
            display: false,
          },
        },
        y: {
          type: logScale ? "logarithmic" : "linear",
          grace: "5%",
          ticks: {
            callback: function (value) {
              return value.toFixed ? value.toFixed(0) : value;
            },
          },
        },
      },
    },
  });
}

// --- Table rendering -------------------------------------------

function renderPredictionTable(tbody, preds) {
  tbody.innerHTML = "";
  preds.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.date}</td>
      <td>${row.pred.toFixed(2)}</td>
      <td>${row.lower.toFixed(2)}</td>
      <td>${row.upper.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// --- CSV export ------------------------------------------------

function exportPredictionsToCSV(symbol, preds) {
  if (!preds.length) return;
  const header = ["date", "symbol", "predicted", "lower", "upper"];
  const rows = preds.map((p) =>
    [p.date, symbol, p.pred, p.lower, p.upper].join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${symbol}_predictions.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Main init -------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const symbolInput = document.getElementById("symbolInput");
  const startDateInput = document.getElementById("startDate");
  const endDateInput = document.getElementById("endDate");
  const horizonInput = document.getElementById("horizonInput");
  const horizonValue = document.getElementById("horizonValue");
  const modelSelect = document.getElementById("modelSelect");
  const showConfidence = document.getElementById("showConfidence");
  const logScale = document.getElementById("logScale");
  const loadBtn = document.getElementById("loadBtn");
  const runModelBtn = document.getElementById("runModelBtn");
  const statusEl = document.getElementById("status");
  const panelTitle = document.getElementById("panelTitle");
  const tableBody = document.querySelector("#predictionTable tbody");
  const exportBtn = document.getElementById("exportBtn");
  const canvas = document.getElementById("priceChart");

  const today = new Date();
  const past = new Date();
  past.setDate(today.getDate() - 90);
  startDateInput.value = formatDate(past);
  endDateInput.value = formatDate(today);

  let currentData = { history: [], preds: [] };
  let currentSymbol = symbolInput.value || "AAPL";

  horizonInput.addEventListener("input", () => {
    horizonValue.textContent = horizonInput.value;
  });

  logScale.addEventListener("change", () => {
    if (currentData.history.length) {
      createOrUpdateChart(
        canvas,
        currentData,
        logScale.checked,
        showConfidence.checked
      );
    }
  });

  showConfidence.addEventListener("change", () => {
    if (currentData.history.length) {
      createOrUpdateChart(
        canvas,
        currentData,
        logScale.checked,
        showConfidence.checked
      );
    }
  });

  async function loadDataAndRender(isPredictionRun = false) {
    const symbol = symbolInput.value.trim().toUpperCase();
    if (!symbol) {
      statusEl.textContent = "Enter a stock symbol.";
      statusEl.style.color = "var(--danger)";
      return;
    }

    const startDate = startDateInput.value || formatDate(past);
    const endDate = endDateInput.value || formatDate(today);
    const horizon = parseInt(horizonInput.value, 10) || 14;
    const model = modelSelect.value;

    statusEl.textContent = isPredictionRun
      ? "Running model..."
      : "Loading data...";
    statusEl.style.color = "var(--muted)";

    try {
      const data = await fetchStockAndPrediction(
        symbol,
        startDate,
        endDate,
        horizon,
        model
      );
      currentData = data;
      currentSymbol = symbol;

      createOrUpdateChart(
        canvas,
        currentData,
        logScale.checked,
        showConfidence.checked
      );
      renderPredictionTable(tableBody, currentData.preds);
      panelTitle.textContent = `${symbol} – Price & Prediction`;
      statusEl.textContent = `Showing ${data.history.length} historical points and ${data.preds.length} predicted days (${model.toUpperCase()}).`;
      statusEl.style.color = "var(--success)";
    } catch (e) {
      console.error(e);
      statusEl.textContent = "Error loading data.";
      statusEl.style.color = "var(--danger)";
    }
  }

  loadBtn.addEventListener("click", () => loadDataAndRender(false));
  runModelBtn.addEventListener("click", () => loadDataAndRender(true));

  exportBtn.addEventListener("click", () => {
    if (!currentData.preds.length) return;
    exportPredictionsToCSV(currentSymbol, currentData.preds);
  });

  loadDataAndRender(false);
});
