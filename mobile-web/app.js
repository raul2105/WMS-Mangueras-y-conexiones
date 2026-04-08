import { fetchHealth, fetchMePermissions, fetchVersion } from "./api-client.js";
import { logout, restoreSession, startLogin } from "./auth-adapter.js";

const loginView = document.querySelector("#loginView");
const homeView = document.querySelector("#homeView");
const loginBtn = document.querySelector("#loginBtn");
const logoutBtn = document.querySelector("#logoutBtn");

const displayNameEl = document.querySelector("#displayName");
const userMetaEl = document.querySelector("#userMeta");
const healthOutputEl = document.querySelector("#healthOutput");
const versionOutputEl = document.querySelector("#versionOutput");
const meOutputEl = document.querySelector("#meOutput");

function toPretty(value) {
  return JSON.stringify(value, null, 2);
}

function setView(isAuthenticated) {
  loginView.classList.toggle("hidden", isAuthenticated);
  homeView.classList.toggle("hidden", !isAuthenticated);
}

async function loadDashboard(session) {
  displayNameEl.textContent = session.displayName || "Mobile User";
  userMetaEl.textContent = `userId: ${session.userId || "-"} | authMode: ${session.authMode}`;

  const [health, version, mePermissions] = await Promise.all([
    fetchHealth(),
    fetchVersion(),
    fetchMePermissions(session.token),
  ]);

  healthOutputEl.textContent = toPretty(health);
  versionOutputEl.textContent = toPretty(version);
  meOutputEl.textContent = toPretty(mePermissions);
}

async function bootstrap() {
  const session = await restoreSession();
  setView(Boolean(session));
  if (session) {
    await loadDashboard(session);
  }
}

loginBtn.addEventListener("click", async () => {
  try {
    await startLogin();
    await bootstrap();
  } catch (error) {
    meOutputEl.textContent = toPretty({ ok: false, error: String(error) });
  }
});

logoutBtn.addEventListener("click", () => {
  logout();
  setView(false);
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.error("service worker register failed", error);
  });
}

bootstrap().catch((error) => {
  console.error("bootstrap failed", error);
});
