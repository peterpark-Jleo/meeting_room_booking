const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");

if (!token || !user) {
  window.location.href = "/";
}

document.getElementById("logout").addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "/";
});

const weekSummary = document.getElementById("week-summary");
const todaySummary = document.getElementById("today-summary");
const weeklyView = document.getElementById("weekly-view");
const monthlyView = document.getElementById("monthly-view");
const weekPrev = document.getElementById("week-prev");
const weekNext = document.getElementById("week-next");
const weekToday = document.getElementById("week-today");
const weekRange = document.getElementById("week-range");
const weeklyControls = document.getElementById("weekly-controls");
const monthlyControls = document.getElementById("monthly-controls");
const monthPrev = document.getElementById("month-prev");
const monthNext = document.getElementById("month-next");
const monthToday = document.getElementById("month-today");
const monthRange = document.getElementById("month-range");

const tabs = document.querySelectorAll(".tab");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    weeklyView.style.display = target === "weekly" ? "block" : "none";
    monthlyView.style.display = target === "monthly" ? "block" : "none";
    if (weeklyControls && monthlyControls) {
      weeklyControls.style.display = target === "weekly" ? "flex" : "none";
      monthlyControls.style.display = target === "monthly" ? "flex" : "none";
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

function durationLabel(minutes) {
  return minutes % 60 === 0
    ? `${minutes / 60}h`
    : `${(minutes / 60).toFixed(1)}h`;
}

function formatRangeLabel(startDate) {
  const end = new Date(startDate);
  end.setDate(end.getDate() + 6);
  return `${startDate.toLocaleDateString("en-GB")} - ${end.toLocaleDateString("en-GB")}`;
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
        cell.innerHTML = `<div class="reservation-card ${isMine ? "mine" : ""}"><strong>${match.reservation.company_name}</strong><br />${formatTime(
          match.reservation.start_at
        )}–${formatTime(match.reservation.end_at)} (${durationLabel(
          Math.round((new Date(match.reservation.end_at) - new Date(match.reservation.start_at)) / 60000)
        )})</div>`;
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

function createCell(content, extraClass) {
  const cell = document.createElement("div");
  cell.className = `cell ${extraClass}`.trim();
  cell.innerHTML = content;
  return cell;
}

function buildMonthlyTable(days) {
  return days;
}

function buildMonthlyCalendar(days, monthStart) {
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const data = new Map(days.map((day) => [day.date, day.items]));
  const firstDay = new Date(monthStart);
  const startOffset = firstDay.getDay();
  const endDate = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const totalDays = endDate.getDate();

  const grid = document.createElement("div");
  grid.className = "monthly-grid";

  dayLabels.forEach((label) => {
    const cell = document.createElement("div");
    cell.className = "cell header";
    cell.textContent = label;
    grid.appendChild(cell);
  });

  for (let i = 0; i < startOffset; i += 1) {
    const empty = document.createElement("div");
    empty.className = "cell";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    const key = date.toLocaleDateString("en-CA");
    const cell = document.createElement("div");
    cell.className = "cell";
    if (date.toDateString() === new Date().toDateString()) {
      cell.classList.add("today");
    }
    const header = document.createElement("div");
    header.className = "monthly-date";
    header.textContent = day;
    cell.appendChild(header);

    const items = data.get(key) || [];
    items.forEach((item) => {
      const isMine = user && item.user_id === user.id;
      const entry = document.createElement("div");
      entry.className = `monthly-entry ${isMine ? "mine" : ""}`;
      entry.innerHTML = `<strong>${item.company_name}</strong><br />${formatTime(
        item.start_at
      )}–${formatTime(item.end_at)}`;
      cell.appendChild(entry);
    });

    grid.appendChild(cell);
  }

  return grid;
}

let currentWeekStart = getWeekStart(new Date());
let currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

async function loadDashboard() {
  const weekStart = new Date(currentWeekStart);
  const weekStartIso = toISODate(weekStart);
  const monthStart = new Date(currentMonthStart);
  const monthIso = monthStart.toISOString().slice(0, 7);

  const [weeklyRes, monthlyRes] = await Promise.all([
    fetch(`/api/public/dashboard/weekly?week_start=${weekStartIso}`),
    fetch(`/api/public/dashboard/monthly?month=${monthIso}`)
  ]);

  const weeklyData = await weeklyRes.json();
  const monthlyData = await monthlyRes.json();

  const reservations = weeklyData.reservations || [];
  weeklyView.innerHTML = "";
  weeklyView.appendChild(buildWeeklyTable(reservations, weekStart));
  if (weekRange) {
    weekRange.textContent = formatRangeLabel(weekStart);
  }

  monthlyView.innerHTML = "";
  monthlyView.appendChild(
    buildMonthlyCalendar(buildMonthlyTable(monthlyData.days || []), monthStart)
  );
  if (monthRange) {
    monthRange.textContent = monthStart.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric"
    });
  }

  const today = new Date();
  const todayCount = reservations.filter(
    (reservation) => new Date(reservation.start_at).toDateString() === today.toDateString()
  ).length;
  weekSummary.textContent = `${reservations.length} bookings this week`;
  todaySummary.textContent = `${todayCount} bookings today`;
}

if (weekPrev && weekNext && weekToday) {
  weekPrev.addEventListener("click", () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    loadDashboard();
  });
  weekNext.addEventListener("click", () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    loadDashboard();
  });
  weekToday.addEventListener("click", () => {
    currentWeekStart = getWeekStart(new Date());
    loadDashboard();
  });
}

if (monthPrev && monthNext && monthToday) {
  monthPrev.addEventListener("click", () => {
    currentMonthStart = new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() - 1,
      1
    );
    loadDashboard();
  });
  monthNext.addEventListener("click", () => {
    currentMonthStart = new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() + 1,
      1
    );
    loadDashboard();
  });
  monthToday.addEventListener("click", () => {
    currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    loadDashboard();
  });
}

loadDashboard();
