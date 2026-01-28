import "dotenv/config";
import express from "express";
import bcrypt from "bcryptjs";
import { DateTime, Interval } from "luxon";
import { pool, withClient } from "./db.js";
import { requireAdmin, requireAuth, signToken } from "./auth.js";
import { sendEmail } from "./email.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const defaultSettings = {
  approval_mode: false,
  slot_minutes: 30,
  max_duration_minutes: 120,
  open_time: "09:00",
  close_time: "21:00"
};

async function getSettings(client) {
  const result = await client.query("select * from settings limit 1");
  return result.rows[0] || defaultSettings;
}

function parseTimeString(value) {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function validateReservation({ start_at, end_at, settings }) {
  const start = DateTime.fromISO(start_at, { zone: "local" });
  const end = DateTime.fromISO(end_at, { zone: "local" });

  if (!start.isValid || !end.isValid) {
    return "Invalid date format";
  }

  if (end <= start) {
    return "End time must be after start time";
  }

  const duration = end.diff(start, "minutes").minutes;
  if (duration > settings.max_duration_minutes) {
    return `Max duration is ${settings.max_duration_minutes} minutes`;
  }

  const slot = settings.slot_minutes;
  if (start.minute % slot !== 0 || end.minute % slot !== 0) {
    return `Time must align to ${slot}-minute slots`;
  }

  const { hour: openHour, minute: openMinute } = parseTimeString(settings.open_time);
  const { hour: closeHour, minute: closeMinute } = parseTimeString(settings.close_time);
  const dayStart = start.set({ hour: openHour, minute: openMinute, second: 0, millisecond: 0 });
  const dayEnd = start.set({ hour: closeHour, minute: closeMinute, second: 0, millisecond: 0 });

  if (start < dayStart || end > dayEnd) {
    return `Reservations must be within ${settings.open_time}-${settings.close_time}`;
  }

  return null;
}

async function hasConflict(client, { roomId, start_at, end_at, excludeId }) {
  const result = await client.query(
    `select count(*)::int as count
     from reservations
     where room_id = $1
       and status in ('approved', 'pending')
       and start_at < $2
       and end_at > $3
       ${excludeId ? "and id <> $4" : ""}`,
    excludeId ? [roomId, end_at, start_at, excludeId] : [roomId, end_at, start_at]
  );
  return result.rows[0].count > 0;
}

async function recordNotification(client, reservationId, type, payload) {
  await client.query(
    `insert into notifications (reservation_id, type, payload)
     values ($1, $2, $3)`,
    [reservationId, type, payload]
  );
}

async function fetchReservationContext(client, reservationId) {
  const result = await client.query(
    `select r.*, u.email, u.company_name
     from reservations r
     join users u on u.id = r.user_id
     where r.id = $1`,
    [reservationId]
  );
  return result.rows[0];
}

async function sendReservationEmail(client, reservationId, action, reason) {
  const reservation = await fetchReservationContext(client, reservationId);
  if (!reservation) {
    return null;
  }

  const html = formatReservationEmail({
    action,
    reservation,
    companyName: reservation.company_name,
    reason
  });

  await sendEmail({
    to: reservation.email,
    subject: `Meeting room booking ${action}`,
    html
  });
  return reservation;
}

function formatReservationEmail({ action, reservation, companyName, reason }) {
  const start = DateTime.fromJSDate(reservation.start_at).toFormat("yyyy-LL-dd HH:mm");
  const end = DateTime.fromJSDate(reservation.end_at).toFormat("HH:mm");
  const duration = Interval.fromDateTimes(reservation.start_at, reservation.end_at)
    .length("minutes")
    .toFixed(0);
  const lines = [
    `<p><strong>${companyName}</strong> booking was ${action}.</p>`,
    `<p>Time: ${start} - ${end} (${duration} minutes)</p>`
  ];

  if (reason) {
    lines.push(`<p>Rejection reason: ${reason}</p>`);
  }

  return lines.join("");
}

function generateTempPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const result = await pool.query("select * from users where email = $1", [email]);
  const user = result.rows[0];
  if (!user || user.status !== "active") {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signToken(user);
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      company_name: user.company_name,
      role: user.role
    }
  });
});

app.post("/api/signup", async (req, res) => {
  const { name, email, company_name, password } = req.body;
  if (!name || !email || !company_name || !password) {
    return res.status(400).json({ error: "name, email, company_name, password required" });
  }

  const existing = await pool.query(
    "select 1 from users where email = $1",
    [email]
  );
  if (existing.rows.length) {
    return res.status(409).json({ error: "Email already exists" });
  }

  const pending = await pool.query(
    "select 1 from signup_requests where email = $1 and status = 'pending'",
    [email]
  );
  if (pending.rows.length) {
    return res.status(409).json({ error: "Signup already requested" });
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `insert into signup_requests (name, email, company_name, password_hash)
     values ($1, $2, $3, $4)
     returning id, name, email, company_name, status, created_at`,
    [name, email, company_name, hash]
  );

  return res.status(201).json(result.rows[0]);
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const result = await pool.query(
    "select id, email, name, company_name, role from users where id = $1",
    [req.user.id]
  );
  return res.json(result.rows[0]);
});

app.patch("/api/profile", requireAuth, async (req, res) => {
  const { email, name, company_name } = req.body;
  const current = await pool.query("select * from users where id = $1", [req.user.id]);
  const user = current.rows[0];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (email && email !== user.email) {
    const existing = await pool.query("select 1 from users where email = $1", [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: "Email already exists" });
    }
  }

  const result = await pool.query(
    `update users
     set email = $1,
         name = $2,
         company_name = $3,
         updated_at = now()
     where id = $4
     returning id, email, name, company_name, role`,
    [email || user.email, name || user.name, company_name || user.company_name, user.id]
  );

  return res.json(result.rows[0]);
});

app.post("/api/profile/password", requireAuth, async (req, res) => {
  const { current_password, password } = req.body;
  if (!current_password || !password) {
    return res.status(400).json({ error: "Current password and new password required" });
  }

  const result = await pool.query(
    "select password_hash from users where id = $1",
    [req.user.id]
  );
  const user = result.rows[0];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const ok = await bcrypt.compare(current_password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    "update users set password_hash = $1, updated_at = now() where id = $2",
    [hash, req.user.id]
  );
  return res.json({ ok: true });
});

app.get("/api/rooms", async (req, res) => {
  const result = await pool.query(
    "select * from rooms where active = true order by name"
  );
  return res.json(result.rows);
});

app.get("/api/reservations", requireAuth, async (req, res) => {
  const { mine, from, to, status } = req.query;
  const filters = [];
  const values = [];

  if (mine === "true") {
    values.push(req.user.id);
    filters.push(`user_id = $${values.length}`);
  }
  if (from) {
    values.push(from);
    filters.push(`start_at >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    filters.push(`end_at <= $${values.length}`);
  }
  if (status) {
    values.push(status);
    filters.push(`status = $${values.length}`);
  }

  const where = filters.length ? `where ${filters.join(" and ")}` : "";
  const result = await pool.query(
    `select * from reservations ${where} order by start_at asc`,
    values
  );
  return res.json(result.rows);
});

app.get("/api/notifications", requireAuth, async (req, res) => {
  const { mine, limit } = req.query;
  const values = [];
  const filters = [];
  const limitValue = Number(limit);

  if (mine !== "true" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }

  if (mine === "true") {
    values.push(req.user.id);
    filters.push(`r.user_id = $${values.length}`);
  }

  const where = filters.length ? `where ${filters.join(" and ")}` : "";
  const limitClause = Number.isFinite(limitValue) && limitValue > 0 ? `limit ${limitValue}` : "";

  const result = await pool.query(
    `select n.*
     from notifications n
     join reservations r on r.id = n.reservation_id
     ${where}
     order by n.created_at desc
     ${limitClause}`,
    values
  );
  return res.json(result.rows);
});

app.post("/api/reservations", requireAuth, async (req, res) => {
  const { room_id, start_at, end_at, title } = req.body;
  if (!room_id || !start_at || !end_at) {
    return res.status(400).json({ error: "room_id, start_at, end_at required" });
  }

  await withClient(async (client) => {
    const settings = await getSettings(client);
    const validationError = validateReservation({ start_at, end_at, settings });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const conflict = await hasConflict(client, {
      roomId: room_id,
      start_at,
      end_at
    });
    if (conflict) {
      return res.status(409).json({ error: "Time slot conflict" });
    }

    const status = settings.approval_mode ? "pending" : "approved";
    const result = await client.query(
      `insert into reservations (room_id, user_id, title, start_at, end_at, status)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [room_id, req.user.id, title || null, start_at, end_at, status]
    );

    const reservation = result.rows[0];
    await recordNotification(client, reservation.id, "created", {
      company_name: req.user.company_name,
      start_at,
      end_at
    });

    await sendReservationEmail(client, reservation.id, "created");

    return res.status(201).json(reservation);
  });
});

app.patch("/api/reservations/:id", requireAuth, async (req, res) => {
  const { start_at, end_at, title } = req.body;
  const { id } = req.params;

  await withClient(async (client) => {
    const existing = await client.query(
      "select * from reservations where id = $1 and user_id = $2",
      [id, req.user.id]
    );
    const reservation = existing.rows[0];
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    const settings = await getSettings(client);
    const nextStart = start_at || reservation.start_at;
    const nextEnd = end_at || reservation.end_at;
    const validationError = validateReservation({
      start_at: nextStart,
      end_at: nextEnd,
      settings
    });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const conflict = await hasConflict(client, {
      roomId: reservation.room_id,
      start_at: nextStart,
      end_at: nextEnd,
      excludeId: reservation.id
    });
    if (conflict) {
      return res.status(409).json({ error: "Time slot conflict" });
    }

    if (settings.approval_mode) {
      const changeResult = await client.query(
        `insert into reservation_changes
          (reservation_id, requested_by, old_start_at, old_end_at, new_start_at, new_end_at, status)
         values ($1, $2, $3, $4, $5, $6, 'pending')
         returning *`,
        [
          reservation.id,
          req.user.id,
          reservation.start_at,
          reservation.end_at,
          nextStart,
          nextEnd
        ]
      );

      const updated = await client.query(
        "update reservations set status = 'pending', updated_at = now() where id = $1 returning *",
        [reservation.id]
      );

      await recordNotification(client, reservation.id, "updated", {
        company_name: req.user.company_name,
        start_at: nextStart,
        end_at: nextEnd,
        pending: true
      });

      await sendReservationEmail(client, reservation.id, "change requested");

      return res.json({
        reservation: updated.rows[0],
        change_request: changeResult.rows[0]
      });
    }

    const update = await client.query(
      `update reservations
       set start_at = $1, end_at = $2, title = $3, updated_at = now()
       where id = $4
       returning *`,
      [nextStart, nextEnd, title ?? reservation.title, reservation.id]
    );

    await recordNotification(client, reservation.id, "updated", {
      company_name: req.user.company_name,
      start_at: nextStart,
      end_at: nextEnd
    });

    await sendReservationEmail(client, reservation.id, "updated");

    return res.json(update.rows[0]);
  });
});

app.delete("/api/reservations/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  await withClient(async (client) => {
    const existing = await client.query(
      "select * from reservations where id = $1 and user_id = $2",
      [id, req.user.id]
    );
    const reservation = existing.rows[0];
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    const update = await client.query(
      "update reservations set status = 'canceled', updated_at = now() where id = $1 returning *",
      [id]
    );

    await recordNotification(client, reservation.id, "canceled", {
      company_name: req.user.company_name,
      start_at: reservation.start_at,
      end_at: reservation.end_at
    });

    await sendReservationEmail(client, reservation.id, "canceled");

    return res.json(update.rows[0]);
  });
});

app.get("/api/admin/reservations", requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.query;
  const values = [];
  const filters = [];
  if (status) {
    values.push(status);
    filters.push(`r.status = $${values.length}`);
  }

  const where = filters.length ? `where ${filters.join(" and ")}` : "";
  const result = await pool.query(
    `select r.*, u.name, u.company_name
     from reservations r
     join users u on u.id = r.user_id
     ${where}
     order by r.start_at asc`,
    values
  );

  return res.json(result.rows);
});

app.get("/api/admin/pending-changes", requireAuth, requireAdmin, async (req, res) => {
  const result = await pool.query(
    `select rc.*, u.name, u.company_name, r.title
     from reservation_changes rc
     join reservations r on r.id = rc.reservation_id
     join users u on u.id = r.user_id
     where rc.status = 'pending'
     order by rc.created_at asc`
  );
  return res.json(result.rows);
});

app.post(
  "/api/admin/reservations/:id/approve",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;
    await withClient(async (client) => {
      const reservationResult = await client.query(
        "select * from reservations where id = $1",
        [id]
      );
      const reservation = reservationResult.rows[0];
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }

      const pendingChange = await client.query(
        "select * from reservation_changes where reservation_id = $1 and status = 'pending'",
        [id]
      );

      if (pendingChange.rows.length) {
        const change = pendingChange.rows[0];
        await client.query(
          `update reservations
           set start_at = $1, end_at = $2, status = 'approved', updated_at = now()
           where id = $3`,
          [change.new_start_at, change.new_end_at, reservation.id]
        );
        await client.query(
          "update reservation_changes set status = 'approved', updated_at = now() where id = $1",
          [change.id]
        );
      } else {
        await client.query(
          "update reservations set status = 'approved', updated_at = now() where id = $1",
          [reservation.id]
        );
      }

      const context = await fetchReservationContext(client, reservation.id);
      await recordNotification(client, reservation.id, "approved", {
        company_name: context.company_name,
        start_at: context.start_at,
        end_at: context.end_at
      });

      await sendReservationEmail(client, reservation.id, "approved");

      return res.json({ ok: true });
    });
  }
);

app.post(
  "/api/admin/reservations/:id/reject",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ error: "Reject reason required" });
    }

    await withClient(async (client) => {
      const reservationResult = await client.query(
        "select * from reservations where id = $1",
        [id]
      );
      const reservation = reservationResult.rows[0];
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }

      const pendingChange = await client.query(
        "select * from reservation_changes where reservation_id = $1 and status = 'pending'",
        [id]
      );

      if (pendingChange.rows.length) {
        const change = pendingChange.rows[0];
        await client.query(
          "update reservation_changes set status = 'rejected', reject_reason = $1, updated_at = now() where id = $2",
          [reason, change.id]
        );
        await client.query(
          "update reservations set status = 'approved', updated_at = now() where id = $1",
          [reservation.id]
        );
      } else {
        await client.query(
          "update reservations set status = 'rejected', updated_at = now() where id = $1",
          [reservation.id]
        );
      }

      const context = await fetchReservationContext(client, reservation.id);
      await recordNotification(client, reservation.id, "rejected", {
        company_name: context.company_name,
        start_at: context.start_at,
        end_at: context.end_at,
        reason
      });

      await sendReservationEmail(client, reservation.id, "rejected", reason);

      return res.json({ ok: true });
    });
  }
);

app.get("/api/admin/settings/reservation", requireAuth, requireAdmin, async (req, res) => {
  const settings = await getSettings(pool);
  return res.json(settings);
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  const { q, status, role } = req.query;
  const filters = [];
  const values = [];

  if (q) {
    values.push(`%${q}%`);
    filters.push(
      `(name ilike $${values.length} or email ilike $${values.length} or company_name ilike $${values.length})`
    );
  }
  if (status) {
    values.push(status);
    filters.push(`status = $${values.length}`);
  }
  if (role) {
    values.push(role);
    filters.push(`role = $${values.length}`);
  }

  const where = filters.length ? `where ${filters.join(" and ")}` : "";
  const result = await pool.query(
    `select id, email, name, company_name, role, status, created_at
     from users
     ${where}
     order by created_at desc`,
    values
  );
  return res.json(result.rows);
});

app.get("/api/admin/signup-requests", requireAuth, requireAdmin, async (req, res) => {
  const { count } = req.query;
  if (count === "true") {
    const result = await pool.query(
      "select count(*)::int as count from signup_requests where status = 'pending'"
    );
    return res.json({ count: result.rows[0].count });
  }

  const result = await pool.query(
    `select id, name, email, company_name, status, created_at
     from signup_requests
     where status = 'pending'
     order by created_at asc`
  );
  return res.json(result.rows);
});

app.post("/api/admin/signup-requests/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  await withClient(async (client) => {
    const requestResult = await client.query(
      "select * from signup_requests where id = $1 and status = 'pending'",
      [id]
    );
    const request = requestResult.rows[0];
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    const existing = await client.query(
      "select 1 from users where email = $1",
      [request.email]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: "Email already exists" });
    }

    await client.query(
      `insert into users (email, password_hash, name, company_name, role, status)
       values ($1, $2, $3, $4, 'user', 'active')`,
      [request.email, request.password_hash, request.name, request.company_name]
    );

    await client.query(
      "update signup_requests set status = 'approved', updated_at = now() where id = $1",
      [request.id]
    );

    return res.json({ ok: true });
  });
});

app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  const { email, name, company_name, role, status, password } = req.body;
  if (!email || !name || !company_name || !password) {
    return res.status(400).json({ error: "email, name, company_name, password required" });
  }

  const nextRole = role === "admin" ? "admin" : "user";
  const nextStatus = status === "inactive" ? "inactive" : "active";

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `insert into users (email, password_hash, name, company_name, role, status)
       values ($1, $2, $3, $4, $5, $6)
       returning id, email, name, company_name, role, status, created_at`,
      [email, hash, name, company_name, nextRole, nextStatus]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    return res.status(500).json({ error: "Failed to create user" });
  }
});

app.patch("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { email, name, company_name, role, status } = req.body;

  await withClient(async (client) => {
    const userResult = await client.query("select * from users where id = $1", [id]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const nextRole = role || user.role;
    const nextStatus = status || user.status;
    if (user.role === "admin" && (nextRole !== "admin" || nextStatus !== "active")) {
      const adminResult = await client.query(
        "select count(*)::int as count from users where role = 'admin' and status = 'active' and id <> $1",
        [user.id]
      );
      if (adminResult.rows[0].count === 0) {
        return res.status(400).json({ error: "At least one active admin is required" });
      }
    }

    const update = await client.query(
      `update users
       set email = $1,
           name = $2,
           company_name = $3,
           role = $4,
           status = $5,
           updated_at = now()
       where id = $6
       returning id, email, name, company_name, role, status, created_at`,
      [
        email || user.email,
        name || user.name,
        company_name || user.company_name,
        nextRole,
        nextStatus,
        user.id
      ]
    );

    return res.json(update.rows[0]);
  });
});

app.post("/api/admin/users/:id/password", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Password required" });
  }

  const userResult = await pool.query("select id from users where id = $1", [id]);
  if (!userResult.rows.length) {
    return res.status(404).json({ error: "User not found" });
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query("update users set password_hash = $1, updated_at = now() where id = $2", [
    hash,
    id
  ]);
  return res.json({ ok: true });
});

app.post("/api/admin/users/:id/password-reset", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const userResult = await pool.query("select id, email, name from users where id = $1", [id]);
  const user = userResult.rows[0];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const tempPassword = generateTempPassword();
  const hash = await bcrypt.hash(tempPassword, 10);
  await pool.query("update users set password_hash = $1, updated_at = now() where id = $2", [
    hash,
    id
  ]);

  let emailSent = false;
  try {
    const html = `<p>Your temporary password is: <strong>${tempPassword}</strong></p>`;
    const result = await sendEmail({
      to: user.email,
      subject: "Temporary password for Meeting Room Booking",
      html
    });
    emailSent = !result?.skipped;
  } catch (error) {
    emailSent = false;
  }

  return res.json({ temp_password: tempPassword, email_sent: emailSent });
});

app.patch("/api/admin/settings/reservation", requireAuth, requireAdmin, async (req, res) => {
  const { approval_mode } = req.body;
  const result = await pool.query(
    `update settings
     set approval_mode = $1, updated_at = now(), updated_by = $2
     returning *`,
    [approval_mode === true, req.user.id]
  );
  return res.json(result.rows[0]);
});

app.get("/api/public/dashboard/weekly", async (req, res) => {
  const { week_start } = req.query;
  if (!week_start) {
    return res.status(400).json({ error: "week_start required" });
  }

  const start = DateTime.fromISO(week_start).startOf("day");
  const end = start.plus({ days: 7 });
  const result = await pool.query(
    `select r.start_at, r.end_at, r.user_id, u.company_name
     from reservations r
     join users u on u.id = r.user_id
     where r.status = 'approved'
       and r.start_at >= $1
       and r.start_at < $2
     order by r.start_at asc`,
    [start.toISO(), end.toISO()]
  );

  const reservations = result.rows.map((row) => ({
    company_name: row.company_name,
    user_id: row.user_id,
    start_at: row.start_at,
    end_at: row.end_at,
    duration_minutes: Interval.fromDateTimes(row.start_at, row.end_at).length("minutes")
  }));

  return res.json({ reservations });
});

app.get("/api/public/dashboard/monthly", async (req, res) => {
  const { month } = req.query;
  if (!month) {
    return res.status(400).json({ error: "month required" });
  }

  const monthStart = DateTime.fromISO(`${month}-01`).startOf("day");
  const monthEnd = monthStart.plus({ months: 1 });
  const result = await pool.query(
    `select r.start_at, r.end_at, r.user_id, u.company_name
     from reservations r
     join users u on u.id = r.user_id
     where r.status = 'approved'
       and r.start_at >= $1
       and r.start_at < $2
     order by r.start_at asc`,
    [monthStart.toISO(), monthEnd.toISO()]
  );

  const days = {};
  result.rows.forEach((row) => {
    const dateKey = DateTime.fromJSDate(row.start_at).toISODate();
    const duration = Interval.fromDateTimes(row.start_at, row.end_at).length("minutes");
    if (!days[dateKey]) {
      days[dateKey] = { date: dateKey, total_minutes: 0, items: [] };
    }
    days[dateKey].total_minutes += duration;
    days[dateKey].items.push({
      company_name: row.company_name,
      user_id: row.user_id,
      start_at: row.start_at,
      end_at: row.end_at,
      duration_minutes: duration
    });
  });

  return res.json({ days: Object.values(days) });
});

app.get("/api/admin/dashboard/weekly", requireAuth, requireAdmin, async (req, res) => {
  const { week_start } = req.query;
  if (!week_start) {
    return res.status(400).json({ error: "week_start required" });
  }

  const start = DateTime.fromISO(week_start).startOf("day");
  const end = start.plus({ days: 7 });
  const result = await pool.query(
    `select r.start_at, r.end_at, r.status, r.user_id, u.company_name
     from reservations r
     join users u on u.id = r.user_id
     where r.start_at >= $1
       and r.start_at < $2
     order by r.start_at asc`,
    [start.toISO(), end.toISO()]
  );

  const counts = result.rows.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    },
    { approved: 0, pending: 0, canceled: 0, rejected: 0 }
  );

  return res.json({ reservations: result.rows, counts });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
