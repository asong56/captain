document.getElementById('btn-lock').addEventListener('click', () => {
  const hours = parseInt(document.getElementById('hours').value) || 0;
  const mins  = parseInt(document.getElementById('mins').value)  || 0;
  const totalMins = hours * 60 + mins;
  if (totalMins <= 0) { document.getElementById('status').textContent = 'Enter a duration.'; return; }
  const endTime = Math.floor(Date.now() / 1000) + totalMins * 60;
  chrome.runtime.sendMessage({ type: 'fg:lockdown', set: 0, endTime }).then(() => {
    document.getElementById('status').textContent = `Lockdown active for ${hours}h ${mins}m`;
  });
});
document.getElementById('btn-cancel-lock').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'fg:lockdown', set: 0, endTime: 0 }).then(() => {
    document.getElementById('status').textContent = 'Lockdown cancelled.';
  });
});
document.getElementById('btn-close').addEventListener('click', () => window.close());
