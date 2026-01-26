const form = document.getElementById("signup-form");
const message = document.getElementById("signup-message");

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
