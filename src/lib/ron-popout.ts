/** Open the Ask RON popout window. */
export function openRonPopout(context: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(context).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const url = `/ron-popout${params.toString() ? `?${params.toString()}` : ""}`;
  const w = 900;
  const h = 720;
  const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
  const features = `popup=yes,width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`;
  const win = window.open(url, "ron-popout", features);
  if (win) win.focus();
  return win;
}
