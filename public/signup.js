const form = document.getElementById("signup-form");
const message = document.getElementById("signup-message");
const passwordInput = document.getElementById("password");
const confirmInput = document.getElementById("confirm-password");

document.querySelectorAll(".toggle-password").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.getElementById(button.dataset.target);
    if (!target) {
      return;
    }
    target.type = target.type === "password" ? "text" : "password";
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";

  const formData = new FormData(form);
  const payload = {
    name: formData.get("name")?.toString().trim(),
    email: formData.get("email")?.toString().trim(),
    company_name: formData.get("company")?.toString().trim(),
    password: formData.get("password")?.toString()
  };

  if (passwordInput.value !== confirmInput.value) {
    message.textContent = "Passwords do not match.";
    return;
  }

  const response = await fetch("/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json();
    message.textContent = error.error || "Request failed.";
    return;
  }

  message.textContent = "Request submitted. You will receive access after approval.";
  form.reset();
});
