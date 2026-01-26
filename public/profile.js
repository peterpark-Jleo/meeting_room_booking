const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");

if (!token || !user) {
  window.location.href = "/";
}

document.getElementById("logout").addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "/";
});

const profileForm = document.getElementById("profile-form");
const passwordForm = document.getElementById("password-form");
const profileMessage = document.getElementById("profile-message");
const passwordMessage = document.getElementById("password-message");
const nameInput = document.getElementById("profile-name");
const emailInput = document.getElementById("profile-email");
const companyInput = document.getElementById("profile-company");
const currentPasswordInput = document.getElementById("current-password");
const passwordInput = document.getElementById("new-password");

async function loadProfile() {
  const response = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    window.location.href = "/";
    return;
  }
  const data = await response.json();
  nameInput.value = data.name || "";
  emailInput.value = data.email || "";
  companyInput.value = data.company_name || "";
}

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  profileMessage.textContent = "";
  const response = await fetch("/api/profile", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      company_name: companyInput.value.trim()
    })
  });

  if (!response.ok) {
    const error = await response.json();
    profileMessage.textContent = error.error || "Update failed.";
    return;
  }

  const updated = await response.json();
  localStorage.setItem("user", JSON.stringify(updated));
  profileMessage.textContent = "Profile updated.";
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  passwordMessage.textContent = "";
  const response = await fetch("/api/profile/password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      current_password: currentPasswordInput.value,
      password: passwordInput.value
    })
  });

  if (!response.ok) {
    const error = await response.json();
    passwordMessage.textContent = error.error || "Password update failed.";
    return;
  }

  currentPasswordInput.value = "";
  passwordInput.value = "";
  passwordMessage.textContent = "Password updated.";
});

loadProfile();
