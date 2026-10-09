/* records.js */
let S = { table:"calls", start:null, end:null, page:1, perPage:25, search:"" };

const CFG = {
  calls: {
    title: "Call Records",
    headers: ["ID","Date / Time","Contact","Number","Type","Duration"],
    cols: 6,
    row: r => `<td>${r.id}</td><td>${fmtDate(r.call_datetime)}</td><td>${r.contact_name||"—"}</td>
               <td>${r.phone_number}</td><td>${badge(r.call_type)}</td>
               <td>${r.call_type==="missed"?"—":fmtDuration(r.duration_sec)}</td>`,
  },
  sms: {
    title: "SMS Records",
    headers: ["ID","Date / Time","Contact","Number","Type"],
    cols: 5,
    row: r => `<td>${r.id}</td><td>${fmtDate(r.sms_datetime)}</td><td>${r.contact_name||"—"}</td>
               <td>${r.phone_number}</td><td>${badge(r.sms_type)}</td>`,
  },
  data_usage: {
    title: "Data Usage Records",
    headers: ["ID","Date","App","Download (MB)","Upload (MB)","Total (MB)"],
    cols: 6,
    row: r => `<td>${r.id}</td><td>${fmtDateOnly(r.usage_date)}</td><td>${r.app_name}</td>
               <td>${r.download_mb?.toFixed(2)}</td><td>${r.upload_mb?.toFixed(2)}</td>
               <td>${(r.download_mb+r.upload_mb).toFixed(2)}</td>`,
  },
};

document.getElementById("rec-tbl-filter")?.querySelectorAll(".btn-filter").forEach(b=>{
  b.addEventListener("click",()=>{
    document.getElementById("rec-tbl-filter").querySelectorAll(".btn-filter").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); S.table=b.dataset.table; S.page=1; S.start=S.end=null;
    document.getElementById("r-start").value=document.getElementById("r-end").value="";
    loadTable();
  });
});
document.getElementById("r-apply")?.addEventListener("click",()=>{
  const s=document.getElementById("r-start").value, e=document.getElementById("r-end").value;
  if(!s||!e){showToast("Pick both dates","error");return;}
  S.start=s; S.end=e; S.page=1; loadTable();
});
document.getElementById("r-export")?.addEventListener("click",()=>{
  const p=bp(); window.open(`/api/export/${S.table}?${p}`,"_blank");
});
let _st;
document.getElementById("rec-search")?.addEventListener("input",e=>{
  clearTimeout(_st); _st=setTimeout(()=>{S.search=e.target.value.toLowerCase();S.page=1;loadTable();},300);
});

function bp(){const p=new URLSearchParams();if(S.start)p.set("start",S.start);if(S.end)p.set("end",S.end);return p;}

async function loadTable(){
  const cfg=CFG[S.table];
  document.getElementById("rec-title").textContent=cfg.title;
  document.getElementById("rec-thead").innerHTML=
    `<tr>${cfg.headers.map(h=>`<th>${h}</th>`).join("")}<th>Actions</th></tr>`;
  const tbody=document.getElementById("rec-tbody");
  tbody.innerHTML=`<tr><td colspan="${cfg.cols+1}" class="loading-row">Loading…</td></tr>`;

  const p=bp(); p.set("page",S.page); p.set("per_page",S.perPage);
  const ep=S.table==="data_usage"?"data":S.table;
  const r=await fetch(`/api/${ep}?${p}`);
  const d=await r.json();
  document.getElementById("rec-count").textContent=`${d.total.toLocaleString()} records`;

  let rows=d.data;
  if(S.search){const q=S.search;rows=rows.filter(row=>Object.values(row).some(v=>String(v).toLowerCase().includes(q)));}

  tbody.innerHTML=rows.length?rows.map(row=>`
    <tr>${cfg.row(row)}<td><button class="btn-danger btn-sm" onclick="delRec(${row.id})">Delete</button></td></tr>
  `).join(""):`<tr><td colspan="${cfg.cols+1}" class="empty-row">No records found</td></tr>`;

  buildPagination("rec-pager",S.page,d.total,S.perPage,pg=>{S.page=pg;loadTable();});
}

async function delRec(id){
  if(!confirm(`Delete record #${id}?`))return;
  const ep=S.table==="data_usage"?"data":S.table;
  const res=await fetch(`/api/${ep}/${id}`,{method:"DELETE"});
  if(!res.ok){showToast("Delete failed","error");return;}
  showToast("Deleted","success"); loadTable();
}
window.delRec=delRec;

loadTable();
