const form = document.getElementById("login-form");
const errorEl = document.getElementById("login-error");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    errorEl.textContent = "Sign in failed.";
    return;
  }

  const { token, user } = await response.json();
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));

  if (user.role === "admin") {
    window.location.href = "/admin.html";
  } else {
    window.location.href = "/app.html";
  }
});
