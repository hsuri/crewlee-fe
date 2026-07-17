import { clearAdminToken, getAdminToken, setAdminToken } from './lib/session.js';

if (getAdminToken()) {
  showDashboard();
} else {
  document.getElementById('loginScreen').classList.remove('hidden');
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('password').value;
  const errorDiv = document.getElementById('loginError');

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      const data = await res.json();
      setAdminToken(data.token);
      showDashboard();
    } else {
      errorDiv.textContent = 'Invalid password';
      errorDiv.classList.remove('hidden');
    }
  } catch {
    errorDiv.textContent = 'Error logging in';
    errorDiv.classList.remove('hidden');
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearAdminToken();
  window.location.href = '/';
});

let allUsers = [];

async function showDashboard() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');
  loadWaitlist();
}

async function loadWaitlist() {
  const tok = getAdminToken();
  try {
    const res = await fetch('/api/waitlist', {
      headers: { Authorization: `Bearer ${tok}` },
    });

    if (res.ok) {
      allUsers = await res.json();
      renderTable(allUsers);
      updateStats(allUsers);
    } else {
      clearAdminToken();
      location.reload();
    }
  } catch (err) {
    console.error('Error loading waitlist:', err);
  }
}

function renderTable(users) {
  const tbody = document.getElementById('waitlistTable');
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#A08C84;padding:48px 16px;font-size:14px;">No signups yet</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td style="font-weight:500">${esc(u.name || '—')}</td>
      <td style="color:#6B5A52">${esc(u.email)}</td>
      <td>${esc(u.restaurant || '—')}</td>
      <td><span class="role-badge">${esc(u.role || '—')}</span></td>
      <td style="color:#6B5A52">${new Date(u.created_at).toLocaleDateString()}</td>
    </tr>
  `).join('');
}

function updateStats(users) {
  document.getElementById('totalCount').textContent = users.length;
  document.getElementById('ownerCount').textContent = users.filter(u => u.role === 'Owner').length;
  document.getElementById('gmCount').textContent = users.filter(u => u.role === 'General Manager').length;
  document.getElementById('opsCount').textContent = users.filter(u => u.role === 'Operations Manager').length;
}

document.getElementById('exportBtn').addEventListener('click', () => {
  if (!allUsers.length) return;
  const cols = ['name', 'email', 'restaurant', 'role', 'created_at'];
  const header = cols.join(',');
  const rows = allUsers.map(u =>
    cols.map(c => `"${String(u[c] || '').replace(/"/g, '""')}"`).join(',')
  );
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'crewlee-waitlist.csv';
  a.click();
  URL.revokeObjectURL(url);
});

function esc(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}
