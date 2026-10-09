/* main.js — Shared utilities loaded on every page */

/* ── Theme ── */
(function () {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = saved === "dark" ? "☀️" : "🌙";
})();

document.getElementById("theme-toggle")?.addEventListener("click", () => {
  const html  = document.documentElement;
  const theme = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  document.getElementById("theme-toggle").textContent = theme === "dark" ? "☀️" : "🌙";
});

/* ── Sidebar ── */
const sidebar  = document.getElementById("sidebar");
const overlay  = document.getElementById("overlay");
document.getElementById("hamburger")?.addEventListener("click", () => {
  sidebar.classList.toggle("open");
  overlay.classList.toggle("show");
});
overlay?.addEventListener("click", () => {
  sidebar.classList.remove("open");
  overlay.classList.remove("show");
});

/* ── Toast ── */
let _toastT;
function showToast(msg, type = "info") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className   = `toast ${type} show`;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove("show"), 3200);
}
window.showToast = showToast;

/* ── Modals ── */
function openModal(id)  { document.getElementById(id)?.removeAttribute("hidden"); }
function closeModal(id) { document.getElementById(id)?.setAttribute("hidden", ""); }
window.openModal  = openModal;
window.closeModal = closeModal;

document.querySelectorAll(".modal-close, [data-modal]").forEach(btn => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.modal || btn.closest(".modal-backdrop")?.id;
    if (id) closeModal(id);
  });
});

/* ── Re-seed ── */
document.getElementById("reseed-btn")?.addEventListener("click", async () => {
  if (!confirm("Re-generate all sample data? This will wipe current records.")) return;
  try {
    await fetch("/api/seed", { method: "POST" });
    showToast("Sample data re-seeded!", "success");
    setTimeout(() => location.reload(), 900);
  } catch { showToast("Seed failed", "error"); }
});

/* ── Formatters ── */
function fmtDuration(sec) {
  if (!sec) return "0s";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
function fmtMB(mb) {
  if (mb == null) return "—";
  return mb >= 1024 ? (mb / 1024).toFixed(2) + " GB" : mb.toFixed(1) + " MB";
}
function fmtDate(s) {
  if (!s) return "—";
  return new Date(s.replace(" ", "T")).toLocaleString(undefined,
    { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDateOnly(s) {
  if (!s) return "—";
  return new Date(s.replace(" ", "T")).toLocaleDateString(undefined,
    { month: "short", day: "numeric", year: "numeric" });
}
function badge(type) {
  const cls = { incoming:"badge-incoming", outgoing:"badge-outgoing", missed:"badge-missed",
                sent:"badge-sent", received:"badge-received" };
  return `<span class="badge ${cls[type] || ""}">${type}</span>`;
}
window.fmtDuration = fmtDuration;
window.fmtMB       = fmtMB;
window.fmtDate     = fmtDate;
window.fmtDateOnly = fmtDateOnly;
window.badge       = badge;

/* ── Pagination ── */
function buildPagination(containerId, current, total, perPage, onPage) {
  const pages = Math.ceil(total / perPage);
  const el    = document.getElementById(containerId);
  if (!el) return;
  if (pages <= 1) { el.innerHTML = ""; return; }
  const start = Math.max(1, current - 2);
  const end   = Math.min(pages, current + 2);
  let html = `<button class="page-btn" ${current===1?"disabled":""} data-p="${current-1}">‹</button>`;
  if (start > 1) html += `<button class="page-btn" data-p="1">1</button>${start > 2 ? '<span class="muted">…</span>' : ""}`;
  for (let p = start; p <= end; p++)
    html += `<button class="page-btn ${p===current?"active":""}" data-p="${p}">${p}</button>`;
  if (end < pages) html += `${end < pages-1 ? '<span class="muted">…</span>' : ""}<button class="page-btn" data-p="${pages}">${pages}</button>`;
  html += `<button class="page-btn" ${current===pages?"disabled":""} data-p="${current+1}">›</button>`;
  el.innerHTML = html;
  el.querySelectorAll(".page-btn:not([disabled])").forEach(b =>
    b.addEventListener("click", () => onPage(parseInt(b.dataset.p)))
  );
}
window.buildPagination = buildPagination;

/* ── Date helpers ── */
function todayStr()   { return new Date().toISOString().split("T")[0]; }
function daysAgoStr(n) { const d = new Date(); d.setDate(d.getDate()-n+1); return d.toISOString().split("T")[0]; }
window.todayStr   = todayStr;
window.daysAgoStr = daysAgoStr;

/* ── Chart theme colors ── */
function chartColors() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  return { grid: dark?"rgba(255,255,255,.07)":"rgba(0,0,0,.06)", text: dark?"#94A3B8":"#64748B", surface: dark?"#1E293B":"#FFF" };
}
window.chartColors = chartColors;

/* ── Chart factories ── */
function makeBarChart(ctxId, labels, datasets, opts = {}) {
  const cc  = chartColors();
  const ctx = document.getElementById(ctxId)?.getContext("2d");
  if (!ctx) return null;
  return new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: opts.legend ?? false, labels: { color: cc.text, boxWidth: 12 } },
                 tooltip: { mode: "index", intersect: false } },
      scales: {
        x: { stacked: opts.stacked, grid: { color: cc.grid }, ticks: { color: cc.text, maxRotation: 45, maxTicksLimit: 14 } },
        y: { stacked: opts.stacked, grid: { color: cc.grid }, ticks: { color: cc.text }, beginAtZero: true },
        ...(opts.scales||{})
      },
      indexAxis: opts.horizontal ? "y" : "x",
    },
  });
}
function makeLineChart(ctxId, labels, datasets, opts = {}) {
  const cc  = chartColors();
  const ctx = document.getElementById(ctxId)?.getContext("2d");
  if (!ctx) return null;
  return new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: opts.legend ?? true, labels: { color: cc.text, boxWidth: 12 } },
                 tooltip: { mode: "index", intersect: false } },
      scales: {
        x: { grid: { color: cc.grid }, ticks: { color: cc.text, maxRotation: 45, maxTicksLimit: 14 } },
        y: { grid: { color: cc.grid }, ticks: { color: cc.text }, beginAtZero: true },
        ...(opts.scales||{})
      },
    },
  });
}
function makeDoughnutChart(ctxId, labels, data, colors, opts = {}) {
  const cc  = chartColors();
  const ctx = document.getElementById(ctxId)?.getContext("2d");
  if (!ctx) return null;
  return new Chart(ctx, {
    type: opts.pie ? "pie" : "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: cc.surface }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: cc.text, boxWidth: 12, padding: 10, font: { size: 11 } } } },
      cutout: opts.pie ? "0%" : "58%",
    },
  });
}
function destroyChart(c) { if (c) c.destroy(); }
window.makeBarChart      = makeBarChart;
window.makeLineChart     = makeLineChart;
window.makeDoughnutChart = makeDoughnutChart;
window.destroyChart      = destroyChart;
