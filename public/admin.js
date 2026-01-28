const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");

if (!token || !user || user.role !== "admin") {
  window.location.href = "/";
}

document.getElementById("logout").addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "/";
});

const approvalToggle = document.getElementById("approval-toggle");
const adminSummary = document.getElementById("admin-summary");
const adminWeekly = document.getElementById("admin-weekly");
const pendingList = document.getElementById("pending-list");
const adminHistory = document.getElementById("admin-history");
const membersList = document.getElementById("members-list");
const adminDashboard = document.getElementById("admin-dashboard");
const adminMembers = document.getElementById("admin-members");
const memberSearch = document.getElementById("member-search");
const memberRole = document.getElementById("member-role");
const memberStatus = document.getElementById("member-status");
const createName = document.getElementById("create-name");
const createEmail = document.getElementById("create-email");
const createCompany = document.getElementById("create-company");
const createPassword = document.getElementById("create-password");
const createRole = document.getElementById("create-role");
const createStatus = document.getElementById("create-status");
const createMemberButton = document.getElementById("create-member");
const createMemberMessage = document.getElementById("create-member-message");
const adminWeekPrev = document.getElementById("admin-week-prev");
const adminWeekNext = document.getElementById("admin-week-next");
const adminWeekToday = document.getElementById("admin-week-today");
const adminWeekRange = document.getElementById("admin-week-range");
const signupSummary = document.getElementById("signup-summary");
const signupList = document.getElementById("signup-list");

const adminTabs = document.querySelectorAll("[data-admin-tab]");
adminTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    adminTabs.forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.adminTab;
    adminDashboard.style.display = target === "dashboard" ? "block" : "none";
    adminMembers.style.display = target === "members" ? "block" : "none";
    if (target === "members") {
      loadMembers();
      loadSignupRequests();
    }
  });
});

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function getWeekStart(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function formatRange(start, end) {
  const startLabel = formatTime(start);
  const endLabel = formatTime(end);
  return `${startLabel} - ${endLabel}`;
}

function formatRangeLabel(startDate) {
  const end = new Date(startDate);
  end.setDate(end.getDate() + 6);
  return `${startDate.toLocaleDateString("en-GB")} - ${end.toLocaleDateString("en-GB")}`;
}

function createCell(content, extraClass) {
  const cell = document.createElement("div");
  cell.className = `cell ${extraClass}`.trim();
  cell.innerHTML = content;
  return cell;
}

function buildWeeklyTable(reservations, startDate) {
  const start = new Date(startDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

  const slots = [];
  for (let hour = 9; hour < 21; hour++) {
    slots.push(`${String(hour).padStart(2, "0")}:00`);
    slots.push(`${String(hour).padStart(2, "0")}:30`);
  }

  const table = document.createElement("table");
  table.className = "weekly-table";

  const colgroup = document.createElement("colgroup");
  const dayCol = document.createElement("col");
  dayCol.style.width = "160px";
  colgroup.appendChild(dayCol);
  days.forEach(() => {
    colgroup.appendChild(document.createElement("col"));
  });
  table.appendChild(colgroup);

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const dayHeader = document.createElement("th");
  dayHeader.textContent = "Time";
  headerRow.appendChild(dayHeader);
  days.forEach((day) => {
    const th = document.createElement("th");
    th.innerHTML = `${dayLabels[day.getDay()]}<br /><span class="muted">${day.toLocaleDateString(
      "en-GB"
    )}</span>`;
    if (day.toDateString() === new Date().toDateString()) {
      th.classList.add("today-cell");
    }
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const todayKey = new Date().toDateString();

  const reservationMap = days.map((day) => {
    const entries = reservations
      .filter((reservation) => new Date(reservation.start_at).toDateString() === day.toDateString())
      .map((reservation) => {
        const startTime = new Date(reservation.start_at);
        const endTime = new Date(reservation.end_at);
        const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
        const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
        const slotIndex = Math.max(0, Math.floor((startMinutes - 540) / 30));
        const span = Math.max(1, Math.ceil((endMinutes - startMinutes) / 30));
        return { reservation, slotIndex, span };
      });
    const map = new Map();
    entries.forEach((entry) => map.set(entry.slotIndex, entry));
    return map;
  });

  const skip = days.map(() => Array(slots.length).fill(false));

  slots.forEach((slot, slotIndex) => {
    const row = document.createElement("tr");
    const timeCell = document.createElement("td");
    timeCell.className = "time-cell";
    timeCell.textContent = slot;
    row.appendChild(timeCell);

    days.forEach((day, dayIndex) => {
      if (skip[dayIndex][slotIndex]) {
        return;
      }

      const match = reservationMap[dayIndex].get(slotIndex);
      if (match) {
        const isMine = user && match.reservation.user_id === user.id;
        const cell = document.createElement("td");
        cell.rowSpan = match.span;
        cell.innerHTML = `<div class="reservation-card ${isMine ? "mine" : ""}"><strong>${match.reservation.company_name}</strong><br />${formatRange(
          match.reservation.start_at,
          match.reservation.end_at
        )} · ${match.reservation.status}</div>`;
        if (day.toDateString() === todayKey) {
          cell.classList.add("today-cell");
        }
        row.appendChild(cell);
        for (let i = 1; i < match.span; i += 1) {
          if (slotIndex + i < slots.length) {
            skip[dayIndex][slotIndex + i] = true;
          }
        }
        return;
      }

      const empty = document.createElement("td");
      if (day.toDateString() === todayKey) {
        empty.classList.add("today-cell");
      }
      row.appendChild(empty);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  return table;
}

async function fetchWithAuth(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Request failed.");
  }
  return response.json();
}

async function loadSettings() {
  const settings = await fetchWithAuth("/api/admin/settings/reservation");
  approvalToggle.textContent = settings.approval_mode
    ? "Approval mode ON"
    : "Approval mode OFF";
  approvalToggle.className = settings.approval_mode ? "button primary" : "button";
  approvalToggle.dataset.value = settings.approval_mode ? "on" : "off";
}

approvalToggle.addEventListener("click", async () => {
  const next = approvalToggle.dataset.value !== "on";
  await fetchWithAuth("/api/admin/settings/reservation", {
    method: "PATCH",
    body: JSON.stringify({ approval_mode: next })
  });
  await loadSettings();
});

let currentWeekStart = getWeekStart(new Date());

async function loadDashboard() {
  const weekStart = new Date(currentWeekStart);
  const weekStartIso = toISODate(weekStart);
  const [data, signupCount] = await Promise.all([
    fetchWithAuth(`/api/admin/dashboard/weekly?week_start=${weekStartIso}`),
    fetchWithAuth("/api/admin/signup-requests?count=true")
  ]);

  adminSummary.innerHTML = `
    <div>Approved: ${data.counts.approved}</div>
    <div>Pending: ${data.counts.pending}</div>
    <div>Canceled: ${data.counts.canceled}</div>
  `;

  adminWeekly.innerHTML = "";
  adminWeekly.appendChild(buildWeeklyTable(data.reservations || [], weekStart));
  if (adminWeekRange) {
    adminWeekRange.textContent = formatRangeLabel(weekStart);
  }
  if (signupSummary) {
    signupSummary.textContent = signupCount.count
      ? `${signupCount.count} pending signup requests`
      : "No new signup requests";
  }
}

function buildPendingCard(item, type) {
  const card = document.createElement("div");
  card.className = "panel";
  const title = type === "change" ? "Change request" : "New booking";
  const range = type === "change"
    ? `Current: ${formatRange(item.old_start_at, item.old_end_at)}<br />Requested: ${formatRange(item.new_start_at, item.new_end_at)}`
    : formatRange(item.start_at, item.end_at);

  card.innerHTML = `
    <strong>${title}</strong>
    <div class="muted">${item.company_name}</div>
    <div>${range}</div>
    <div style="margin-top: 12px; display: flex; gap: 8px;">
      <button class="button primary" data-action="approve">Approve</button>
      <button class="button" data-action="reject">Reject</button>
    </div>
  `;

  card.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.action === "approve") {
        await fetchWithAuth(`/api/admin/reservations/${item.reservation_id || item.id}/approve`, {
          method: "POST"
        });
      } else {
        const reason = window.prompt("Enter a rejection reason.");
        if (!reason) {
          return;
        }
        await fetchWithAuth(`/api/admin/reservations/${item.reservation_id || item.id}/reject`, {
          method: "POST",
          body: JSON.stringify({ reason })
        });
      }
      await loadPending();
      await loadDashboard();
    });
  });

  return card;
}

async function loadPending() {
  const [pendingReservations, pendingChanges] = await Promise.all([
    fetchWithAuth("/api/admin/reservations?status=pending"),
    fetchWithAuth("/api/admin/pending-changes")
  ]);

  pendingList.innerHTML = "";
  if (!pendingReservations.length && !pendingChanges.length) {
    pendingList.innerHTML = "<p class=\"notice\">No pending approvals.</p>";
    return;
  }

  pendingChanges.forEach((item) => {
    pendingList.appendChild(buildPendingCard(item, "change"));
  });
  pendingReservations.forEach((item) => {
    pendingList.appendChild(buildPendingCard(item, "new"));
  });
}

function formatHistoryItem(item) {
  const payload = item.payload || {};
  const start = payload.start_at ? new Date(payload.start_at) : null;
  const end = payload.end_at ? new Date(payload.end_at) : null;
  const range = start && end ? formatRange(start, end) : "";
  const reason = payload.reason ? ` · Reason: ${payload.reason}` : "";
  return `${item.type.toUpperCase()}${range ? ` · ${range}` : ""}${reason}`;
}

async function loadHistory() {
  const items = await fetchWithAuth("/api/notifications?limit=25");
  adminHistory.innerHTML = "";
  if (!items.length) {
    adminHistory.innerHTML = "<p class=\"notice\">No history yet.</p>";
    return;
  }
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "panel";
    card.innerHTML = `
      <strong>${item.type}</strong>
      <div class="muted">${formatHistoryItem(item)}</div>
    `;
    adminHistory.appendChild(card);
  });
}

function buildMemberRow(member) {
  const row = document.createElement("div");
  row.className = "panel";
  row.innerHTML = `
    <div class="stack" style="gap: 12px;">
      <div><strong data-member-email></strong></div>
      <div class="grid">
        <div class="input">
          <label>Name</label>
          <input type="text" data-field="name" />
        </div>
        <div class="input">
          <label>Company</label>
          <input type="text" data-field="company_name" />
        </div>
        <div class="input">
          <label>Email</label>
          <input type="email" data-field="email" />
        </div>
        <div class="input">
          <label>Role</label>
          <select data-field="role">
            <option value="admin" ${member.role === "admin" ? "selected" : ""}>Admin</option>
            <option value="user" ${member.role === "user" ? "selected" : ""}>User</option>
          </select>
        </div>
        <div class="input">
          <label>Status</label>
          <select data-field="status">
            <option value="active" ${member.status === "active" ? "selected" : ""}>Active</option>
            <option value="inactive" ${member.status === "inactive" ? "selected" : ""}>Inactive</option>
          </select>
        </div>
      </div>
      <div class="card-actions">
        <button class="button primary" data-action="save">Save</button>
        <button class="button" data-action="reset">Reset Password</button>
        <button class="button" data-action="deactivate">Deactivate</button>
      </div>
      <div class="notice" data-reset-message></div>
    </div>
  `;

  row.querySelector("[data-member-email]").textContent = member.email;
  row.querySelector("[data-field=name]").value = member.name;
  row.querySelector("[data-field=company_name]").value = member.company_name;
  row.querySelector("[data-field=email]").value = member.email;

  row.querySelector("[data-action=save]").addEventListener("click", async () => {
    if (!window.confirm("Save changes for this member?")) {
      return;
    }
    const payload = {};
    row.querySelectorAll("[data-field]").forEach((input) => {
      payload[input.dataset.field] = input.value;
    });
    await fetchWithAuth(`/api/admin/users/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    await loadMembers();
  });

  row.querySelector("[data-action=reset]").addEventListener("click", async () => {
    const message = row.querySelector("[data-reset-message]");
    message.textContent = "";
    if (!window.confirm("Reset this member's password?")) {
      return;
    }
    const result = await fetchWithAuth(`/api/admin/users/${member.id}/password-reset`, {
      method: "POST"
    });
    if (result.temp_password) {
      message.textContent = `Temp password: ${result.temp_password}${
        result.email_sent ? " (emailed)" : ""
      }`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(result.temp_password).catch(() => {});
      }
    }
  });

  row.querySelector("[data-action=deactivate]").addEventListener("click", async () => {
    if (!window.confirm("Deactivate this member?")) {
      return;
    }
    await fetchWithAuth(`/api/admin/users/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "inactive" })
    });
    await loadMembers();
  });

  return row;
}

async function loadMembers() {
  const params = new URLSearchParams();
  if (memberSearch?.value) {
    params.set("q", memberSearch.value.trim());
  }
  if (memberRole?.value) {
    params.set("role", memberRole.value);
  }
  if (memberStatus?.value) {
    params.set("status", memberStatus.value);
  }
  const query = params.toString();
  const members = await fetchWithAuth(`/api/admin/users${query ? `?${query}` : ""}`);
  membersList.innerHTML = "";
  if (!members.length) {
    membersList.innerHTML = "<p class=\"notice\">No members found.</p>";
    return;
  }
  members.forEach((member) => {
    membersList.appendChild(buildMemberRow(member));
  });
}

async function loadSignupRequests() {
  if (!signupList) {
    return;
  }
  const requests = await fetchWithAuth("/api/admin/signup-requests");
  signupList.innerHTML = "";
  if (!requests.length) {
    signupList.innerHTML = "<p class=\"notice\">No pending requests.</p>";
    return;
  }
  requests.forEach((request) => {
    const card = document.createElement("div");
    card.className = "panel";
    card.innerHTML = `
      <strong>${request.name}</strong>
      <div class="muted">${request.email} · ${request.company_name}</div>
      <div style="margin-top: 8px; display: flex; gap: 8px;">
        <button class="button primary" data-action="approve">Approve</button>
      </div>
    `;
    card.querySelector("[data-action=approve]").addEventListener("click", async () => {
      if (!window.confirm("Approve this signup request?")) {
        return;
      }
      await fetchWithAuth(`/api/admin/signup-requests/${request.id}/approve`, {
        method: "POST"
      });
      await loadSignupRequests();
      await loadMembers();
      await loadDashboard();
    });
    signupList.appendChild(card);
  });
}

if (createMemberButton) {
  createMemberButton.addEventListener("click", async () => {
    createMemberMessage.textContent = "";
    const payload = {
      name: createName.value.trim(),
      email: createEmail.value.trim(),
      company_name: createCompany.value.trim(),
      password: createPassword.value,
      role: createRole.value,
      status: createStatus.value
    };

    if (!payload.name || !payload.email || !payload.company_name || !payload.password) {
      createMemberMessage.textContent = "Name, email, company, and password are required.";
      return;
    }

    if (!window.confirm("Create this member?")) {
      return;
    }

    try {
      await fetchWithAuth("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      createMemberMessage.textContent = "Member created.";
      createName.value = "";
      createEmail.value = "";
      createCompany.value = "";
      createPassword.value = "";
      createRole.value = "user";
      createStatus.value = "active";
      await loadMembers();
    } catch (error) {
      createMemberMessage.textContent = "Failed to create member.";
    }
  });
}

if (adminWeekPrev && adminWeekNext && adminWeekToday) {
  adminWeekPrev.addEventListener("click", () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    loadDashboard();
  });
  adminWeekNext.addEventListener("click", () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    loadDashboard();
  });
  adminWeekToday.addEventListener("click", () => {
    currentWeekStart = getWeekStart(new Date());
    loadDashboard();
  });
}

[memberSearch, memberRole, memberStatus].forEach((input) => {
  if (!input) {
    return;
  }
  input.addEventListener("input", () => {
    loadMembers();
  });
  input.addEventListener("change", () => {
    loadMembers();
  });
});

await loadSettings();
await loadDashboard();
await loadPending();
await loadHistory();
await loadSignupRequests();
