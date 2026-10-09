/* import.js — CSV upload, drag & drop, history */

/* ── Wire up each upload zone ── */
const ZONES = [
  { dz: "dz-calls", file: "file-calls", btn: "btn-upload-calls", result: "result-calls", replace: "replace-calls", fname: "file-name-calls", endpoint: "/api/import/calls" },
  { dz: "dz-sms",   file: "file-sms",   btn: "btn-upload-sms",   result: "result-sms",   replace: "replace-sms",   fname: "file-name-sms",   endpoint: "/api/import/sms"   },
  { dz: "dz-data",  file: "file-data",  btn: "btn-upload-data",  result: "result-data",  replace: "replace-data",  fname: "file-name-data",  endpoint: "/api/import/data"  },
];

ZONES.forEach(z => {
  const dz      = document.getElementById(z.dz);
  const fileIn  = document.getElementById(z.file);
  const btn     = document.getElementById(z.btn);
  const fnDisp  = document.getElementById(z.fname);

  // Click on drop zone → open file picker
  dz?.addEventListener("click", () => fileIn?.click());

  // File selected via picker
  fileIn?.addEventListener("change", () => {
    const f = fileIn.files[0];
    if (f) {
      btn.disabled = false;
      dz.classList.add("dz-has-file");
      fnDisp.textContent = `📄 ${f.name}  (${(f.size/1024).toFixed(1)} KB)`;
    }
  });

  // Drag & drop
  dz?.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("dz-over"); });
  dz?.addEventListener("dragleave", () => dz.classList.remove("dz-over"));
  dz?.addEventListener("drop", e => {
    e.preventDefault();
    dz.classList.remove("dz-over");
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".csv")) {
      // Assign to the hidden input via DataTransfer
      const dt = new DataTransfer();
      dt.items.add(f);
      fileIn.files = dt.files;
      btn.disabled = false;
      dz.classList.add("dz-has-file");
      fnDisp.textContent = `📄 ${f.name}  (${(f.size/1024).toFixed(1)} KB)`;
    } else {
      showToast("Please drop a .csv file", "error");
    }
  });

  // Upload button
  btn?.addEventListener("click", () => uploadFile(z));
});

/* ── Upload function ── */
async function uploadFile(z) {
  const fileIn  = document.getElementById(z.file);
  const btn     = document.getElementById(z.btn);
  const result  = document.getElementById(z.result);
  const replace = document.getElementById(z.replace)?.checked;

  if (!fileIn?.files[0]) { showToast("No file selected", "error"); return; }

  const fd = new FormData();
  fd.append("file", fileIn.files[0]);
  fd.append("replace", replace ? "true" : "false");

  btn.disabled = true;
  btn.textContent = "Uploading…";
  result.innerHTML = `<div class="upload-progress">⏳ Processing…</div>`;

  try {
    const res  = await fetch(z.endpoint, { method: "POST", body: fd });
    const data = await res.json();

    if (!res.ok || data.error) {
      result.innerHTML = `<div class="upload-error">❌ ${data.error || "Upload failed"}</div>`;
      showToast("Upload failed", "error");
    } else {
      const errHtml = data.errors?.length
        ? `<details class="error-details"><summary>${data.errors.length} row error(s) — click to expand</summary><ul>${data.errors.map(e=>`<li>${e}</li>`).join("")}</ul></details>`
        : "";
      result.innerHTML = `
        <div class="upload-success">
          ✅ Imported <strong>${data.rows_imported}</strong> rows
          ${data.rows_failed > 0 ? `· <span class="text-warn">${data.rows_failed} failed</span>` : ""}
          ${data.replaced ? "· <em>existing data replaced</em>" : "· <em>appended to existing data</em>"}
        </div>
        ${errHtml}
      `;
      showToast(`Imported ${data.rows_imported} rows!`, "success");
      loadHistory();
    }
  } catch (err) {
    result.innerHTML = `<div class="upload-error">❌ Network error — is the server running?</div>`;
    showToast("Network error", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = btn.id.includes("calls") ? "Upload Calls CSV"
                    : btn.id.includes("sms")   ? "Upload SMS CSV"
                    : "Upload Data CSV";
  }
}

/* ── Import history table ── */
async function loadHistory() {
  const tbody = document.getElementById("import-history-tbody");
  try {
    const r    = await fetch("/api/import/history");
    const rows = await r.json();
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-row">No imports yet</td></tr>`;
      return;
    }
    const typeIcon = { calls:"📞", sms:"💬", data:"📶" };
    tbody.innerHTML = rows.map(row => `
      <tr>
        <td>${fmtDate(row.imported_at)}</td>
        <td>${typeIcon[row.import_type]||"📄"} ${row.import_type}</td>
        <td class="muted" style="max-width:140px;overflow:hidden;text-overflow:ellipsis" title="${row.filename}">${row.filename}</td>
        <td><span style="color:var(--green);font-weight:700">${row.rows_ok}</span></td>
        <td><span style="color:${row.rows_failed>0?"var(--red)":"var(--muted)"}">${row.rows_failed}</span></td>
        <td>${row.replaced ? '<span class="badge badge-missed">replaced</span>' : '<span class="badge badge-incoming">appended</span>'}</td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Failed to load history</td></tr>`;
  }
}

/* ── Init ── */
loadHistory();
