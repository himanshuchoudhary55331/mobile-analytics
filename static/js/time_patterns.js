/* time_patterns.js */
let cHourly, cTod, cWkCalls, cWkSms;
let S = { days:30, start:null, end:null };

document.getElementById("tp-filter")?.querySelectorAll(".btn-filter").forEach(b=>{
  b.addEventListener("click",()=>{
    document.getElementById("tp-filter").querySelectorAll(".btn-filter").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); S.days=parseInt(b.dataset.days); S.start=S.end=null; loadAll();
  });
});
document.getElementById("tp-apply")?.addEventListener("click",()=>{
  const s=document.getElementById("tp-start").value, e=document.getElementById("tp-end").value;
  if(!s||!e){showToast("Pick both dates","error");return;}
  S.start=s; S.end=e; S.days=null;
  document.getElementById("tp-filter").querySelectorAll(".btn-filter").forEach(x=>x.classList.remove("active"));
  loadAll();
});

function bp(){
  const p=new URLSearchParams();
  p.set("start",S.start||daysAgoStr(S.days||30));
  p.set("end",  S.end||todayStr());
  return p;
}
function loadAll(){loadHourly();loadWeekday();loadHeatmap();}

async function loadHourly(){
  const r=await fetch(`/api/time/hourly?${bp()}`);
  const d=await r.json();
  let morning=0,afternoon=0,evening=0,night=0;
  d.calls.forEach((c,i)=>{
    const h=d.hours[i];
    if(h>=6&&h<12) morning+=c;
    else if(h>=12&&h<17) afternoon+=c;
    else if(h>=17&&h<21) evening+=c;
    else night+=c;
  });
  document.getElementById("tod-morning").textContent   = morning.toLocaleString();
  document.getElementById("tod-afternoon").textContent = afternoon.toLocaleString();
  document.getElementById("tod-evening").textContent   = evening.toLocaleString();
  document.getElementById("tod-night").textContent     = night.toLocaleString();

  const labels=d.hours.map(h=>`${String(h).padStart(2,"0")}:00`);
  destroyChart(cHourly);
  cHourly=makeLineChart("chart-tp-hourly",labels,[
    {label:"Calls",data:d.calls,borderColor:"#3B82F6",backgroundColor:"rgba(59,130,246,.1)",fill:true,tension:.4,borderWidth:2.5,pointRadius:3},
    {label:"SMS",  data:d.sms,  borderColor:"#10B981",backgroundColor:"rgba(16,185,129,.08)",fill:true,tension:.4,borderWidth:2.5,pointRadius:3},
  ],{legend:true});

  destroyChart(cTod);
  cTod=makeDoughnutChart("chart-tp-tod",
    ["Morning","Afternoon","Evening","Night"],
    [morning,afternoon,evening,night],
    ["#F59E0B","#10B981","#7C3AED","#1E293B"]
  );
}

async function loadWeekday(){
  const r=await fetch(`/api/time/weekday?${bp()}`);
  const d=await r.json();
  destroyChart(cWkCalls);
  cWkCalls=makeBarChart("chart-tp-wk-calls",d.days,[
    {label:"Calls",data:d.calls,
     backgroundColor:d.days.map((_,i)=>i>=5?"rgba(239,68,68,.75)":"rgba(59,130,246,.75)"),
     borderRadius:5}
  ],{legend:false});
  destroyChart(cWkSms);
  cWkSms=makeBarChart("chart-tp-wk-sms",d.days,[
    {label:"SMS",data:d.sms,
     backgroundColor:d.days.map((_,i)=>i>=5?"rgba(245,158,11,.75)":"rgba(124,58,237,.75)"),
     borderRadius:5}
  ],{legend:false});
}

async function loadHeatmap(){
  const el=document.getElementById("heatmap");
  if(!el)return;
  const r=await fetch(`/api/time/heatmap?${bp()}`);
  const data=await r.json();
  const lookup={};
  data.forEach(({dow,hour,count})=>{ if(!lookup[dow])lookup[dow]={}; lookup[dow][hour]=count; });
  const maxC=Math.max(1,...data.map(d=>d.count));
  const dayNames=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const dark=document.documentElement.getAttribute("data-theme")==="dark";
  let html=`<div class="heatmap-grid">`;
  html+=`<div class="hm-cell hm-label"></div>`;
  for(let h=0;h<24;h++) html+=`<div class="hm-cell hm-header">${String(h).padStart(2,"0")}</div>`;
  for(let dow=0;dow<=6;dow++){
    html+=`<div class="hm-cell hm-label">${dayNames[dow]}</div>`;
    for(let h=0;h<24;h++){
      const cnt=(lookup[dow]&&lookup[dow][h])||0;
      const alpha=0.06+(cnt/maxC)*0.88;
      const bg=dark?`rgba(99,179,237,${alpha.toFixed(2)})`:`rgba(59,130,246,${alpha.toFixed(2)})`;
      const tc=cnt/maxC>0.5?"#fff":(dark?"#94A3B8":"#475569");
      html+=`<div class="hm-cell" title="${dayNames[dow]} ${String(h).padStart(2,"0")}:00 — ${cnt} calls" style="background:${bg};color:${tc}">${cnt>0?cnt:""}</div>`;
    }
  }
  html+=`</div>`;
  el.innerHTML=html;
}

loadAll();
