const params = new URLSearchParams(location.search);
const blockedURL = params.get('url') ? decodeURIComponent(params.get('url')) : '';
const blockedSet = params.get('set') || '1';

document.getElementById('blocked-url').textContent = blockedURL;

chrome.runtime.sendMessage({ type: 'fg:blocked', set: blockedSet }).then(info => {
  if (info?.customMsg) document.getElementById('custom-msg').textContent = info.customMsg;
  if (info?.setName)   document.getElementById('set-name').textContent   = 'Block set: ' + info.setName;
}).catch(() => {});

document.getElementById('btn-back').addEventListener('click',    () => history.back());
document.getElementById('btn-close').addEventListener('click',   () => chrome.runtime.sendMessage({ type: 'fg:close' }));
document.getElementById('btn-options').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'fg:open-options' }));
