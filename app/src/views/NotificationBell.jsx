import { useState, useEffect } from 'preact/hooks';
import { api } from '../shared/api.js';

export function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  async function load() {
    try {
      const d = await api('notifications', {});
      setItems(d.notifications || []);
      setUnread(d.unread || 0);
    } catch (e) { /* silent */ }
  }
  useEffect(() => { load(); }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread) {
      const ids = items.filter(n => !n.read).map(n => n.id);
      setUnread(0);
      setItems(items.map(n => ({ ...n, read: true })));
      try { await api('notif_read', { ids }); } catch (e) { /* silent */ }
    }
  }

  return (
    <div class="bell-wrap">
      <button class="bell" onClick={toggle} title="Notifications">
        🔔{unread > 0 && <span class="bell-count">{unread}</span>}
      </button>
      {open && (
        <div class="bell-menu">
          <div class="bell-head">Notifications</div>
          {!items.length && <div class="bell-empty">Nothing new.</div>}
          {items.map(n => (
            <div class={`bell-item${n.read ? '' : ' unread'}`} key={n.id}>
              <span class={`bell-dot t-${(n.type || '').toLowerCase().replace(/\s+/g, '')}`}></span>
              <div><div class="bell-msg">{n.message}</div><div class="bell-when">{when(n.at)}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function when(iso) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
