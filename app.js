// ============================================================
// app.js — RSP Attendance PWA
// Complete application logic
// ============================================================

"use strict";

// ── Constants ──────────────────────────────────────────────
const RSP_LAT = 22.2235;
const RSP_LNG = 84.8662;
const MAX_RADIUS_M = 200;
const MAX_ACCURACY_M = 50;
const VALID_QR_ID = "RSP_ATTENDANCE";

const DEPARTMENTS = [
  "Blast Furnace",
  "Steel Melting Shop",
  "Continuous Casting",
  "Hot Strip Mill",
  "Cold Rolling Mill",
  "Plate Mill",
  "Wire Rod Mill",
  "Power Plant",
  "Oxygen Plant",
  "Instrumentation",
  "Electrical",
  "Mechanical",
  "Civil & Structural",
  "IT & Automation",
  "HR & Admin",
  "Finance & Accounts",
  "Safety & Environment",
  "Medical",
];

const BATCHES = [
  "2024-A",
  "2024-B",
  "2024-C",
  "2024-D",
  "2025-A",
  "2025-B",
  "2025-C",
  "2025-D",
];

// ── State ──────────────────────────────────────────────────
const state = {
  user: null,
  trainee: null,
  qrResult: null,
  gpsResult: null,
  todayAttendance: { MORNING: false, MIDDAY: false },
  recentRecords: [],
  currentSession: null,
  qrStream: null,
  scanActive: false,
  deferredInstall: null,
  sessionBannerInterval: null,
};

// ── DOM helpers ─────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const show = (id) => $(id) && $(id).classList.remove("hidden");
const hide = (id) => $(id) && $(id).classList.add("hidden");

function showScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  const el = $(id);
  if (el) el.classList.add("active");
  window.scrollTo(0, 0);
}

// ── Toast ───────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = "", duration = 3500) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.className = t.className.replace("show", "").trim();
  }, duration);
}

// ── Loading ─────────────────────────────────────────────────
function hideLoading() {
  const el = $("loadingScreen");
  if (el) {
    el.classList.add("hidden");
    setTimeout(() => el.remove(), 400);
  }
}

// ── Haversine ───────────────────────────────────────────────
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── IST helpers ─────────────────────────────────────────────
function getISTDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
}

function getISTTime() {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function getActiveSession() {
  return "MORNING";
}

function getSessionLabel(session) {
  return session === "MORNING"
    ? "🌅 Morning (9:00–9:30 AM)"
    : "☀️ Midday (11:45–12:00 PM)";
}

function formatISTDateTime(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

// ── Password strength ────────────────────────────────────────
function checkPasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const colors = ["", "#F44336", "#FF8F00", "#FFC107", "#00C853"];
  const widths = ["0%", "25%", "50%", "75%", "100%"];
  return { score, color: colors[score] || "", width: widths[score] || "0%" };
}

// ── Input validation helpers ─────────────────────────────────
function showFieldError(fieldId, msg) {
  const field = $(fieldId);
  const errEl = $(`${fieldId}Error`);
  if (field) field.classList.add("error");
  if (errEl) {
    errEl.textContent = msg;
    errEl.classList.add("visible");
  }
}

function clearFieldError(fieldId) {
  const field = $(fieldId);
  const errEl = $(`${fieldId}Error`);
  if (field) field.classList.remove("error");
  if (errEl) errEl.classList.remove("visible");
}

function clearAllErrors(prefix) {
  document.querySelectorAll(`[id^="${prefix}"]`).forEach((el) => {
    el.classList.remove("error");
  });
  document.querySelectorAll('[id$="Error"]').forEach((el) => {
    el.classList.remove("visible");
  });
}

function resumeQRScanning() {
  state.scanActive = true;
  const video = $("qrVideo");
  const canvas = $("qrCanvas");
  if (video && canvas && state.qrStream) {
    requestAnimationFrame(() => scanQRFrame(video, canvas));
  } else {
    startQRScanner();
  }
}

// ════════════════════════════════════════════════════════════
// REGISTRATION
// ════════════════════════════════════════════════════════════
function initRegisterScreen() {
  // Populate selects
  const deptSel = $("regDepartment");
  const batchSel = $("regBatch");

  if (deptSel) {
    DEPARTMENTS.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      deptSel.appendChild(opt);
    });
  }

  if (batchSel) {
    BATCHES.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      batchSel.appendChild(opt);
    });
  }

  // Password strength indicator
  const pwInput = $("regPassword");
  if (pwInput) {
    pwInput.addEventListener("input", () => {
      const { color, width } = checkPasswordStrength(pwInput.value);
      const bar = $("pwStrengthBar");
      if (bar) {
        bar.style.width = width;
        bar.style.background = color;
      }
    });
  }

  // Submit handler
  const regBtn = $("registerBtn");
  if (regBtn) {
    regBtn.addEventListener("click", handleRegister);
  }

  // Trainee ID format enforcement
  const tidInput = $("regTraineeId");
  if (tidInput) {
    tidInput.addEventListener("input", () => {
      tidInput.value = tidInput.value.toUpperCase().replace(/[^A-Z0-9-_]/g, "");
    });
  }
}

async function handleRegister() {
  clearAllErrors("reg");
  const btn = $("registerBtn");

  const traineeId = $("regTraineeId")?.value.trim();
  const fullName = $("regFullName")?.value.trim();
  const department = $("regDepartment")?.value;
  const batch = $("regBatch")?.value;
  const email = $("regEmail")?.value.trim().toLowerCase();
  const password = $("regPassword")?.value;
  const confirmPw = $("regConfirmPassword")?.value;

  // Validation
  let valid = true;

  if (!traineeId || traineeId.length < 3) {
    showFieldError("regTraineeId", "Trainee ID must be at least 3 characters");
    valid = false;
  }
  if (!fullName || fullName.length < 3) {
    showFieldError("regFullName", "Enter your full name");
    valid = false;
  }
  if (!department) {
    showFieldError("regDepartment", "Select your department");
    valid = false;
  }
  if (!batch) {
    showFieldError("regBatch", "Select your batch");
    valid = false;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError("regEmail", "Enter a valid email address");
    valid = false;
  }
  if (!password || password.length < 6) {
    showFieldError("regPassword", "Password must be at least 6 characters");
    valid = false;
  }
  if (password !== confirmPw) {
    showFieldError("regConfirmPassword", "Passwords do not match");
    valid = false;
  }

  if (!valid) return;

  btn.classList.add("btn-loading");
  btn.disabled = true;

  try {
    // Create Supabase Auth user first. The SQL trigger automatically creates the public trainees row.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          trainee_id: traineeId,
          full_name: fullName,
          department: department,
          batch: batch,
        },
      },
    });

    if (error) throw error;

    showToast(
      "✅ Registration successful! Welcome to RSP Attendance.",
      "success",
      4000,
    );
    // Auth state listener will handle redirect
  } catch (err) {
    console.error("Registration error:", err);
    alert(`Registration Error:\nMessage: ${err.message}`);
    let msg = err.message || "Registration failed. Please try again.";
    showFieldError("regEmail", msg);
  } finally {
    btn.classList.remove("btn-loading");
    btn.disabled = false;
  }
}

// ════════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════════
async function handleLogin() {
  clearAllErrors("login");
  const btn = $("loginBtn");

  const email = $("loginEmail")?.value.trim().toLowerCase();
  const password = $("loginPassword")?.value;

  let valid = true;
  if (!email) {
    showFieldError("loginEmail", "Enter your email");
    valid = false;
  }
  if (!password) {
    showFieldError("loginPassword", "Enter your password");
    valid = false;
  }
  if (!valid) return;

  btn.classList.add("btn-loading");
  btn.disabled = true;

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    // Auth state listener handles the rest
  } catch (err) {
    console.error("Login error:", err);
    let msg = err.message || "Login failed. Please try again.";

    const alertEl = $("loginAlert");
    if (alertEl) {
      alertEl.textContent = msg;
      alertEl.style.display = "flex";
    }
  } finally {
    btn.classList.remove("btn-loading");
    btn.disabled = false;
  }
}

// Forgot password
async function handleForgotPassword() {
  const email = $("loginEmail")?.value.trim().toLowerCase();
  if (!email) {
    showToast("Enter your email address first", "", 3000);
    return;
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
    showToast(
      "📧 Password reset email sent. Check your inbox.",
      "success",
      4000,
    );
  } catch (err) {
    console.error("Password reset error:", err);
    showToast(
      err.message || "Failed to send reset email. Check the email address.",
      "error",
      3000,
    );
  }
}

// ════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════
async function loadDashboard(user) {
  state.trainee = null;

  try {
    const { data, error } = await supabase
      .from("trainees")
      .select("*")
      .eq("uid", user.id)
      .single();

    if (error || !data) {
      showToast("Profile not found", "error", 5000);
      await supabase.auth.signOut();
      return false;
    }

    state.trainee = {
      traineeId: data.trainee_id,
      fullName: data.full_name,
      department: data.department,
      batch: data.batch,
      email: data.email,
      uid: data.uid,
      isActive: data.is_active,
    };
    renderDashboard();
    loadTodayAttendance();
    loadRecentRecords();
    return true;
  } catch (err) {
    console.error("loadDashboard error:", err);
    state.trainee = null;
    showToast("Error loading profile. Check your connection.", "error", 4000);
    return false;
  }
}

function renderDashboard() {
  const t = state.trainee;
  if (!t) return;

  // Avatar initials
  const initials = t.fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const avatarEl = $("avatarInitials");
  if (avatarEl) avatarEl.textContent = initials;

  const setTxt = (id, val) => {
    const el = $(id);
    if (el) el.textContent = val || "—";
  };
  setTxt("traineeNameDisplay", t.fullName);
  setTxt("traineeIdDisplay", `ID: ${t.traineeId}`);
  setTxt("traineeDeptDisplay", t.department);
  setTxt("traineeBatchDisplay", t.batch);
  setTxt("traineeEmailDisplay", t.email);

  // Session banner
  updateSessionBanner();
  if (state.sessionBannerInterval) clearInterval(state.sessionBannerInterval);
  state.sessionBannerInterval = setInterval(updateSessionBanner, 30000);
}

function updateSessionBanner() {
  const session = getActiveSession();
  state.currentSession = session;
  const banner = $("sessionBanner");
  if (!banner) return;

  const time = getISTTime();

  if (session) {
    banner.className = "session-banner active";
    banner.innerHTML = `
      <div class="session-banner-icon">🟢</div>
      <div class="session-banner-info">
        <div class="session-banner-label">Session Open Now</div>
        <div class="session-banner-value">${getSessionLabel(session)}</div>
      </div>
    `;
    show("markAttendanceBtn");
  } else {
    // Determine upcoming
    let nextLabel = "";
    if (time < "09:00") nextLabel = "Next: Morning 9:00–9:30 AM";
    else if (time > "09:30" && time < "11:45")
      nextLabel = "Next: Midday 11:45–12:00 PM";
    else nextLabel = "Sessions complete for today";

    banner.className = "session-banner inactive";
    banner.innerHTML = `
      <div class="session-banner-icon">⏱️</div>
      <div class="session-banner-info">
        <div class="session-banner-label">No Active Session</div>
        <div class="session-banner-value" style="color:var(--text-secondary)">${nextLabel}</div>
      </div>
    `;
    hide("markAttendanceBtn");
  }
}

async function loadTodayAttendance() {
  const t = state.trainee;
  if (!t) return;
  const today = getISTDate();

  try {
    const morningId = `${today}_MORNING_${t.traineeId}`;
    const middayId = `${today}_MIDDAY_${t.traineeId}`;

    const { data, error } = await supabase
      .from("attendance")
      .select("id, session")
      .in("id", [morningId, middayId]);

    if (error) throw error;

    state.todayAttendance.MORNING = data.some((r) => r.session === "MORNING");
    state.todayAttendance.MIDDAY = data.some((r) => r.session === "MIDDAY");
    renderAttendanceSlots();
  } catch (err) {
    console.error("loadTodayAttendance error:", err);
  }
}

function renderAttendanceSlots() {
  const renderSlot = (id, session, time, marked) => {
    const el = $(id);
    if (!el) return;
    el.className = `attendance-slot ${marked ? "marked" : ""}`;
    el.innerHTML = `
      <div class="slot-label">${session}</div>
      <div class="slot-time">${time}</div>
      <div class="slot-status">${marked ? "✅" : "⬜"}</div>
      <div class="slot-status-text">${marked ? "MARKED" : "PENDING"}</div>
    `;
  };

  renderSlot(
    "morningSlot",
    "Morning",
    "9:00–9:30 AM",
    state.todayAttendance.MORNING,
  );
  renderSlot(
    "middaySlot",
    "Midday",
    "11:45–12:00",
    state.todayAttendance.MIDDAY,
  );
}

async function loadRecentRecords() {
  const t = state.trainee;
  const user = state.user;
  if (!t || !user) return;

  try {
    const { data, error } = await supabase
      .from("attendance")
      .select("*")
      .eq("uid", user.id)
      .order("timestamp", { ascending: false })
      .limit(14);

    if (error) throw error;

    state.recentRecords = data.map((r) => ({
      id: r.id,
      traineeId: r.trainee_id,
      fullName: r.full_name,
      department: r.department,
      batch: r.batch,
      email: r.email,
      session: r.session,
      date: r.date,
      latitude: r.latitude,
      longitude: r.longitude,
      distanceFromInstitute: r.distance_from_institute,
      gpsAccuracy: r.gps_accuracy,
      timestamp: r.timestamp,
      submittedAt: r.submitted_at,
      uid: r.uid,
    }));
    renderRecentRecords();
  } catch (err) {
    console.error("loadRecentRecords error:", err);
  }
}

function renderRecentRecords() {
  const container = $("recentRecordsList");
  if (!container) return;

  if (state.recentRecords.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.875rem;">
        No attendance records yet.<br>Mark your first attendance today!
      </div>`;
    return;
  }

  container.innerHTML = state.recentRecords
    .map(
      (r) => `
    <div class="record-item">
      <span class="record-badge ${r.session}">${r.session}</span>
      <span class="record-date">${r.date || "—"}</span>
      <span class="record-time">${r.timestamp ? formatISTDateTime(r.timestamp) : "—"}</span>
      <span class="record-check">✓</span>
    </div>
  `,
    )
    .join("");
}

function handleLogout() {
  if (!confirm("Sign out of RSP Attendance?")) return;
  stopQRScanner();
  supabase.auth.signOut();
}

// ════════════════════════════════════════════════════════════
// QR SCANNER
// ════════════════════════════════════════════════════════════
async function startQRScanner() {
  // Check session before opening scanner
  const session = getActiveSession();
  if (!session) {
    showToast(
      "⏱️ No active session right now. Morning: 9:00–9:30 | Midday: 11:45–12:00 (IST)",
      "",
      4000,
    );
    return;
  }

  // Check if already marked
  if (state.todayAttendance[session]) {
    showToast(
      `✅ ${session} attendance already marked for today.`,
      "success",
      3000,
    );
    return;
  }

  state.qrResult = null;
  state.gpsResult = null;
  state.scanActive = true;

  const statusEl = $("qrStatusMsg");
  if (statusEl) {
    statusEl.className = "";
    statusEl.textContent = "";
  }

  showScreen("qrScreen");

  const video = $("qrVideo");
  const canvas = $("qrCanvas");

  if (!video || !canvas) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    state.qrStream = stream;
    video.srcObject = stream;
    video.play();

    requestAnimationFrame(() => scanQRFrame(video, canvas));
  } catch (err) {
    console.error("Camera error:", err);

    let msg = "Camera access failed.";

    if (err.name === "NotAllowedError") {
      msg =
        "📷 Camera permission denied. Enable it in iPhone Settings → Safari.";
    }

    if (err.name === "NotFoundError") {
      msg = "📷 No camera found on this device.";
    }

    if (err.name === "NotReadableError") {
      msg = "📷 Camera is in use by another app.";
    }

    // 🔥 iOS/Safari fallback (IMPORTANT)
    if (
      err.name === "OverconstrainedError" ||
      err.name === "TypeError" ||
      !err.name
    ) {
      msg =
        "📷 iPhone camera blocked. Try switching to Safari full tab or reload page.";
    }

    if (statusEl) {
      statusEl.className = "qr-status error";
      statusEl.textContent = msg;
    }

    showToast(msg, "error", 4000);
  }
}

function scanQRFrame(video, canvas) {
  if (!state.scanActive) return;
  if (video.readyState !== video.HAVE_ENOUGH_DATA) {
    requestAnimationFrame(() => scanQRFrame(video, canvas));
    return;
  }

  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  try {
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code) {
      handleQRResult(code.data);
      return; // Stop scanning after a result
    }
  } catch (e) {
    // jsQR throws on bad data — ignore and keep scanning
  }

  requestAnimationFrame(() => scanQRFrame(video, canvas));
}

function handleQRResult(rawData) {
  const statusEl = $("qrStatusMsg");
  state.scanActive = false;

  let parsed;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    if (statusEl) {
      statusEl.className = "qr-status error";
      statusEl.textContent =
        "❌ Invalid QR code format. Scan the official RSP QR.";
    }
    setTimeout(resumeQRScanning, 2500);
    return;
  }

  if (parsed.qrId !== VALID_QR_ID) {
    if (statusEl) {
      statusEl.className = "qr-status error";
      statusEl.textContent = `❌ Wrong QR code (${parsed.qrId || "unknown"}). Use the official RSP attendance QR.`;
    }
    setTimeout(resumeQRScanning, 2500);
    return;
  }

  // Valid QR — stop camera and proceed
  stopQRScanner();
  state.qrResult = parsed;
  if (statusEl) {
    statusEl.className = "qr-status success";
    statusEl.textContent =
      "✅ Valid RSP QR detected! Proceeding to GPS verification…";
  }

  showToast("✅ QR verified!", "success", 2000);
  setTimeout(() => goToGPS(), 1200);
}

function stopQRScanner() {
  state.scanActive = false;
  if (state.qrStream) {
    state.qrStream.getTracks().forEach((t) => t.stop());
    state.qrStream = null;
  }
  const video = $("qrVideo");
  if (video) video.srcObject = null;
}

// ════════════════════════════════════════════════════════════
// GPS VERIFICATION
// ════════════════════════════════════════════════════════════
function goToGPS() {
  stopQRScanner();
  showScreen("gpsScreen");
  resetGPSUI();
  startGPSVerification();
}

function resetGPSUI() {
  const ring = $("gpsRing");
  if (ring) ring.className = "gps-ring";

  const icon = $("gpsIcon");
  if (icon) icon.textContent = "📍";

  const statusTxt = $("gpsStatusText");
  if (statusTxt) statusTxt.textContent = "Acquiring GPS signal…";

  ["gpsLat", "gpsLng", "gpsDist", "gpsAcc"].forEach((id) => {
    const el = $(id);
    if (el) el.textContent = "—";
  });

  hide("gpsResultBox");
  hide("gpsSubmitBtn");
  hide("gpsRetryBtn");
}

function startGPSVerification() {
  const ring = $("gpsRing");
  if (ring) ring.className = "gps-ring checking";

  if (!navigator.geolocation) {
    showGPSError("Geolocation is not supported by your browser/device.");
    return;
  }

  navigator.geolocation.getCurrentPosition(handleGPSSuccess, handleGPSError, {
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 0,
  });
}

function handleGPSSuccess(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const distance = haversineDistance(latitude, longitude, RSP_LAT, RSP_LNG);

  state.gpsResult = { latitude, longitude, accuracy, distance };

  // Update data display
  const set = (id, val) => {
    const el = $(id);
    if (el) el.textContent = val;
  };
  set("gpsLat", latitude.toFixed(6));
  set("gpsLng", longitude.toFixed(6));
  set("gpsDist", `${Math.round(distance)} m`);
  set("gpsAcc", `${Math.round(accuracy)} m`);

  const ring = $("gpsRing");
  const icon = $("gpsIcon");
  const statusTx = $("gpsStatusText");
  const resultBox = $("gpsResultBox");

  // Determine pass/fail
  const distPass = distance <= MAX_RADIUS_M;
  const accPass = accuracy <= MAX_ACCURACY_M;
  const pass = distPass && accPass;

  if (pass) {
    if (ring) ring.className = "gps-ring success";
    if (icon) icon.textContent = "✅";
    if (statusTx) statusTx.textContent = "Location verified!";

    if (resultBox) {
      resultBox.className = "gps-result pass";
      resultBox.style.display = "flex";
      resultBox.innerHTML = `
        <div class="gps-result-icon">✅</div>
        <div>
          <div class="gps-result-label">Location Verified — PASS</div>
          <div class="gps-result-reason">Within ${Math.round(distance)}m of RSP (max: ${MAX_RADIUS_M}m)</div>
        </div>
      `;
    }

    show("gpsSubmitBtn");
    hide("gpsRetryBtn");
  } else {
    if (ring) ring.className = "gps-ring error";
    if (icon) icon.textContent = "❌";
    if (statusTx) statusTx.textContent = "Location check failed";

    let reason = "";
    if (!distPass)
      reason = `You are ${Math.round(distance)}m away — must be within ${MAX_RADIUS_M}m of RSP.`;
    else
      reason = `GPS accuracy ${Math.round(accuracy)}m — must be ≤${MAX_ACCURACY_M}m. Try outdoors.`;

    if (resultBox) {
      resultBox.className = "gps-result fail";
      resultBox.style.display = "flex";
      resultBox.innerHTML = `
        <div class="gps-result-icon">❌</div>
        <div>
          <div class="gps-result-label">Location Failed</div>
          <div class="gps-result-reason">${reason}</div>
        </div>
      `;
    }

    hide("gpsSubmitBtn");
    show("gpsRetryBtn");
  }
}

function handleGPSError(err) {
  showGPSError(getGPSErrorMessage(err));
}

function getGPSErrorMessage(err) {
  switch (err.code) {
    case 1:
      return "GPS permission denied. Enable location in your browser/device settings.";
    case 2:
      return "Location unavailable. Move to an open area and try again.";
    case 3:
      return "GPS timed out. Move to an open area (away from buildings) and retry.";
    default:
      return "GPS error. Please try again.";
  }
}

function showGPSError(msg) {
  const ring = $("gpsRing");
  const icon = $("gpsIcon");
  const statusTx = $("gpsStatusText");
  const resultBox = $("gpsResultBox");

  if (ring) ring.className = "gps-ring error";
  if (icon) icon.textContent = "❌";
  if (statusTx) statusTx.textContent = "GPS Error";

  if (resultBox) {
    resultBox.className = "gps-result fail";
    resultBox.style.display = "flex";
    resultBox.innerHTML = `
      <div class="gps-result-icon">❌</div>
      <div>
        <div class="gps-result-label">GPS Error</div>
        <div class="gps-result-reason">${msg}</div>
      </div>
    `;
  }

  hide("gpsSubmitBtn");
  show("gpsRetryBtn");
}

// ════════════════════════════════════════════════════════════
// ATTENDANCE SUBMISSION
// ════════════════════════════════════════════════════════════
async function submitAttendance() {
  if (!state.qrResult || !state.gpsResult) {
    showToast("QR or GPS verification missing. Start over.", "error", 3000);
    return;
  }

  if (state.qrResult.qrId !== VALID_QR_ID) {
    showToast("Invalid QR code. Scan the official RSP QR.", "error", 3000);
    return;
  }

  const session = getActiveSession();
  if (!session) {
    showToast(
      "⏱️ Session has ended. Try again during the next window.",
      "error",
      4000,
    );
    showScreen("dashboardScreen");
    return;
  }

  if (state.todayAttendance[session]) {
    showToast(
      `✅ ${session} attendance already recorded for today.`,
      "success",
      3000,
    );
    showScreen("dashboardScreen");
    return;
  }

  const t = state.trainee;
  const user = state.user;
  if (!t || !user) {
    showToast("Session expired. Please sign in again.", "error", 3000);
    return;
  }

  const { latitude, longitude, accuracy, distance } = state.gpsResult;
  if (distance > MAX_RADIUS_M || accuracy > MAX_ACCURACY_M) {
    showToast("GPS verification failed. Retry location check.", "error", 3000);
    return;
  }

  const btn = $("gpsSubmitBtn");
  if (btn) {
    btn.classList.add("btn-loading");
    btn.disabled = true;
  }

  const today = getISTDate();
  const docId = `${today}_${session}_${t.traineeId}`;

  const recordPayload = {
    id: docId,
    trainee_id: t.traineeId,
    full_name: t.fullName,
    department: t.department,
    batch: t.batch,
    email: t.email,
    session,
    date: today,
    latitude,
    longitude,
    distance_from_institute: Math.round(distance * 100) / 100,
    gps_accuracy: Math.round(accuracy * 100) / 100,
    timestamp: new Date().toISOString(),
    submitted_at: new Date().toISOString(),
    uid: user.id,
  };

  try {
    const { error } = await supabase.from("attendance").insert(recordPayload);

    if (error) {
      const isDuplicate =
        error.code === "23505" || error.message.includes("already exists");
      if (isDuplicate) {
        state.todayAttendance[session] = true;
        showToast(
          `✅ ${session} attendance already marked for today.`,
          "success",
          4000,
        );
        showScreen("dashboardScreen");
        renderAttendanceSlots();
      } else {
        throw error;
      }
    } else {
      state.todayAttendance[session] = true;
      showToast(
        `🎉 ${session} attendance marked successfully!`,
        "success",
        4000,
      );
      showScreen("dashboardScreen");
      renderAttendanceSlots();
      loadRecentRecords();
    }
  } catch (err) {
    console.error("submitAttendance error:", err);
    const isNetworkError =
      !navigator.onLine ||
      (err.message &&
        (err.message.includes("Failed to fetch") ||
          err.message.includes("NetworkError")));
    if (isNetworkError) {
      saveOfflineAttendance(recordPayload);
    } else {
      showToast(
        err.message || "Submission failed. Please try again.",
        "error",
        4000,
      );
    }
  } finally {
    if (btn) {
      btn.classList.remove("btn-loading");
      btn.disabled = false;
    }
  }
}

// ════════════════════════════════════════════════════════════
// PWA INSTALLATION
// ════════════════════════════════════════════════════════════
function initPWA() {
  // Android / Chrome install prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.deferredInstall = e;
    const banner = $("installBanner");
    if (banner) banner.classList.add("show");
  });

  window.addEventListener("appinstalled", () => {
    state.deferredInstall = null;
    const banner = $("installBanner");
    if (banner) banner.classList.remove("show");
    showToast("✅ RSP Attendance installed!", "success", 3000);
  });

  // iOS detection
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandalone = window.navigator.standalone === true;

  if (isIOS && !isInStandalone) {
    // Show iOS guide after a brief delay
    setTimeout(() => {
      const modal = $("iosModal");
      if (modal) {
        modal.classList.add("show");
        setTimeout(() => modal.classList.remove("show"), 12000);
      }
    }, 3000);
  }
}

async function triggerInstall() {
  if (!state.deferredInstall) return;
  state.deferredInstall.prompt();
  const { outcome } = await state.deferredInstall.userChoice;
  if (outcome === "accepted") {
    state.deferredInstall = null;
  }
}

// ════════════════════════════════════════════════════════════
// SERVICE WORKER
// ════════════════════════════════════════════════════════════
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const reg =
          await navigator.serviceWorker.register("/service-worker.js");
        console.log("[SW] Registered:", reg.scope);

        // Listen for messages from SW (background sync)
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "SYNC_ATTENDANCE") {
            loadTodayAttendance();
          }
        });
      } catch (err) {
        console.warn("[SW] Registration failed:", err);
      }
    });
  }
}

// ════════════════════════════════════════════════════════════
// AUTH STATE
// ════════════════════════════════════════════════════════════
// ── Offline sync helpers ────────────────────────────────────
function saveOfflineAttendance(record) {
  localStorage.setItem(
    `pending_attendance_${record.id}`,
    JSON.stringify(record),
  );

  if ("serviceWorker" in navigator && "SyncManager" in window) {
    navigator.serviceWorker.ready
      .then((reg) => {
        return reg.sync.register("sync-attendance");
      })
      .catch((err) => {
        console.warn("Background sync registration failed:", err);
      });
  }

  state.todayAttendance[record.session] = true;
  showToast(
    "💾 Offline: Saved locally. Will sync when online!",
    "success",
    4000,
  );
  showScreen("dashboardScreen");
  renderAttendanceSlots();

  const localRecord = {
    id: record.id,
    traineeId: record.trainee_id,
    fullName: record.full_name,
    department: record.department,
    batch: record.batch,
    email: record.email,
    session: record.session,
    date: record.date,
    latitude: record.latitude,
    longitude: record.longitude,
    distanceFromInstitute: record.distance_from_institute,
    gpsAccuracy: record.gps_accuracy,
    timestamp: record.timestamp,
    submittedAt: record.submitted_at,
    uid: record.uid,
  };
  state.recentRecords.unshift(localRecord);
  renderRecentRecords();
}

async function syncOfflineAttendance() {
  if (!navigator.onLine) return;
  const keys = Object.keys(localStorage).filter((k) =>
    k.startsWith("pending_attendance_"),
  );
  if (keys.length === 0) return;

  console.log(`[Sync] Found ${keys.length} pending records to sync.`);

  for (const key of keys) {
    try {
      const record = JSON.parse(localStorage.getItem(key));
      if (!record) continue;

      const { error } = await supabase.from("attendance").insert(record);

      if (error) {
        const isDuplicate =
          error.code === "23505" || error.message.includes("already exists");
        if (isDuplicate) {
          localStorage.removeItem(key);
          console.log(
            `[Sync] Record ${record.id} already exists. Cleared cache.`,
          );
        } else {
          console.error(`[Sync] Sync failed for ${record.id}:`, error);
        }
      } else {
        localStorage.removeItem(key);
        showToast(
          "✅ Offline attendance synced successfully!",
          "success",
          3000,
        );
      }
    } catch (err) {
      console.error("[Sync] Error parsing or posting record:", err);
    }
  }

  loadTodayAttendance();
  loadRecentRecords();
}

// ── Auth state & Initial Sync ───────────────────────────────
function initAuth() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user;
    hideLoading();

    if (user) {
      state.user = user;
      const loaded = await loadDashboard(user);
      if (loaded) {
        showScreen("dashboardScreen");
        syncOfflineAttendance();
      }
    } else {
      state.user = null;
      state.trainee = null;
      stopQRScanner();
      showScreen("loginScreen");
    }
  });

  window.addEventListener("online", syncOfflineAttendance);
}

// ════════════════════════════════════════════════════════════
// EVENT BINDING
// ════════════════════════════════════════════════════════════
function bindEvents() {
  // Login
  $("loginBtn")?.addEventListener("click", handleLogin);
  $("loginPassword")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });
  $("forgotPasswordLink")?.addEventListener("click", handleForgotPassword);
  $("goToRegisterLink")?.addEventListener("click", () =>
    showScreen("registerScreen"),
  );

  // Register
  $("goToLoginLink")?.addEventListener("click", () =>
    showScreen("loginScreen"),
  );

  // Dashboard
  $("logoutBtn")?.addEventListener("click", handleLogout);
  $("markAttendanceBtn")?.addEventListener("click", startQRScanner);
  $("refreshAttendanceBtn")?.addEventListener("click", () => {
    loadTodayAttendance();
    loadRecentRecords();
    showToast("Refreshed", "", 1500);
  });

  // QR screen
  $("qrBackBtn")?.addEventListener("click", () => {
    stopQRScanner();
    showScreen("dashboardScreen");
  });

  // GPS screen
  $("gpsBackBtn")?.addEventListener("click", () =>
    showScreen("dashboardScreen"),
  );
  $("gpsRetryBtn")?.addEventListener("click", () => {
    resetGPSUI();
    startGPSVerification();
  });
  $("gpsSubmitBtn")?.addEventListener("click", submitAttendance);

  // Install
  $("installBtn")?.addEventListener("click", triggerInstall);
  $("dismissInstallBtn")?.addEventListener("click", () => {
    $("installBanner")?.classList.remove("show");
  });

  // iOS modal
  $("iosModalClose")?.addEventListener("click", () => {
    $("iosModal")?.classList.remove("show");
  });
  $("iosModal")?.addEventListener("click", (e) => {
    if (e.target === $("iosModal")) $("iosModal").classList.remove("show");
  });

  // Close login alert on input
  [$("loginEmail"), $("loginPassword")].forEach((el) => {
    el?.addEventListener("input", () => {
      const alertEl = $("loginAlert");
      if (alertEl) alertEl.style.display = "none";
    });
  });
}

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  registerServiceWorker();
  initRegisterScreen();
  bindEvents();
  initPWA();
  initAuth();

  // Keep clock in header updated
  setInterval(() => {
    const el = $("currentTime");
    if (el) {
      el.textContent = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(new Date());
    }
  }, 1000);
});
