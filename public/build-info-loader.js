const elements = document.querySelectorAll(".build-info");
const info = window.__BUILD_INFO__ || { version: "local", date: "local" };

elements.forEach((element) => {
  element.textContent = `Build ${info.version} · Updated ${info.date}`;
});
