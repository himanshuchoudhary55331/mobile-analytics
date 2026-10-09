/* sms.js */
let cSmsDaily, cSmsPie, cSmsHourly;
let S = { type:"", start:null, end:null, page:1, perPage:20, search:"" };

document.getElementById("sms-type-filter")?.querySelectorAll(".btn-filter").forEach(b => {
  b.addEventListener("click", () => {
    document.getElementById("sms-type-filter").querySelectorAll(".btn-filter").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); S.type=b.dataset.type; S.page=1; loadAll();
  });
});
document.getElementById("s-apply")?.addEventListener("click", () => {
  const s=document.getElementById("s-start").value, e=document.getElementById("s-end").value;
  if(!s||!e){showToast("Pick both dates","error");return;}
  S.start=s; S.end=e; S.page=1; loadAll();
});
document.getElementById("s-export")?.addEventListener("click", () => { window.open(`/api/export/sms?${bp()}`,"_blank"); });
let _st;
document.getElementById("sms-search")?.addEventListener("input", e => {
  clearTimeout(_st); _st=setTimeout(()=>{S.search=e.target.value.toLowerCase();S.page=1;loadTable();},300);
});
document.getElementById("add-sms-btn")?.addEventListener("click", () => {
  document.getElementById("sf-type").value=""; document.getElementById("sf-phone").value="";
  document.getElementById("sf-name").value="";
  document.getElementById("sf-dt").value=new Date().toISOString().slice(0,16);
  openModal("sms-modal");
});
document.getElementById("sms-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const body={sms_type:document.getElementById("sf-type").value, phone_number:document.getElementById("sf-phone").value,
               contact_name:document.getElementById("sf-name").value, sms_datetime:document.getElementById("sf-dt").value.replace("T"," ")+":00"};
  const res=await fetch("/api/sms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!res.ok){const err=await res.json();showToast(err.error||"Save failed","error");return;}
  closeModal("sms-modal"); showToast("Added","success"); loadAll();
});

function bp(){const p=new URLSearchParams();if(S.start)p.set("start",S.start);if(S.end)p.set("end",S.end);return p;}
function loadAll(){loadSummary();loadTable();}

async function loadSummary(){
  const r=await fetch(`/api/sms/summary?${bp()}`);
  const d=await r.json();
  document.getElementById("sv-total").textContent=d.total?.toLocaleString();
  document.getElementById("sv-sent").textContent=(d.by_type.sent||0).toLocaleString();
  document.getElementById("sv-recv").textContent=(d.by_type.received||0).toLocaleString();

  const labels=d.daily.map(r=>{const[,m,day]=r.date.split("-");return `${+m}/${+day}`;});
  destroyChart(cSmsDaily);
  cSmsDaily=makeBarChart("chart-sms-daily",labels,[
    {label:"Sent",data:d.daily.map(r=>r.sent),backgroundColor:"rgba(124,58,237,.75)",borderRadius:3},
    {label:"Received",data:d.daily.map(r=>r.received),backgroundColor:"rgba(16,185,129,.7)",borderRadius:3},
  ],{legend:true});

  destroyChart(cSmsPie);
  cSmsPie=makeDoughnutChart("chart-sms-pie",["Sent","Received"],[d.by_type.sent||0,d.by_type.received||0],["#7C3AED","#10B981"]);

  const hMap={}; (d.hourly||[]).forEach(h=>{hMap[h.hour]=h.count;});
  const hLabels=Array.from({length:24},(_,i)=>`${String(i).padStart(2,"0")}:00`);
  const hData=Array.from({length:24},(_,i)=>hMap[i]||0);
  destroyChart(cSmsHourly);
  cSmsHourly=makeLineChart("chart-sms-hourly",hLabels,[
    {label:"SMS",data:hData,borderColor:"#7C3AED",backgroundColor:"rgba(124,58,237,.1)",fill:true,tension:.4,borderWidth:2,pointRadius:3}
  ],{legend:false});
}

async function loadTable(){
  const p=bp(); p.set("page",S.page); p.set("per_page",S.perPage); if(S.type)p.set("type",S.type);
  const r=await fetch(`/api/sms?${p}`);
  const d=await r.json();
  let rows=d.data;
  if(S.search) rows=rows.filter(r=>(r.contact_name+r.phone_number).toLowerCase().includes(S.search));
  const tb=document.getElementById("sms-tbody");
  tb.innerHTML=rows.length?rows.map(r=>`
    <tr><td>${fmtDate(r.sms_datetime)}</td><td>${r.contact_name||"—"}</td>
    <td>${r.phone_number}</td><td>${badge(r.sms_type)}</td>
    <td><button class="btn-danger" onclick="deleteSms(${r.id})">Del</button></td></tr>`).join("")
    :`<tr><td colspan="5" class="empty-row">No records</td></tr>`;
  buildPagination("sms-pager",S.page,d.total,S.perPage,p=>{S.page=p;loadTable();});
}

async function deleteSms(id){
  if(!confirm("Delete?"))return;
  await fetch(`/api/sms/${id}`,{method:"DELETE"});
  showToast("Deleted","success"); loadAll();
}
window.deleteSms=deleteSms;

loadAll();
