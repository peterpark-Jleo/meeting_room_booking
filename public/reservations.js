const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");

if (!token || !user) {
  window.location.href = "/";
}

document.getElementById("logout").addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "/";
});

const form = document.getElementById("reservation-form");
const message = document.getElementById("reservation-message");
const list = document.getElementById("reservation-list");
const historyList = document.getElementById("history-list");
const startSelect = document.getElementById("start");
const endSelect = document.getElementById("end");

let roomId = null;

function buildTimeOptions(select) {
  select.innerHTML = "";
  for (let hour = 9; hour <= 21; hour += 1) {
    for (const minute of [0, 30]) {
      if (hour === 21 && minute === 30) {
        continue;
      }
      const label = `${String(hour).padStart(2, "0")}:${minute === 0 ? "00" : "30"}`;
      const option = document.createElement("option");
      option.value = label;
      option.textContent = label;
      select.appendChild(option);
    }
  }
}

async function fetchRooms() {
  const response = await fetch("/api/rooms");
  const rooms = await response.json();
  roomId = rooms[0]?.id;
}

function formatRange(reservation) {
  const start = new Date(reservation.start_at);
  const end = new Date(reservation.end_at);
  return `${start.toLocaleDateString("en-GB")} ${start.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })} - ${end.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })}`;
}

async function loadReservations() {
  const response = await fetch("/api/reservations?mine=true", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const reservations = await response.json();
  list.innerHTML = "";

  reservations.forEach((reservation) => {
    const card = document.createElement("div");
    card.className = "panel";
    card.innerHTML = `
      <strong>${reservation.title || "Meeting room booking"}</strong>
      <div class="muted">${formatRange(reservation)}</div>
      <span class="badge ${reservation.status}">${reservation.status}</span>
      <div style="margin-top: 12px; display: flex; gap: 8px;">
        <button class="button" data-action="change">Request time change</button>
        <button class="button" data-action="cancel">Cancel</button>
      </div>
    `;
    card.querySelector("[data-action=change]").addEventListener("click", async () => {
      const date = window.prompt("Enter new date (YYYY-MM-DD):");
      if (!date) {
        return;
      }
      const start = window.prompt("Enter new start time (HH:MM):");
      if (!start) {
        return;
      }
      const end = window.prompt("Enter new end time (HH:MM):");
      if (!end) {
        return;
      }
      const start_at = `${date}T${start}:00`;
      const end_at = `${date}T${end}:00`;

      const update = await fetch(`/api/reservations/${reservation.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ start_at, end_at })
      });

      if (!update.ok) {
        const payload = await update.json();
        message.textContent = payload.error || "Change request was rejected.";
        await loadReservations();
        return;
      }

      const updated = await update.json();
      if (updated?.reservation?.status === "pending") {
        message.textContent = "Change request submitted for approval.";
      } else {
        message.textContent = "Time change approved.";
      }
      await loadReservations();
      await loadHistory();
    });

    card.querySelector("[data-action=cancel]").addEventListener("click", async () => {
      if (!window.confirm("Cancel this booking?")) {
        return;
      }
      const cancel = await fetch(`/api/reservations/${reservation.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!cancel.ok) {
        message.textContent = "Cancel request failed.";
        return;
      }
      message.textContent = "Booking canceled.";
      await loadReservations();
      await loadHistory();
    });
    list.appendChild(card);
  });
}

function formatHistoryItem(item) {
  const payload = item.payload || {};
  const start = payload.start_at ? new Date(payload.start_at) : null;
  const end = payload.end_at ? new Date(payload.end_at) : null;
  const range = start && end ? formatRange({ start_at: start, end_at: end }) : "";
  const reason = payload.reason ? ` · Reason: ${payload.reason}` : "";
  return `${item.type.toUpperCase()}${range ? ` · ${range}` : ""}${reason}`;
}

async function loadHistory() {
  const response = await fetch("/api/notifications?mine=true", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const items = await response.json();
  historyList.innerHTML = "";
  if (!items.length) {
    historyList.innerHTML = "<p class=\"notice\">No history yet.</p>";
    return;
  }
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "panel";
    card.innerHTML = `
      <strong>${item.type}</strong>
      <div class="muted">${formatHistoryItem(item)}</div>
    `;
    historyList.appendChild(card);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";

  if (!roomId) {
    message.textContent = "Unable to load room data.";
    return;
  }

  const formData = new FormData(form);
  const date = formData.get("date");
  const start = formData.get("start");
  const end = formData.get("end");
  const title = formData.get("title");

  const start_at = `${date}T${start}:00`;
  const end_at = `${date}T${end}:00`;

  const response = await fetch("/api/reservations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ room_id: roomId, start_at, end_at, title })
  });

  if (!response.ok) {
    const payload = await response.json();
    message.textContent = payload.error || "Booking request failed.";
    return;
  }

  message.textContent = "Booking request submitted.";
  form.reset();
  await loadReservations();
  await loadHistory();
});

await fetchRooms();
if (startSelect && endSelect) {
  buildTimeOptions(startSelect);
  buildTimeOptions(endSelect);
}
await loadReservations();
await loadHistory();
