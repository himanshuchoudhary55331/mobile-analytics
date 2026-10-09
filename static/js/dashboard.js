/* dashboard.js */
let cTrend, cBreak, cHourly, cWeekday;
let S = { days: 7, start: null, end: null };

document.getElementById("period-filter")?.querySelectorAll(".btn-filter").forEach(b => {
  b.addEventListener("click", () => {
    document.getElementById("period-filter").querySelectorAll(".btn-filter").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    S.days = parseInt(b.dataset.days); S.start = S.end = null;
    document.getElementById("f-start").value = document.getElementById("f-end").value = "";
    loadAll();
  });
});

document.getElementById("apply-dates")?.addEventListener("click", () => {
  const s = document.getElementById("f-start").value, e = document.getElementById("f-end").value;
  if (!s || !e) { showToast("Pick both dates", "error"); return; }
  S.start = s; S.end = e; S.days = null;
  document.getElementById("period-filter").querySelectorAll(".btn-filter").forEach(x => x.classList.remove("active"));
  loadAll();
});

function params() {
  const p = new URLSearchParams();
  const s = S.start || daysAgoStr(S.days || 7);
  const e = S.end   || todayStr();
  p.set("start", s); p.set("end", e);
  return p;
}

async function loadAll() {
  await Promise.all([loadSummary(), loadTrend(), loadHourly(), loadWeekday()]);
}

async function loadSummary() {
  const r = await fetch("/api/dashboard/summary");
  const d = await r.json();
  document.getElementById("v-calls").textContent      = d.total_calls?.toLocaleString();
  document.getElementById("v-duration").textContent   = fmtDuration(d.total_duration_sec);
  document.getElementById("v-sms").textContent        = d.total_sms?.toLocaleString();
  document.getElementById("v-data").textContent       = fmtMB(d.total_data_mb);
  document.getElementById("v-avg").textContent        = d.avg_daily_calls;
  document.getElementById("v-peak").textContent       = d.peak_hour;
  document.getElementById("v-missed").textContent     = d.missed_calls?.toLocaleString();
  document.getElementById("v-active-day").textContent = fmtDateOnly(d.most_active_day);
  document.querySelectorAll(".stat-card.skeleton").forEach(c => c.classList.remove("skeleton"));
}

async function loadTrend() {
  const p = params();
  const r = await fetch(`/api/dashboard/daily-trend?${p}`);
  const d = await r.json();
  const labels = d.labels.map(dt => { const [,m,day] = dt.split("-"); return `${+m}/${+day}`; });
  destroyChart(cTrend);
  cTrend = makeLineChart("chart-trend", labels, [
    { label:"Calls", data:d.calls,   borderColor:"#3B82F6", backgroundColor:"rgba(59,130,246,.1)", fill:true, tension:.35, borderWidth:2, pointRadius:2, yAxisID:"y" },
    { label:"SMS",   data:d.sms,     borderColor:"#10B981", backgroundColor:"rgba(16,185,129,.08)", fill:true, tension:.35, borderWidth:2, pointRadius:2, yAxisID:"y" },
    { label:"Data (MB)", data:d.data_mb, borderColor:"#7C3AED", fill:false, tension:.35, borderWidth:2, pointRadius:2, yAxisID:"y2" },
  ], {
    legend: true,
    scales: {
      x:  { grid:{color:chartColors().grid}, ticks:{color:chartColors().text, maxTicksLimit:14, maxRotation:45} },
      y:  { grid:{color:chartColors().grid}, ticks:{color:chartColors().text}, title:{display:true,text:"Count",color:chartColors().text,font:{size:11}} },
      y2: { position:"right", grid:{drawOnChartArea:false}, ticks:{color:"#7C3AED"}, title:{display:true,text:"MB",color:"#7C3AED",font:{size:11}} },
    }
  });
  // also refresh breakdown
  loadBreakdown();
}

async function loadBreakdown() {
  const p = params();
  const r = await fetch(`/api/calls/summary?${p}`);
  const d = await r.json();
  const bt = d.by_type;
  destroyChart(cBreak);
  cBreak = makeDoughnutChart("chart-breakdown",
    ["Incoming","Outgoing","Missed"],
    [bt.incoming?.count||0, bt.outgoing?.count||0, bt.missed?.count||0],
    ["#3B82F6","#7C3AED","#EF4444"]
  );
}

async function loadHourly() {
  const p = params();
  const r = await fetch(`/api/time/hourly?${p}`);
  const d = await r.json();
  const labels = d.hours.map(h => `${String(h).padStart(2,"0")}:00`);
  destroyChart(cHourly);
  cHourly = makeBarChart("chart-hourly", labels, [
    { label:"Calls", data:d.calls, backgroundColor:"rgba(59,130,246,.75)", borderRadius:3 },
    { label:"SMS",   data:d.sms,   backgroundColor:"rgba(16,185,129,.65)", borderRadius:3 },
  ], { legend:true });
}

async function loadWeekday() {
  const p = params();
  const r = await fetch(`/api/time/weekday?${p}`);
  const d = await r.json();
  destroyChart(cWeekday);
  cWeekday = makeBarChart("chart-weekday", d.days, [
    { label:"Calls", data:d.calls, backgroundColor:"#3B82F6", borderRadius:4 },
    { label:"SMS",   data:d.sms,   backgroundColor:"#7C3AED", borderRadius:4 },
  ], { legend:true });
}

loadAll();
