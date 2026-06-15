// admin/dashboard.js — RSP Attendance Admin Dashboard

'use strict';

const DEPARTMENTS = [
  'Blast Furnace', 'Steel Melting Shop', 'Continuous Casting',
  'Hot Strip Mill', 'Cold Rolling Mill', 'Plate Mill',
  'Wire Rod Mill', 'Power Plant', 'Oxygen Plant',
  'Instrumentation', 'Electrical', 'Mechanical',
  'Civil & Structural', 'IT & Automation', 'HR & Admin',
  'Finance & Accounts', 'Safety & Environment', 'Medical'
];

const BATCHES = [
  '2024-A', '2024-B', '2024-C', '2024-D',
  '2025-A', '2025-B', '2025-C', '2025-D'
];

const $ = id => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id)?.classList.add('active');
}

function showToast(msg, type = '', duration = 3500) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `show ${type}`;
  setTimeout(() => { t.className = t.className.replace('show', '').trim(); }, duration);
}

function getISTDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

let currentRecords = []; // grouped per trainee for selected date

// ── Init selects ──
function initFilters() {
  const deptSel = $('filterDept');
  if (deptSel) {
    DEPARTMENTS.forEach(d => {
      const o = document.createElement('option');
      o.value = d; o.textContent = d;
      deptSel.appendChild(o);
    });
  }

  const batchSel = $('filterBatch');
  if (batchSel) {
    BATCHES.forEach(b => {
      const o = document.createElement('option');
      o.value = b; o.textContent = b;
      batchSel.appendChild(o);
    });
  }

  const dateEl = $('filterDate');
  if (dateEl) dateEl.value = getISTDate();
}

// ── Auth ──
async function handleAdminLogin() {
  const email = $('adminEmail').value.trim().toLowerCase();
  const password = $('adminPassword').value;
  const btn = $('adminLoginBtn');
  const alertEl = $('adminLoginAlert');
  alertEl.style.display = 'none';

  if (!email || !password) {
    alertEl.textContent = 'Enter email and password.';
    alertEl.style.display = 'flex';
    return;
  }

  btn.disabled = true;
  btn.classList.add('btn-loading');

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const user = data.user;
    const role = user?.app_metadata?.role;

    if (role !== 'admin') {
      await supabase.auth.signOut();
      alertEl.textContent = 'This account does not have admin access.';
      alertEl.style.display = 'flex';
      return;
    }

    showScreen('adminDashboardScreen');
    loadAttendance();
  } catch (err) {
    console.error(err);
    alertEl.textContent = err.message || 'Login failed. Check credentials.';
    alertEl.style.display = 'flex';
  } finally {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
  }
}

function handleAdminLogout() {
  supabase.auth.signOut();
  showScreen('adminLoginScreen');
}

// ── Load + render attendance ──
async function loadAttendance() {
  const date = $('filterDate').value;
  const dept = $('filterDept').value;
  const batch = $('filterBatch').value;
  const search = $('filterSearch').value.trim();

  const tbody = $('attendanceTableBody');
  tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Loading…</td></tr>';

  try {
    let query = supabase.from('attendance').select('*').eq('date', date);

    if (dept) {
      query = query.eq('department', dept);
    }
    if (batch) {
      query = query.eq('batch', batch);
    }
    if (search) {
      query = query.or(`trainee_id.ilike.%${search}%,full_name.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Map DB columns to JSON properties expected by client dashboard
    const records = data.map(r => ({
      traineeId: r.trainee_id,
      fullName: r.full_name,
      department: r.department,
      batch: r.batch,
      session: r.session,
      date: r.date,
      uid: r.uid
    }));

    // Group by traineeId
    const grouped = {};
    records.forEach(r => {
      if (!grouped[r.traineeId]) {
        grouped[r.traineeId] = {
          traineeId: r.traineeId, fullName: r.fullName,
          department: r.department, batch: r.batch,
          MORNING: false, MIDDAY: false
        };
      }
      grouped[r.traineeId][r.session] = true;
    });

    currentRecords = Object.values(grouped).sort((a, b) =>
      a.traineeId.localeCompare(b.traineeId)
    );

    renderTable();
    renderSummary();

  } catch (err) {
    console.error('loadAttendance error:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Error loading records: ${err.message}</td></tr>`;
  }
}

function renderTable() {
  const tbody = $('attendanceTableBody');

  if (currentRecords.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No records found for the selected filters.</td></tr>';
    return;
  }

  tbody.innerHTML = currentRecords.map(r => {
    const finalStatus = (r.MORNING && r.MIDDAY) ? 'FULL_DAY'
                       : (r.MORNING || r.MIDDAY) ? 'HALF_DAY' : 'ABSENT';
    const finalClass = finalStatus === 'FULL_DAY' ? 'full' : finalStatus === 'HALF_DAY' ? 'half' : 'none';

    return `
      <tr>
        <td>${r.traineeId}</td>
        <td>${r.fullName || '—'}</td>
        <td>${r.department || '—'}</td>
        <td>${r.batch || '—'}</td>
        <td><span class="status-pill ${r.MORNING ? 'present' : 'absent'}">${r.MORNING ? 'PRESENT' : 'ABSENT'}</span></td>
        <td><span class="status-pill ${r.MIDDAY ? 'present' : 'absent'}">${r.MIDDAY ? 'PRESENT' : 'ABSENT'}</span></td>
        <td><span class="status-pill ${finalClass}">${finalStatus.replace('_',' ')}</span></td>
      </tr>
    `;
  }).join('');
}

function renderSummary() {
  const total = currentRecords.length;
  const full = currentRecords.filter(r => r.MORNING && r.MIDDAY).length;
  const half = currentRecords.filter(r => r.MORNING !== r.MIDDAY).length;
  const morning = currentRecords.filter(r => r.MORNING).length;
  const midday = currentRecords.filter(r => r.MIDDAY).length;

  $('summaryCards').innerHTML = `
    <div class="summary-card"><div class="value">${total}</div><div class="label">Total Trainees</div></div>
    <div class="summary-card"><div class="value">${full}</div><div class="label">Full Day</div></div>
    <div class="summary-card"><div class="value">${half}</div><div class="label">Half Day</div></div>
    <div class="summary-card"><div class="value">${morning}</div><div class="label">Morning Present</div></div>
    <div class="summary-card"><div class="value">${midday}</div><div class="label">Midday Present</div></div>
  `;
}

// ── CSV Export ──
function buildAttendanceCsv(records) {
  const grouped = {};
  records.forEach(r => {
    const key = `${r.date}_${r.traineeId}`;
    if (!grouped[key]) {
      grouped[key] = {
        date: r.date, traineeId: r.traineeId, fullName: r.fullName,
        department: r.department, batch: r.batch,
        MORNING: false, MIDDAY: false
      };
    }
    grouped[key][r.session] = true;
  });

  const rows = Object.values(grouped).map(g => {
    const finalStatus = (g.MORNING && g.MIDDAY) ? 'FULL_DAY'
                       : (g.MORNING || g.MIDDAY) ? 'HALF_DAY' : 'ABSENT';
    return [g.date, g.traineeId, g.fullName, g.department, g.batch,
            g.MORNING ? 'PRESENT' : 'ABSENT',
            g.MIDDAY ? 'PRESENT' : 'ABSENT',
            finalStatus];
  });

  const header = ['Date', 'TraineeID', 'FullName', 'Department', 'Batch', 'Morning', 'Midday', 'FinalStatus'];
  const csvLines = [header, ...rows].map(row =>
    row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  );

  return { csv: csvLines.join('\n'), count: rows.length };
}

async function handleExportCsv() {
  const date = $('filterDate').value;
  const dept = $('filterDept').value;
  const batch = $('filterBatch').value;
  const btn = $('exportCsvBtn');

  btn.disabled = true;
  btn.classList.add('btn-loading');

  try {
    let query = supabase.from('attendance').select('*').eq('date', date);

    if (dept) {
      query = query.eq('department', dept);
    }
    if (batch) {
      query = query.eq('batch', batch);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Map DB columns to properties expected by buildAttendanceCsv
    const records = data.map(r => ({
      traineeId: r.trainee_id,
      fullName: r.full_name,
      department: r.department,
      batch: r.batch,
      session: r.session,
      date: r.date
    }));

    const { csv, count } = buildAttendanceCsv(records);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rsp-attendance_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`✅ Exported ${count} records`, 'success');
  } catch (err) {
    console.error('Export error:', err);
    showToast(err.message || 'Export failed', 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
  }
}

// ── Auth state ──
function initAuth() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user;
    if (user) {
      const role = user?.app_metadata?.role;
      if (role === 'admin') {
        showScreen('adminDashboardScreen');
        loadAttendance();
        return;
      }
    }
    showScreen('adminLoginScreen');
  });
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  initFilters();
  initAuth();

  $('adminLoginBtn')?.addEventListener('click', handleAdminLogin);
  $('adminPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleAdminLogin(); });
  $('adminLogoutBtn')?.addEventListener('click', handleAdminLogout);
  $('applyFiltersBtn')?.addEventListener('click', loadAttendance);
  $('exportCsvBtn')?.addEventListener('click', handleExportCsv);
});
