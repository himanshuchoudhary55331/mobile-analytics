/* data_usage.js */
let cDataDaily, cUlDl, cAppBar, cAppPie;
let S = { days:30, start:null, end:null };
const APP_COLORS = ["#3B82F6","#7C3AED","#10B981","#F59E0B","#EF4444","#06B6D4","#84CC16","#F97316","#EC4899","#6366F1"];

document.getElementById("dp-filter")?.querySelectorAll(".btn-filter").forEach(b => {
  b.addEventListener("click", () => {
    document.getElementById("dp-filter").querySelectorAll(".btn-filter").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); S.days=parseInt(b.dataset.days); S.start=S.end=null; loadAll();
  });
});
document.getElementById("d-apply")?.addEventListener("click", ()=>{
  const s=document.getElementById("d-start").value, e=document.getElementById("d-end").value;
  if(!s||!e){showToast("Pick both dates","error");return;}
  S.start=s; S.end=e; S.days=null;
  document.getElementById("dp-filter").querySelectorAll(".btn-filter").forEach(x=>x.classList.remove("active"));
  loadAll();
});
document.getElementById("d-export")?.addEventListener("click",()=>window.open(`/api/export/data_usage?${bp()}`,"_blank"));
document.getElementById("save-limit-btn")?.addEventListener("click", async ()=>{
  const v=parseFloat(document.getElementById("limit-input").value);
  if(!v||v<1){showToast("Enter valid MB limit","error");return;}
  await fetch("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({monthly_data_limit_mb:v})});
  showToast("Limit saved!","success"); loadAll();
});
document.getElementById("add-data-btn")?.addEventListener("click",()=>{
  document.getElementById("df-app").value=""; document.getElementById("df-date").value=todayStr();
  document.getElementById("df-dl").value="0"; document.getElementById("df-ul").value="0";
  openModal("data-modal");
});
document.getElementById("data-form")?.addEventListener("submit", async e=>{
  e.preventDefault();
  const body={app_name:document.getElementById("df-app").value, usage_date:document.getElementById("df-date").value,
               download_mb:parseFloat(document.getElementById("df-dl").value)||0,
               upload_mb:parseFloat(document.getElementById("df-ul").value)||0};
  const res=await fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!res.ok){const err=await res.json();showToast(err.error||"Save failed","error");return;}
  closeModal("data-modal"); showToast("Added","success"); loadAll();
});

function bp(){
  const p=new URLSearchParams();
  p.set("start", S.start||daysAgoStr(S.days||30));
  p.set("end",   S.end||todayStr());
  return p;
}
function loadAll(){loadSummary();}

async function loadSummary(){
  const r=await fetch(`/api/data/summary?${bp()}`);
  const d=await r.json();
  document.getElementById("dv-total").textContent = fmtMB(d.total_mb);
  document.getElementById("dv-dl").textContent    = fmtMB(d.download_mb);
  document.getElementById("dv-ul").textContent    = fmtMB(d.upload_mb);
  document.getElementById("dv-top").textContent   = d.by_app[0]?.app||"—";

  // Monthly limit monitor (always last 30 days)
  const mp=new URLSearchParams(); mp.set("start",daysAgoStr(30)); mp.set("end",todayStr());
  const mr=await fetch(`/api/data/summary?${mp}`); const md=await mr.json();
  const used=md.total_mb, limit=md.monthly_limit_mb;
  document.getElementById("limit-input").value = limit;
  document.getElementById("limit-text").textContent = `${fmtMB(used)} / ${fmtMB(limit)}`;
  const pct=Math.min(100,(used/limit)*100);
  const bar=document.getElementById("prog-bar");
  bar.style.width=pct+"%";
  bar.className="progress-bar"+(pct>=100?" over":pct>=80?" warn":"");
  document.getElementById("limit-warn").hidden=pct<100;

  // Daily chart
  const labels=d.daily.map(r=>{const[,m,day]=r.date.split("-");return`${+m}/${+day}`;});
  destroyChart(cDataDaily);
  cDataDaily=makeBarChart("chart-data-daily",labels,[
    {label:"Download",data:d.daily.map(r=>r.download_mb),backgroundColor:"rgba(59,130,246,.75)",borderRadius:3},
    {label:"Upload",  data:d.daily.map(r=>r.upload_mb),  backgroundColor:"rgba(124,58,237,.65)",borderRadius:3},
  ],{legend:true,stacked:true});

  // UL/DL doughnut
  destroyChart(cUlDl);
  cUlDl=makeDoughnutChart("chart-uldl",["Download","Upload"],[d.download_mb,d.upload_mb],["#3B82F6","#7C3AED"]);

  // App bar
  const top10=d.by_app.slice(0,10);
  destroyChart(cAppBar);
  cAppBar=makeBarChart("chart-app-bar",top10.map(a=>a.app),[
    {label:"Download",data:top10.map(a=>a.download_mb),backgroundColor:"rgba(59,130,246,.8)",borderRadius:3},
    {label:"Upload",  data:top10.map(a=>a.upload_mb),  backgroundColor:"rgba(124,58,237,.7)",borderRadius:3},
  ],{legend:true,stacked:true});

  // Top-5 pie
  const top5=d.by_app.slice(0,5);
  destroyChart(cAppPie);
  cAppPie=makeDoughnutChart("chart-app-pie",top5.map(a=>a.app),top5.map(a=>a.total_mb),APP_COLORS.slice(0,5),{pie:true});

  // App table
  const total=d.total_mb||1;
  document.getElementById("app-tbody").innerHTML=d.by_app.map(a=>{
    const pct=((a.total_mb/total)*100).toFixed(1);
    return `<tr>
      <td><strong>${a.app}</strong></td>
      <td>${a.download_mb.toFixed(1)}</td><td>${a.upload_mb.toFixed(1)}</td>
      <td>${fmtMB(a.total_mb)}</td>
      <td><div style="display:flex;align-items:center;gap:.4rem">
        <div style="width:70px;height:6px;background:var(--border);border-radius:999px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:var(--blue);border-radius:999px"></div></div>
        <span>${pct}%</span></div></td>
    </tr>`;
  }).join("")||`<tr><td colspan="5" class="empty-row">No data</td></tr>`;
}

loadAll();
