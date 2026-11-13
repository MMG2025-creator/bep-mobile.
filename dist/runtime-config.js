/* Local-only demo build: no account API or remote synchronization. */
window.BEP_DEMO_LOCAL = true;
window.BEP_API_BASE = "";
/* Open the demo shell immediately: the login screen is never the entry point. */
window.bepSignedIn = false;
window.bepOfflineMode = true;
window.bepDemoMode = true;
document.documentElement.classList.add("bep-demo-local");
const demoGate = document.getElementById("authGate");
const demoRoot = document.getElementById("bepAppRoot");
if (demoGate) demoGate.hidden = true;
if (demoRoot) {
  demoRoot.hidden = false;
  demoRoot.inert = false;
  demoRoot.setAttribute("aria-hidden", "false");
  demoRoot.style.setProperty("display", "block", "important");
}
