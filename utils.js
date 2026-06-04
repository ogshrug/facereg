const API_URL =
  window.API_URL ||
  (window.location.protocol === 'file:'
    ? 'http://localhost:8000'
    : `${window.location.protocol}//${window.location.hostname}:8000`);
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
