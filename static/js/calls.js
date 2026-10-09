/* calls.js */
let cDaily, cDonut, cContacts, cDur;
let S = { type:"", start:null, end:null, page:1, perPage:20, search:"" };

document.getElementById("type-filter")?.querySelectorAll(".btn-filter").forEach(b => {
  b.addEventListener("click", () => {
    document.getElementById("type-filter").querySelectorAll(".btn-filter").forEach(x => x.classList.remove("active"));
    b.classList.add("active"); S.type = b.dataset.type; S.page = 1; loadAll();
  });
});
document.getElementById("c-apply")?.addEventListener("click", () => {
  const s = document.getElementById("c-start").value, e = document.getElementById("c-end").value;
  if (!s||!e) { showToast("Pick both dates","error"); return; }
  S.start=s; S.end=e; S.page=1; loadAll();
});
document.getElementById("c-export")?.addEventListener("click", () => {
  const p = bp(); window.open(`/api/export/calls?${p}`,"_blank");
});
let _st;
document.getElementById("call-search")?.addEventListener("input", e => {
  clearTimeout(_st); _st = setTimeout(() => { S.search = e.target.value.toLowerCase(); S.page=1; loadTable(); }, 300);
});
document.getElementById("add-call-btn")?.addEventListener("click", () => {
  document.getElementById("cf-id").value=""; document.getElementById("cf-type").value="";
  document.getElementById("cf-phone").value=""; document.getElementById("cf-name").value="";
  document.getElementById("cf-dur").value="0";
  document.getElementById("cf-dt").value=new Date().toISOString().slice(0,16);
  document.getElementById("call-modal-title").textContent="Add Call Record";
  openModal("call-modal");
});
document.getElementById("call-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const id = document.getElementById("cf-id").value;
  const body = {
    call_type:    document.getElementById("cf-type").value,
    phone_number: document.getElementById("cf-phone").value,
    contact_name: document.getElementById("cf-name").value,
    duration_sec: parseInt(document.getElementById("cf-dur").value)||0,
    call_datetime: document.getElementById("cf-dt").value.replace("T"," ")+":00",
  };
  const url = id ? `/api/calls/${id}` : "/api/calls";
  const res = await fetch(url, { method: id?"PUT":"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  if (!res.ok) { const err=await res.json(); showToast(err.error||"Save failed","error"); return; }
  closeModal("call-modal"); showToast(id?"Updated":"Added","success"); loadAll();
});

function bp() {
  const p = new URLSearchParams();
  if (S.start) p.set("start",S.start); if (S.end) p.set("end",S.end); return p;
}
function loadAll() { loadSummary(); loadTable(); }

async function loadSummary() {
  const r = await fetch(`/api/calls/summary?${bp()}`);
  const d = await r.json();
  const bt = d.by_type;
  document.getElementById("cv-total").textContent  = d.total?.toLocaleString();
  document.getElementById("cv-in").textContent     = (bt.incoming?.count||0).toLocaleString();
  document.getElementById("cv-out").textContent    = (bt.outgoing?.count||0).toLocaleString();
  document.getElementById("cv-missed").textContent = (bt.missed?.count||0).toLocaleString();

  const labels = d.daily.map(r => { const[,m,day]=r.date.split("-"); return `${+m}/${+day}`; });
  destroyChart(cDaily);
  cDaily = makeBarChart("chart-calls-daily", labels,
    [{ label:"Calls", data:d.daily.map(r=>r.count), backgroundColor:"rgba(59,130,246,.75)", borderRadius:3 }]);

  destroyChart(cDonut);
  cDonut = makeDoughnutChart("chart-calls-donut",
    ["Incoming","Outgoing","Missed"],
    [bt.incoming?.count||0, bt.outgoing?.count||0, bt.missed?.count||0],
    ["#3B82F6","#7C3AED","#EF4444"]
  );

  destroyChart(cContacts);
  cContacts = makeBarChart("chart-top-contacts",
    d.top_contacts.map(c=>c.name||c.number),
    [{ label:"Calls", data:d.top_contacts.map(c=>c.count), backgroundColor:"#7C3AED", borderRadius:4 }],
    { horizontal:true }
  );

  destroyChart(cDur);
  cDur = makeBarChart("chart-duration", labels,
    [{ label:"Mins", data:d.daily.map(r=>Math.round((r.duration||0)/60)), backgroundColor:"rgba(16,185,129,.7)", borderRadius:3 }]);
}

async function loadTable() {
  const p = bp(); p.set("page",S.page); p.set("per_page",S.perPage); if(S.type) p.set("type",S.type);
  const r = await fetch(`/api/calls?${p}`);
  const d = await r.json();
  let rows = d.data;
  if (S.search) rows = rows.filter(r => (r.contact_name+r.phone_number).toLowerCase().includes(S.search));
  const tb = document.getElementById("calls-tbody");
  tb.innerHTML = rows.length ? rows.map(r=>`
    <tr>
      <td>${fmtDate(r.call_datetime)}</td><td>${r.contact_name||"—"}</td>
      <td>${r.phone_number}</td><td>${badge(r.call_type)}</td>
      <td>${r.call_type==="missed"?"—":fmtDuration(r.duration_sec)}</td>
      <td>
        <button class="btn-edit" onclick='editCall(${JSON.stringify(r).replace(/'/g,"&#39;")})'>Edit</button>
        <button class="btn-danger" onclick="deleteCall(${r.id})">Del</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty-row">No records</td></tr>`;
  buildPagination("calls-pager", S.page, d.total, S.perPage, p => { S.page=p; loadTable(); });
}

function editCall(r) {
  document.getElementById("cf-id").value    = r.id;
  document.getElementById("cf-type").value  = r.call_type;
  document.getElementById("cf-phone").value = r.phone_number;
  document.getElementById("cf-name").value  = r.contact_name||"";
  document.getElementById("cf-dur").value   = r.duration_sec||0;
  document.getElementById("cf-dt").value    = (r.call_datetime||"").replace(" ","T").slice(0,16);
  document.getElementById("call-modal-title").textContent = "Edit Call Record";
  openModal("call-modal");
}
window.editCall = editCall;

async function deleteCall(id) {
  if (!confirm("Delete this record?")) return;
  await fetch(`/api/calls/${id}`,{method:"DELETE"});
  showToast("Deleted","success"); loadAll();
}
window.deleteCall = deleteCall;

loadAll();
