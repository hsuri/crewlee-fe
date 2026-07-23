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
  loadRestaurants();
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

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

async function loadRestaurants() {
  const tok = getAdminToken();
  try {
    const res = await fetch('/api/admin/restaurants', {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!res.ok) return;
    const restaurants = await res.json();
    renderRestaurants(restaurants);
  } catch (err) {
    console.error('Error loading restaurants:', err);
  }
}

function renderRestaurants(restaurants) {
  const tbody = document.getElementById('restaurantsTable');
  if (restaurants.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#A08C84;padding:48px 16px;font-size:14px;">No restaurants yet</td></tr>';
    return;
  }
  tbody.innerHTML = restaurants.map(r => `
    <tr>
      <td style="font-weight:500">${esc(r.name)}</td>
      <td><span class="role-badge">${esc(r.slug)}</span></td>
      <td style="color:#6B5A52">${esc(r.managerName)} · ${esc(r.managerEmail)}</td>
      <td>${r.employeeCount}</td>
      <td style="color:#6B5A52">${new Date(r.createdAt).toLocaleDateString()}</td>
    </tr>
  `).join('');
}

const restoSlugInput = document.getElementById('restoSlug');
let slugTouched = false;
restoSlugInput.addEventListener('input', () => { slugTouched = true; });
document.getElementById('restoName').addEventListener('input', (e) => {
  if (slugTouched) return;
  restoSlugInput.value = e.target.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
});

document.getElementById('restaurantForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('restoSubmitBtn');
  const errorDiv = document.getElementById('restaurantError');
  errorDiv.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding...';

  try {
    const res = await fetch('/api/admin/restaurants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
      body: JSON.stringify({
        name: document.getElementById('restoName').value,
        slug: document.getElementById('restoSlug').value,
        managerName: document.getElementById('restoManagerName').value,
        managerEmail: document.getElementById('restoManagerEmail').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Could not create restaurant');

    e.target.reset();
    slugTouched = false;
    await loadRestaurants();
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Restaurant';
  }
});

function esc(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}
