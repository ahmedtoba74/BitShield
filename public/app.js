// ============================================================
// BitShield Frontend Application
// ============================================================

// ---- Tab Navigation ----
document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document
            .querySelectorAll(".tab-btn")
            .forEach((b) => b.classList.remove("active"));
        document
            .querySelectorAll(".tab-content")
            .forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
        document
            .getElementById("tab-" + btn.dataset.tab)
            .classList.add("active");
    });
});

// ---- File Input Labels ----
["classic", "harq", "mc"].forEach((prefix) => {
    const input = document.getElementById(prefix + "File");
    if (input) {
        input.addEventListener("change", () => {
            const label = document.getElementById(prefix + "FileName");
            if (input.files.length > 0) {
                label.textContent = input.files[0].name;
                label.style.color = "#3b82f6";
            }
        });
    }
});

// ---- Range Sliders ----
document.getElementById("harqErrorRate").addEventListener("input", (e) => {
    document.getElementById("harqErrorVal").textContent = parseFloat(
        e.target.value,
    ).toFixed(3);
});
document.getElementById("harqKappa").addEventListener("input", (e) => {
    document.getElementById("harqKappaVal").textContent = parseFloat(
        e.target.value,
    ).toFixed(1);
});

// ============================================================
// TAB 1: Classic Mode
// ============================================================
document.getElementById("classicForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById("classicFile");
    if (fileInput.files.length === 0) {
        alert("Please select a file first!");
        return;
    }

    const formData = new FormData();
    formData.append("textFile", fileInput.files[0]);

    toggleLoading("classic", true);
    document.getElementById("classicResults").style.display = "none";

    try {
        const response = await fetch("/api/process", {
            method: "POST",
            body: formData,
        });
        const data = await response.json();
        if (response.ok) displayClassicResults(data);
        else alert("Error: " + data.error);
    } catch (error) {
        alert("Server error! Make sure the server is running.");
    } finally {
        toggleLoading("classic", false);
    }
});

function displayClassicResults(data) {
    const stats = data.statistics;
    const noise = stats.noise_simulation;

    document.getElementById("linkProb").href =
        data.download_links.probabilities;
    document.getElementById("linkCheck").href =
        data.download_links.decoding_check_part3;
    document.getElementById("linkFinal").href =
        data.download_links.final_restored_text;

    document.getElementById("origSize").innerText =
        stats.original_size_in_bits.toLocaleString() + " bits";
    document.getElementById("compSize").innerText =
        stats.compressed_size_in_bits.toLocaleString() + " bits";
    document.getElementById("compRatio").innerText =
        stats.compressed_efficiency;
    document.getElementById("compBar").style.width =
        stats.compressed_efficiency;

    document.getElementById("transBits").innerText =
        noise.total_size_in_bits_transmitted.toLocaleString();
    document.getElementById("errInj").innerText = noise.total_errors_injected;
    document.getElementById("errCorr").innerText =
        noise.total_errors_corrected_by_hamming;
    document.getElementById("corrEff").innerText = noise.correction_efficiency;
    document.getElementById("corrBar").style.width =
        noise.correction_efficiency;

    document.getElementById("origBytes").innerText =
        stats.original_text_size_bytes;
    document.getElementById("finalBytes").innerText =
        stats.final_restored_text_size_bytes;
    document.getElementById("finalAcc").innerText =
        stats.final_restored_text_efficiency;
    document.getElementById("accBar").style.width =
        stats.final_restored_text_efficiency;

    document.getElementById("classicResults").style.display = "block";
}

// ============================================================
// TAB 2: HARQ Simulation
// ============================================================
document.getElementById("harqForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById("harqFile");
    if (fileInput.files.length === 0) {
        alert("Please select a file!");
        return;
    }

    const formData = new FormData();
    formData.append("textFile", fileInput.files[0]);
    formData.append(
        "errorRate",
        document.getElementById("harqErrorRate").value,
    );
    formData.append(
        "maxStages",
        document.getElementById("harqMaxStages").value,
    );
    formData.append("kappa", document.getElementById("harqKappa").value);

    toggleLoading("harq", true);
    document.getElementById("harqResults").style.display = "none";

    try {
        const response = await fetch("/api/simulate", {
            method: "POST",
            body: formData,
        });
        const data = await response.json();
        if (response.ok) displayHARQResults(data);
        else alert("Error: " + data.error);
    } catch (error) {
        alert("Simulation failed! " + error.message);
    } finally {
        toggleLoading("harq", false);
    }
});

function displayHARQResults(data) {
    // IR Timeline
    const timeline = document.getElementById("irTimeline");
    timeline.innerHTML = "";
    data.stages.forEach((stage, idx) => {
        const isAck = stage.decision === "ACK";
        const div = document.createElement("div");
        div.className = "ir-stage " + (isAck ? "ack" : "nack");
        div.style.animationDelay = idx * 0.15 + "s";
        div.innerHTML = `
            <div class="ir-stage-num">${stage.stageNumber}</div>
            <div class="ir-stage-info">
                <span>Bits Sent: <strong>${stage.bitsSent.toLocaleString()}</strong></span>
                <span>Errors: <strong class="color-red">${stage.noiseReport.totalErrors}</strong></span>
                <span>Corrected: <strong class="color-green">${stage.decodingReport.correctedErrors}</strong></span>
                <span>Uncorrectable: <strong>${stage.decodingReport.detectedUncorrectable}</strong></span>
                <span>CRC: <strong style="color:${stage.crcPassed ? "#10b981" : "#ef4444"}">${stage.crcPassed ? "PASS" : "FAIL"}</strong></span>
                <span>Reliability: <strong>${stage.reliabilityScore.toFixed(3)}</strong></span>
            </div>
            <span class="ir-badge ${isAck ? "ack" : "nack"}">${stage.decision}</span>
        `;
        timeline.appendChild(div);
    });

    // Compression Stats
    document.getElementById("harqCompStats").innerHTML = `
        <div class="stat-row"><span>Original Size:</span><span class="stat-value">${data.compressionStats.originalBits.toLocaleString()} bits</span></div>
        <div class="stat-row"><span>Compressed:</span><span class="stat-value">${data.compressionStats.compressedBits.toLocaleString()} bits</span></div>
        <div class="stat-row"><span>Ratio:</span><span class="stat-value">${data.compressionStats.compressionRatio}%</span></div>
    `;

    // Channel Stats
    document.getElementById("harqChannelStats").innerHTML = `
        <div class="stat-row"><span>Hamming Blocks:</span><span class="stat-value">${data.metrics.totalHammingBlocks}</span></div>
        <div class="stat-row"><span>Padding Bits:</span><span class="stat-value">${data.metrics.paddingBits}</span></div>
        <div class="stat-row"><span>CRC Bits:</span><span class="stat-value">${data.metrics.crcBits}</span></div>
    `;

    // IR Stats
    const lastStage = data.stages[data.stages.length - 1];
    document.getElementById("harqIRStats").innerHTML = `
        <div class="stat-row"><span>Total Retransmissions:</span><span class="stat-value">${data.metrics.totalRetransmissions}</span></div>
        <div class="stat-row"><span>Total Bits Sent:</span><span class="stat-value">${data.metrics.totalBitsTransmitted.toLocaleString()}</span></div>
        <div class="stat-row"><span>Throughput:</span><span class="stat-value">${(data.metrics.throughput * 100).toFixed(1)}%</span></div>
        <div class="stat-row"><span>Final Decision:</span><span class="stat-value" style="color:${lastStage.decision === "ACK" ? "#10b981" : "#ef4444"}">${lastStage.decision}</span></div>
    `;

    // Quality Stats
    document.getElementById("harqQualityStats").innerHTML = `
        <div class="stat-row"><span>BER:</span><span class="stat-value">${data.metrics.ber === 0 ? "0 (Perfect)" : data.metrics.ber.toExponential(3)}</span></div>
        <div class="stat-row"><span>Frame Error:</span><span class="stat-value" style="color:${data.metrics.frameError ? "#ef4444" : "#10b981"}">${data.metrics.frameError ? "YES" : "NO"}</span></div>
        <div class="stat-row"><span>Undetected Error:</span><span class="stat-value" style="color:${data.metrics.undetectedError ? "#ef4444" : "#10b981"}">${data.metrics.undetectedError ? "YES ⚠️" : "NO ✓"}</span></div>
        <div class="stat-row"><span>Text Length:</span><span class="stat-value">${data.metrics.originalTextLength} chars</span></div>
    `;

    // Text Compare
    document.getElementById("harqOrigText").textContent =
        data.originalText || "";
    document.getElementById("harqRestoredText").textContent =
        data.finalText || "";

    document.getElementById("harqResults").style.display = "block";
}

// ============================================================
// TAB 3: Monte Carlo Performance Analysis
// ============================================================
let charts = {};

document.getElementById("mcForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById("mcFile");
    if (fileInput.files.length === 0) {
        alert("Please select a file!");
        return;
    }

    const formData = new FormData();
    formData.append("textFile", fileInput.files[0]);
    formData.append("errorRateMin", document.getElementById("mcMin").value);
    formData.append("errorRateMax", document.getElementById("mcMax").value);
    formData.append("numPoints", document.getElementById("mcPoints").value);
    formData.append(
        "trialsPerPoint",
        document.getElementById("mcTrials").value,
    );
    formData.append("maxStages", document.getElementById("mcStages").value);
    formData.append("kappa", document.getElementById("mcKappa").value);

    toggleLoading("mc", true);
    document.getElementById("mcProgress").textContent =
        "Running simulation... This may take a moment.";
    document.getElementById("mcResults").style.display = "none";

    try {
        const response = await fetch("/api/simulate/montecarlo", {
            method: "POST",
            body: formData,
        });
        const data = await response.json();
        if (response.ok) displayCharts(data);
        else alert("Error: " + data.error);
    } catch (error) {
        alert("Monte Carlo failed! " + error.message);
    } finally {
        toggleLoading("mc", false);
        document.getElementById("mcProgress").textContent = "";
    }
});

const COLORS = {
    noProtection: { line: "#ef4444", bg: "rgba(239,68,68,0.1)" },
    crcOnly: { line: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
    hammingOnly: { line: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
    combinedIR: { line: "#10b981", bg: "rgba(16,185,129,0.1)" },
};

function displayCharts(data) {
    const labels = data.errorRates.map((r) => r.toFixed(4));

    // Destroy old charts
    Object.values(charts).forEach((c) => c.destroy());
    charts = {};

    // Replace zero values with a small epsilon for log scale
    const safeLog = (arr) => arr.map((v) => (v === 0 ? 1e-8 : v));

    // Chart 1: BER
    charts.ber = createChart(
        "chartBER",
        "Bit Error Rate (BER) vs Channel Error Rate",
        labels,
        [
            makeDataset(
                "No Protection",
                safeLog(data.systems.noProtection.ber),
                COLORS.noProtection,
            ),
            makeDataset(
                "CRC-16 Only",
                safeLog(data.systems.crcOnly.ber),
                COLORS.crcOnly,
            ),
            makeDataset(
                "Hamming Only",
                safeLog(data.systems.hammingOnly.ber),
                COLORS.hammingOnly,
            ),
            makeDataset(
                "Combined IR",
                safeLog(data.systems.combinedIR.ber),
                COLORS.combinedIR,
            ),
        ],
        true,
    );

    // Chart 2: FER
    charts.fer = createChart(
        "chartFER",
        "Frame Error Rate (FER) vs Channel Error Rate",
        labels,
        [
            makeDataset(
                "No Protection",
                safeLog(data.systems.noProtection.fer),
                COLORS.noProtection,
            ),
            makeDataset(
                "CRC-16 Only",
                safeLog(data.systems.crcOnly.fer),
                COLORS.crcOnly,
            ),
            makeDataset(
                "Hamming Only",
                safeLog(data.systems.hammingOnly.fer),
                COLORS.hammingOnly,
            ),
            makeDataset(
                "Combined IR",
                safeLog(data.systems.combinedIR.fer),
                COLORS.combinedIR,
            ),
        ],
        true,
    );

    // Chart 3: Throughput
    charts.throughput = createChart(
        "chartThroughput",
        "Throughput vs Channel Error Rate",
        labels,
        [
            makeDataset(
                "No Protection",
                data.systems.noProtection.throughput,
                COLORS.noProtection,
            ),
            makeDataset(
                "CRC-16 Only",
                data.systems.crcOnly.throughput,
                COLORS.crcOnly,
            ),
            makeDataset(
                "Hamming Only",
                data.systems.hammingOnly.throughput,
                COLORS.hammingOnly,
            ),
            makeDataset(
                "Combined IR",
                data.systems.combinedIR.throughput,
                COLORS.combinedIR,
            ),
        ],
        false,
    );

    // Chart 4: Retransmissions
    charts.retrans = createChart(
        "chartRetrans",
        "Avg Retransmissions vs Channel Error Rate",
        labels,
        [
            makeDataset(
                "CRC-16 Only",
                data.systems.crcOnly.avgRetransmissions,
                COLORS.crcOnly,
            ),
            makeDataset(
                "Combined IR",
                data.systems.combinedIR.avgRetransmissions,
                COLORS.combinedIR,
            ),
        ],
        false,
    );

    document.getElementById("mcResults").style.display = "block";
}

function makeDataset(label, data, colors) {
    return {
        label,
        data,
        borderColor: colors.line,
        backgroundColor: colors.bg,
        borderWidth: 2.5,
        pointRadius: 3,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: false,
    };
}

function createChart(canvasId, title, labels, datasets, logScale) {
    const ctx = document.getElementById(canvasId).getContext("2d");
    return new Chart(ctx, {
        type: "line",
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                title: {
                    display: true,
                    text: title,
                    color: "#e2e8f0",
                    font: { size: 14, weight: "600" },
                },
                legend: {
                    labels: {
                        color: "#94a3b8",
                        font: { size: 11 },
                        usePointStyle: true,
                        pointStyle: "circle",
                    },
                },
                tooltip: {
                    backgroundColor: "#1e2d4a",
                    titleColor: "#e2e8f0",
                    bodyColor: "#94a3b8",
                    borderColor: "rgba(255,255,255,0.1)",
                    borderWidth: 1,
                },
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: "Channel Error Rate (p)",
                        color: "#94a3b8",
                    },
                    ticks: { color: "#64748b", maxTicksLimit: 10 },
                    grid: { color: "rgba(255,255,255,0.04)" },
                },
                y: {
                    type: logScale ? "logarithmic" : "linear",
                    title: {
                        display: true,
                        text: title.split(" vs")[0],
                        color: "#94a3b8",
                    },
                    ticks: { color: "#64748b" },
                    grid: { color: "rgba(255,255,255,0.04)" },
                    min: logScale ? 1e-8 : undefined,
                },
            },
        },
    });
}

// ---- Helpers ----
function toggleLoading(prefix, show) {
    document.getElementById(prefix + "Loader").style.display = show
        ? "block"
        : "none";
    const btn = document.getElementById(prefix + "Submit");
    btn.disabled = show;

    if (show) {
        if (!btn.dataset.originalText) {
            btn.dataset.originalText = btn.textContent;
        }
        btn.textContent = "Processing...";
    } else {
        if (btn.dataset.originalText) {
            btn.textContent = btn.dataset.originalText;
        }
    }
}
