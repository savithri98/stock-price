// dashboard.js

// Helper: element shortcuts
const $ = (id) => document.getElementById(id);

const symbolSelect   = $("symbol-select");
const loadBtn        = $("load-data-btn");
const startInput     = $("start-date");
const endInput       = $("end-date");
const horizonRange   = $("horizon-range");
const horizonLabel   = $("horizon-label");
const showCiCheckbox = $("show-ci");
const logCheckbox    = $("use-log");
const runBtn         = $("run-btn");
const exportBtn      = $("export-btn");
const statusText     = $("status-text");

const chartArea      = $("chart-area");
const resultsTitle   = $("results-title");
const resultsSub     = $("results-subtitle");

const analysisHorizon = $("analysis-horizon");
const analysisMove    = $("analysis-move");
const analysisTrend   = $("analysis-trend");
const analysisText    = $("analysis-text");

// Update label when slider moves
horizonRange.addEventListener("input", () => {
  horizonLabel.textContent = horizonRange.value;
});

// Example: set default date range (last 6 months)
function initDates() {
  const today = new Date();
  const endStr = today.toISOString().slice(0, 10);

  const past = new Date();
  past.setMonth(past.getMonth() - 6);
  const startStr = past.toISOString().slice(0, 10);

  startInput.value = startStr;
  endInput.value = endStr;
}

// Call backend to load raw data (optional separate step)
loadBtn.addEventListener("click", async () => {
  const symbol = symbolSelect.value;
  const start  = startInput.value;
  const end    = endInput.value;

  if (!start || !end) {
    statusText.textContent = "Please select start and end dates.";
    return;
  }

  statusText.textContent = "Loading data…";

  try {
    const resp = await fetch("/load-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, start_date: start, end_date: end })
    });

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || "Error loading data");
    }

    statusText.textContent = "Data loaded. You can now run prediction.";
  } catch (err) {
    console.error(err);
    statusText.textContent = "Error loading data.";
  }
});

// Run prediction and draw chart
runBtn.addEventListener("click", async () => {
  const symbol = symbolSelect.value;
  const start  = startInput.value;
  const end    = endInput.value;
  const horizon = parseInt(horizonRange.value, 10);
  const showCi  = showCiCheckbox.checked;
  const useLog  = logCheckbox.checked;

  if (!start || !end) {
    statusText.textContent = "Please select start and end dates.";
    return;
  }

  statusText.textContent = "Running prediction…";

  try {
    const resp = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        start_date: start,
        end_date: end,
        horizon,
        show_ci: showCi,
        log_scale: useLog
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || "Prediction failed");
    }

    // Expect backend to return:
    // data.chart_html  (if you use Plotly and render as HTML)
    // OR data.points   (arrays with x / y / y_pred / ci_lower / ci_upper)
    // plus some summary stats

    // Example if backend returns HTML for chart:
    if (data.chart_html) {
      chartArea.innerHTML = data.chart_html;
    } else {
      chartArea.textContent = "Chart data received. Connect a JS chart library here.";
    }

    // Update titles and analysis
    resultsTitle.textContent = `${symbol} – Price & prediction`;
    resultsSub.textContent   = `From ${start} to ${end} · ${horizon}-day forecast`;

    analysisHorizon.textContent = `${horizon} days`;
    analysisMove.textContent    = data.expected_move || "n/a";
    analysisTrend.textContent   = data.trend || "n/a";
    analysisText.textContent    = data.commentary || "Forecast completed.";

    statusText.textContent = "Prediction complete.";
  } catch (err) {
    console.error(err);
    statusText.textContent = "Error running prediction.";
  }
});

// Export CSV of prediction table
exportBtn.addEventListener("click", () => {
  const symbol = symbolSelect.value;
  const start  = startInput.value;
  const end    = endInput.value;

  // Simple redirect to a Flask route that streams CSV
  const url = `/export_csv?symbol=${encodeURIComponent(symbol)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  window.location.href = url;
});

// Initialise page
initDates();
statusText.textContent = "Waiting for input.";
