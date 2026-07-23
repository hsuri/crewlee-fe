import { createApiClient } from './lib/api.js';
import { clearSession, getSession } from './lib/session.js';
import { toast } from './lib/toast.js';
import { confirmDialog, promptDialog } from './lib/dialog.js';

// Disables `button` and swaps its label to `busyLabel` for the duration of `fn()`, restoring the
// original label in `finally` so a form's submit button can't be double-clicked into firing the
// same request twice (mirrors what login.js already does for the sign-in button, generalized
// here since every modal form in this page needs the same guard).
async function withBusy(button, busyLabel, fn) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  try {
    await fn();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

const storedSession = getSession();
if (!storedSession) {
  window.location.href = '/login';
}
const session = storedSession || {};

document.getElementById('userName').textContent = session.user?.name || '—';
document.getElementById('userRole').textContent = session.user?.role || '—';
document.getElementById('settingsName').textContent = session.user?.name || '—';
document.getElementById('settingsEmail').textContent = session.user?.email || '—';
document.getElementById('settingsRole').textContent = session.user?.role || '—';

// Confirm the token is still valid; if not, bounce to login.
fetch('/api/me', { headers: { Authorization: `Bearer ${session.token}` } })
  .then(res => { if (!res.ok) throw new Error(); })
  .catch(() => {
    clearSession();
    window.location.href = '/login';
  });

function switchToPanel(panelName) {
  document.querySelectorAll('[data-panel]').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  settingsBtn.classList.remove('active');
  const tab = document.querySelector(`[data-panel="${panelName}"]`);
  if (tab) tab.classList.add('active');
  document.getElementById(`panel-${panelName}`).classList.add('active');
}
document.querySelectorAll('[data-panel]').forEach(tab => {
  tab.addEventListener('click', () => switchToPanel(tab.dataset.panel));
});

const settingsBtn = document.getElementById('settingsBtn');
settingsBtn.addEventListener('click', async () => {
  document.querySelectorAll('[data-panel]').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-settings').classList.add('active');
  settingsBtn.classList.add('active');
  if (isManager) {
    if (!managerDepartments.length) await loadDepartments();
    renderDepartmentsSettings();
    if (!managerAllEmployees.length) await loadEmployees();
    renderTeamSettings();
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  window.location.href = '/login';
});

const api = createApiClient(() => session.token);

const mondayOf = (d) => { const copy = new Date(`${d}T12:00:00`); copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7)); return copy; };
const isoDate = (d) => d.toISOString().slice(0, 10);
let currentWeek = mondayOf(isoDate(new Date()));
let currentMonth = new Date(); currentMonth.setDate(1);
let focusDay = isoDate(new Date());
let viewMode = 'week'; // 'month' | 'week' | 'day'
// managerEmployees stays "active roster only" everywhere it's already used (calendar grid,
// shift-assignee dropdown, Employee Card modal); managerAllEmployees additionally carries
// inactive employees, needed only by the Team settings roster so a manager can reactivate them.
let managerEmployees = [], managerAllEmployees = [], managerShifts = [], managerDepartments = [], managerTemplates = [];
let monthShifts = []; // flattened shifts across the visible 6-week month grid
const collapsedGroups = new Set();
let selectedShift = null, focusedCell = null, shiftClipboard = null;
function selectShift(shift) {
  document.querySelectorAll('.week-chip.selected, .shift-block.selected').forEach(el => el.classList.remove('selected'));
  selectedShift = shift || null;
  if (selectedShift) { const el = document.querySelector(`[data-shift-id="${selectedShift.id}"]`); if (el) el.classList.add('selected'); }
}
function focusCell(cell) {
  document.querySelectorAll('.week-cell.focused').forEach(el => el.classList.remove('focused'));
  cell.classList.add('focused');
  focusedCell = { element: cell, employeeId: cell.dataset.empId, date: cell.dataset.date, isOpen: cell.dataset.open === '1' };
}
function moveFocus(key) {
  const cells = Array.from(document.querySelectorAll('#weekView .week-cell'));
  if (!cells.length) return;
  let idx = focusedCell ? cells.indexOf(focusedCell.element) : -1;
  if (idx === -1) idx = 0;
  if (key === 'ArrowRight') idx = Math.min(idx + 1, cells.length - 1);
  else if (key === 'ArrowLeft') idx = Math.max(idx - 1, 0);
  else if (key === 'ArrowDown') idx = Math.min(idx + 7, cells.length - 1);
  else if (key === 'ArrowUp') idx = Math.max(idx - 7, 0);
  focusCell(cells[idx]);
}
// Keyboard shortcuts operate on the Week grid only -- Day view is a continuous hour timeline
// (not a discrete cell grid), so click-to-quick-add/click-to-delete is its whole interaction
// model rather than a select+arrow-keys one.
document.addEventListener('keydown', async (e) => {
  const managerPanel = document.getElementById('managerSchedule');
  if (!managerPanel || managerPanel.classList.contains('hidden') || viewMode !== 'week') return;
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault(); moveFocus(e.key);
  } else if ((e.key === 'c' || e.key === 'C') && selectedShift) {
    shiftClipboard = { departmentId: selectedShift.departmentId, employeeId: selectedShift.employeeId, startTime: selectedShift.startTime, endTime: selectedShift.endTime };
    toast('Shift copied.', '');
  } else if ((e.key === 'v' || e.key === 'V') && shiftClipboard && focusedCell) {
    e.preventDefault();
    try { await api('/api/scheduling/shifts', {method:'POST', body:JSON.stringify({departmentId:shiftClipboard.departmentId, employeeId:focusedCell.employeeId ? Number(focusedCell.employeeId) : null, date:focusedCell.date, startTime:shiftClipboard.startTime, endTime:shiftClipboard.endTime})}); toast('Shift pasted.', 'success'); await loadWeek(); } catch (error) { toast(error.message, 'error'); }
  } else if ((e.key === 'Backspace' || e.key === 'Delete') && selectedShift) {
    e.preventDefault();
    const shiftId = selectedShift.id;
    if (selectedShift.employeeId && !(await confirmDialog(`Delete this assigned shift (${selectedShift.startTime}–${selectedShift.endTime})? This can't be undone.`, { danger: true, confirmLabel: 'Delete shift' }))) return;
    try { await api(`/api/scheduling/shifts/${shiftId}`, {method:'DELETE'}); selectShift(null); toast('Shift deleted.', 'success'); await loadWeek(); } catch (error) { toast(error.message, 'error'); }
  }
});
const timeToMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const shiftHours = (shift) => { let start = timeToMinutes(shift.startTime), end = timeToMinutes(shift.endTime); if (end <= start) end += 24 * 60; return (end - start) / 60; };
const dayNameOf = (dateStr) => new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
const dayHasAvailability = (employee, dateStr) => { const slots = (employee.weeklyAvailability || {})[dayNameOf(dateStr)]; return Array.isArray(slots) && slots.length > 0; };
const shiftWithinAvailability = (employee, shift) => {
  const slots = (employee.weeklyAvailability || {})[dayNameOf(shift.date)] || [];
  const start = timeToMinutes(shift.startTime); let end = timeToMinutes(shift.endTime); if (end <= start) end += 24 * 60;
  return slots.some(slot => { const slotStart = timeToMinutes(slot.start); let slotEnd = timeToMinutes(slot.end); if (slotEnd <= slotStart) slotEnd += 24 * 60; return slotStart <= start && slotEnd >= end; });
};
function shiftWarning(shift) {
  if (!shift.employeeId) return null;
  const employee = managerEmployees.find(e => e.id === shift.employeeId);
  if (!employee) return null;
  if (!shiftWithinAvailability(employee, shift)) return 'Outside this employee’s declared availability';
  const weeklyHours = managerShifts.filter(s => s.employeeId === shift.employeeId).reduce((sum, s) => sum + shiftHours(s), 0);
  if (weeklyHours > 40 + 1e-9) return `Employee is over 40h this week (${weeklyHours.toFixed(1)}h)`;
  return null;
}
async function loadDepartments() {
  managerDepartments = await api('/api/scheduling/departments');
  const options = '<option value="">All departments</option>' + managerDepartments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  const toolSelect = document.getElementById('toolDepartment');
  if (toolSelect) { const previous = toolSelect.value; toolSelect.innerHTML = options; toolSelect.value = managerDepartments.some(d => String(d.id) === previous) ? previous : ''; }
}
async function loadEmployees(departmentId) {
  managerAllEmployees = await api(`/api/scheduling/employees${departmentId ? `?departmentId=${departmentId}` : ''}`);
  managerEmployees = managerAllEmployees.filter(e => e.active);
}
async function loadTemplates() {
  managerTemplates = await api('/api/scheduling/templates');
  document.getElementById('templateSelect').innerHTML = '<option value="">Apply template…</option>' + managerTemplates.map(t => `<option value="${t.id}">${t.name} (${t.shiftCount})</option>`).join('');
}
function renderDepartmentsSettings() {
  document.getElementById('departmentsList').innerHTML = managerDepartments.length ? managerDepartments.map(d => `<div class="dept-row"><input type="text" value="${d.name}" data-dept-id="${d.id}" /><span class="role-badge">${d.roleCategory.toUpperCase()}</span><button type="button" class="button secondary" data-save-dept="${d.id}">Save</button><button type="button" class="button danger" data-delete-dept="${d.id}">Delete</button></div>`).join('') : '<span class="empty-state">No departments yet.</span>';
  document.querySelectorAll('[data-save-dept]').forEach(button => button.addEventListener('click', async () => {
    const input = document.querySelector(`input[data-dept-id="${button.dataset.saveDept}"]`);
    try { await api(`/api/scheduling/departments/${button.dataset.saveDept}`, {method:'PATCH', body:JSON.stringify({name:input.value})}); await loadDepartments(); renderDepartmentsSettings(); toast('Department renamed.', 'success'); await loadSchedule(); } catch (error) { toast(error.message, 'error'); }
  }));
  document.querySelectorAll('[data-delete-dept]').forEach(button => button.addEventListener('click', async () => {
    const departmentId = Number(button.dataset.deleteDept);
    const department = managerDepartments.find(d => d.id === departmentId);
    const employeeCount = managerEmployees.filter(e => e.departmentId === departmentId).length;
    const message = `Delete "${department.name}"? ${employeeCount ? `${employeeCount} employee${employeeCount === 1 ? '' : 's'} in it will become unassigned, and any` : 'Any'} staffing requirements for it will be deleted too. This can't be undone.`;
    if (!(await confirmDialog(message, { danger: true, confirmLabel: 'Delete department' }))) return;
    try { await api(`/api/scheduling/departments/${departmentId}`, {method:'DELETE'}); await loadDepartments(); renderDepartmentsSettings(); toast('Department deleted.', 'success'); await loadSchedule(); } catch (error) { toast(error.message, 'error'); }
  }));
}
function renderTeamSettings() {
  document.getElementById('newEmpDepartment').innerHTML = '<option value="">No department</option>' + managerDepartments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  document.getElementById('teamList').innerHTML = managerAllEmployees.length
    ? managerAllEmployees.map(e => `<div class="dept-row team-row${e.active ? '' : ' inactive'}"><span class="team-name">${e.name}</span><span class="role-badge">${e.role.toUpperCase()}</span><span class="team-dept">${e.departmentName || 'Unassigned'}</span><button type="button" class="button ${e.active ? 'danger' : 'secondary'}" data-toggle-employee="${e.id}">${e.active ? 'Deactivate' : 'Reactivate'}</button></div>`).join('')
    : '<span class="empty-state">No team members yet.</span>';
  document.querySelectorAll('[data-toggle-employee]').forEach(button => button.addEventListener('click', async () => {
    const employeeId = Number(button.dataset.toggleEmployee);
    const employee = managerAllEmployees.find(e => e.id === employeeId);
    if (employee.active) {
      const message = `Deactivate ${employee.name}? They will no longer be able to log in or be assigned new shifts. Past shifts and history stay intact, and you can reactivate them later.`;
      if (!(await confirmDialog(message, { danger: true, confirmLabel: 'Deactivate' }))) return;
    }
    try {
      await api(`/api/scheduling/employees/${employeeId}`, {method:'PATCH', body:JSON.stringify({
        departmentId: employee.departmentId, maxHoursPerWeek: employee.maxHoursPerWeek, minHoursPerWeek: employee.minHoursPerWeek,
        preferredHoursPerWeek: employee.preferredHoursPerWeek, schedulingConfidence: employee.schedulingConfidence,
        schedulingNotes: employee.schedulingNotes, autoScheduleOptOut: employee.autoScheduleOptOut, active: !employee.active,
      })});
      const wasActive = employee.active;
      await loadEmployees(); renderTeamSettings(); await loadSchedule();
      toast(`${employee.name} ${wasActive ? 'deactivated' : 'reactivated'}.`, 'success');
    } catch (error) { toast(error.message, 'error'); }
  }));
}
document.getElementById('addEmpBtn').addEventListener('click', async () => {
  const nameInput = document.getElementById('newEmpName');
  const emailInput = document.getElementById('newEmpEmail');
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  if (!name || !email) return;
  try {
    const departmentValue = document.getElementById('newEmpDepartment').value;
    // No separate role picker -- a department already implies its role category (FOH/BOH);
    // with no department selected there's nothing to derive from, so default to FOH.
    const department = departmentValue ? managerDepartments.find(d => d.id === Number(departmentValue)) : null;
    await api('/api/scheduling/employees', {method:'POST', body:JSON.stringify({
      name, email, roleCategory: department ? department.roleCategory : 'foh',
      departmentId: departmentValue ? Number(departmentValue) : null,
    })});
    nameInput.value = ''; emailInput.value = '';
    await loadEmployees(); renderTeamSettings();
    toast('Employee added. They can set a password at their first login.', 'success');
  } catch (error) { toast(error.message, 'error'); }
});
const closeModal = id => document.getElementById(id).classList.add('hidden');
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.close)));
// Clicking the dimmed backdrop itself (not the modal card) closes it -- every static modal
// gets this for free rather than only some of them.
document.querySelectorAll('.modal-backdrop[id]').forEach(backdrop => {
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.add('hidden'); });
});
// Escape closes whatever's on top: a dynamic confirm/prompt dialog (dialog.js) first since those
// float above everything else, then a static modal.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const dynamicDialog = document.querySelector('.modal-backdrop:not([id])');
  if (dynamicDialog) { dynamicDialog.querySelector('[data-role="cancel"]')?.click(); return; }
  const openModal = document.querySelector('.modal-backdrop[id]:not(.hidden)');
  if (openModal) { closeModal(openModal.id); return; }
});

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
async function ensureDepartments() { if (!managerDepartments.length) await loadDepartments(); }
function weekGroups() {
  const groups = managerDepartments.map(d => ({ department: d, employees: managerEmployees.filter(e => e.departmentId === d.id) })).filter(g => g.employees.length);
  const unassigned = managerEmployees.filter(e => !e.departmentId);
  if (unassigned.length) groups.push({ department: { id: 'none', name: 'No department' }, employees: unassigned });
  return groups;
}
function closeAnyPopover() { document.querySelectorAll('.quick-pop').forEach(p => p.remove()); }

function renderScheduleView() {
  document.getElementById('monthView').classList.toggle('hidden', viewMode !== 'month');
  document.getElementById('weekView').classList.toggle('hidden', viewMode !== 'week');
  document.getElementById('dayView').classList.toggle('hidden', viewMode !== 'day');
}
function renderPublishState() {
  const show = viewMode !== 'month';
  const draftCount = show ? managerShifts.filter(s => s.isDraft).length : 0;
  document.getElementById('btnPublish').classList.toggle('hidden', !show || draftCount === 0);
  document.getElementById('publishCount').textContent = draftCount;
}
async function loadSchedule() {
  if (viewMode === 'month') await loadMonth();
  else if (viewMode === 'week') await loadWeek();
  else await loadDay();
}
function setViewMode(mode) {
  viewMode = mode;
  document.querySelectorAll('.view-switch button').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
  loadSchedule().catch(e => toast(e.message, 'error'));
}
function nav(dir) {
  if (viewMode === 'month') { currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + dir, 1); }
  else if (viewMode === 'week') { currentWeek.setDate(currentWeek.getDate() + dir * 7); }
  else { const d = new Date(`${focusDay}T12:00:00`); d.setDate(d.getDate() + dir); focusDay = isoDate(d); }
  loadSchedule().catch(e => toast(e.message, 'error'));
}
function goToday() {
  const today = new Date();
  currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  currentWeek = mondayOf(isoDate(today));
  focusDay = isoDate(today);
  loadSchedule().catch(e => toast(e.message, 'error'));
}

async function loadMonth() {
  document.getElementById('monthView').innerHTML = '<div class="loading-state">Loading schedule…</div>';
  renderScheduleView();
  const first = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const gridStart = mondayOf(isoDate(first));
  const mondays = new Set();
  for (let i = 0; i < 42; i += 7) { const d = new Date(gridStart); d.setDate(d.getDate() + i); mondays.add(isoDate(d)); }
  const weeks = await Promise.all(Array.from(mondays).map(m => api(`/api/scheduling/shifts?weekStart=${m}`)));
  monthShifts = weeks.flat();
  document.getElementById('scheduleSub').textContent = `A month-level snapshot — click any day to see who's on.`;
  document.getElementById('navTitle').textContent = `${currentMonth.toLocaleDateString(undefined, { month: 'long' })} ${currentMonth.getFullYear()}`;
  renderMonth(gridStart);
  renderPublishState();
}
function renderMonth(gridStart) {
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(d.getDate() + i); return d; });
  const todayIso = isoDate(new Date());
  const el = document.getElementById('monthView');
  el.innerHTML = `<div class="month-grid">${WEEKDAY_SHORT.map(w => `<div class="month-weekday">${w}</div>`).join('')}
    ${cells.map(d => {
      const iso = isoDate(d);
      const inMonth = d.getMonth() === currentMonth.getMonth();
      const shifts = monthShifts.filter(s => s.date === iso);
      const openCount = shifts.filter(s => !s.employeeId).length;
      const status = !shifts.length ? 'empty' : openCount ? 'partial' : 'full';
      return `<div class="month-cell ${inMonth ? '' : 'other-month'} ${iso === todayIso ? 'today' : ''}" data-date="${iso}">
          <div class="month-date">${d.getDate()}</div>
          <div class="month-summary">${shifts.length ? `<span class="month-chip status-${status}"><span class="dot"></span>${shifts.length} shift${shifts.length === 1 ? '' : 's'}${openCount ? ` · ${openCount} open` : ''}</span>` : `<span class="month-chip status-empty"><span class="dot"></span>Not scheduled</span>`}</div>
        </div>`;
    }).join('')}
  </div>`;
  el.querySelectorAll('.month-cell').forEach(cell => cell.addEventListener('click', () => {
    focusDay = cell.dataset.date;
    setViewMode('day');
  }));
}

async function loadWeek() {
  document.getElementById('weekView').innerHTML = '<div class="loading-state">Loading schedule…</div>';
  renderScheduleView();
  await ensureDepartments();
  const week = isoDate(currentWeek);
  [, managerShifts] = await Promise.all([
    loadEmployees(),
    api(`/api/scheduling/shifts?weekStart=${week}`),
  ]);
  renderWeek();
  renderPublishState();
  await loadQueue();
}
function renderWeek() {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(currentWeek); d.setDate(d.getDate() + i); return d; });
  const todayIso = isoDate(new Date());
  document.getElementById('navTitle').textContent = `Week of ${currentWeek.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${days[6].getDate()}`;
  const totalOpen = managerShifts.filter(s => !s.employeeId).length;
  document.getElementById('scheduleSub').textContent = `${managerShifts.length} shift${managerShifts.length === 1 ? '' : 's'} this week${totalOpen ? ` · ${totalOpen} still open` : ' · fully assigned'}. Click a day header to zoom in, or an empty cell to add a shift.`;

  function chipsForCell(shifts) {
    return shifts.map(s => `<div class="week-chip ${!s.employeeId ? 'open-shift' : ''}" data-shift-id="${s.id}" draggable="true">${s.startTime}–${s.endTime}</div>`).join('');
  }
  function trackHTML(shiftsGetter, empId, isOpen) {
    const employee = !isOpen && empId ? managerEmployees.find(e => e.id === empId) : null;
    return `<div class="week-track">${days.map(d => {
      const iso = isoDate(d);
      const unavailable = employee && !dayHasAvailability(employee, iso);
      return `<div class="week-cell ${iso === todayIso ? 'today-col' : ''} ${unavailable ? 'unavailable-day' : ''}" data-date="${iso}" data-emp-id="${empId ?? ''}" data-open="${isOpen ? '1' : '0'}">${chipsForCell(shiftsGetter(iso))}</div>`;
    }).join('')}</div>`;
  }

  let groupsHtml = '';
  weekGroups().forEach(group => {
    const dept = group.department;
    const key = `w${dept.id}`;
    const collapsed = collapsedGroups.has(key);
    const openShifts = managerShifts.filter(s => !s.employeeId && (dept.id === 'none' ? !s.departmentId : s.departmentId === dept.id));
    groupsHtml += `<div class="dept-group-head ${collapsed ? 'collapsed' : ''}" data-group="${key}">
        <svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        ${escapeHtml(dept.name)} <span class="n">${group.employees.length} people${openShifts.length ? ` · ${openShifts.length} open` : ''}</span>
      </div>
      <div class="dept-group-body ${collapsed ? 'collapsed' : ''}" data-group-body="${key}" data-dept-id="${dept.id}">
        ${dept.id !== 'none' ? `<div class="emp-row open-row">
          <div class="emp-row-label"><span class="rl">Open shifts</span></div>
          ${trackHTML(iso => openShifts.filter(s => s.date === iso), null, true)}
        </div>` : ''}
        ${group.employees.map(emp => `<div class="emp-row">
            <div class="emp-row-label">
              <button type="button" class="nm-btn" data-employee-card="${emp.id}"><span class="confidence-dot conf-${emp.schedulingConfidence}" title="Confidence ${emp.schedulingConfidence}/5"></span> ${escapeHtml(emp.name)}${emp.autoScheduleOptOut ? ' <span class="opt-out-badge" title="Excluded from Smart Fill">off</span>' : ''}</button>
              <span class="rl">${emp.role}</span>
            </div>
            ${trackHTML(iso => managerShifts.filter(s => s.employeeId === emp.id && s.date === iso), emp.id, false)}
          </div>`).join('')}
      </div>`;
  });

  const el = document.getElementById('weekView');
  el.innerHTML = `<div class="day-shell">
      <div class="week-header-row"><div class="ruler-label-col"></div>
        ${days.map(d => `<div class="week-day-head ${isoDate(d) === todayIso ? 'today' : ''}" data-date="${isoDate(d)}"><span class="wd">${WEEKDAY_SHORT[(d.getDay() + 6) % 7]}</span><span class="dt">${d.getDate()}</span></div>`).join('')}
      </div>
      ${groupsHtml}
    </div>`;

  el.querySelectorAll('.week-day-head').forEach(head => head.addEventListener('click', () => { focusDay = head.dataset.date; setViewMode('day'); }));
  el.querySelectorAll('.dept-group-head').forEach(head => head.addEventListener('click', () => {
    const key = head.dataset.group;
    if (collapsedGroups.has(key)) collapsedGroups.delete(key); else collapsedGroups.add(key);
    renderWeek();
  }));
  el.querySelectorAll('[data-employee-card]').forEach(button => button.addEventListener('click', e => { e.stopPropagation(); try { openEmployeeCard(Number(button.dataset.employeeCard)); } catch (error) { toast(error.message, 'error'); } }));

  el.querySelectorAll('.week-chip').forEach(chip => {
    chip.addEventListener('click', e => { e.stopPropagation(); selectShift(managerShifts.find(s => s.id === Number(chip.dataset.shiftId))); openEditPopover(chip, Number(chip.dataset.shiftId)); });
    chip.addEventListener('dragstart', e => e.dataTransfer.setData('shiftId', chip.dataset.shiftId));
  });
  el.querySelectorAll('.week-cell').forEach(cell => {
    cell.addEventListener('click', e => { if (e.target.closest('.week-chip')) return; focusCell(cell); openQuickAddWeek(cell); });
    cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('drag-over'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
    cell.addEventListener('drop', async e => {
      e.preventDefault(); cell.classList.remove('drag-over');
      const shift = managerShifts.find(s => s.id === Number(e.dataTransfer.getData('shiftId')));
      if (!shift) return;
      const empId = cell.dataset.empId ? Number(cell.dataset.empId) : null;
      const sameCell = shift.employeeId === empId && shift.date === cell.dataset.date;
      if (sameCell && !e.shiftKey) return;
      try {
        if (e.shiftKey) {
          await api('/api/scheduling/shifts', {method:'POST', body:JSON.stringify({departmentId:shift.departmentId, employeeId:empId, date:cell.dataset.date, startTime:shift.startTime, endTime:shift.endTime})});
          toast('Shift duplicated.', 'success');
        } else {
          await api(`/api/scheduling/shifts/${shift.id}`, {method:'PATCH', body:JSON.stringify({employeeId:empId, date:cell.dataset.date, startTime:shift.startTime, endTime:shift.endTime})});
        }
        await loadWeek();
      } catch (error) { toast(error.message, 'error'); }
    });
  });

  if (selectedShift) { const chip = el.querySelector(`[data-shift-id="${selectedShift.id}"]`); if (chip) chip.classList.add('selected'); else selectedShift = null; }
  if (focusedCell) { const cell = el.querySelector(`.week-cell[data-emp-id="${focusedCell.employeeId}"][data-date="${focusedCell.date}"]`); if (cell) { cell.classList.add('focused'); focusedCell.element = cell; } else focusedCell = null; }
}
function openQuickAddWeek(cell) {
  closeAnyPopover();
  const empId = cell.dataset.empId;
  const isOpen = cell.dataset.open === '1';
  const label = isOpen ? 'New open shift' : `New shift — ${managerEmployees.find(e => e.id === Number(empId))?.name || ''}`;
  const pop = document.createElement('div');
  pop.className = 'quick-pop';
  pop.style.left = '0px'; pop.style.top = '30px';
  pop.innerHTML = `<div class="qp-head">${escapeHtml(label)}<br><span style="font-weight:400;color:var(--text-muted)">${cell.dataset.date}</span></div>
    <div class="qp-row">
      <label>Start<input type="time" id="qpwStart" value="09:00"></label>
      <label>End<input type="time" id="qpwEnd" value="17:00"></label>
    </div>
    <div class="qp-actions"><button type="button" class="button secondary" id="qpwCancel">Cancel</button><button class="button" type="button" id="qpwSave">Add shift</button></div>`;
  cell.appendChild(pop);
  pop.querySelector('#qpwCancel').addEventListener('click', ev => { ev.stopPropagation(); closeAnyPopover(); });
  pop.querySelector('#qpwSave').addEventListener('click', async ev => {
    ev.stopPropagation();
    const start = pop.querySelector('#qpwStart').value;
    const end = pop.querySelector('#qpwEnd').value;
    const deptId = isOpen ? Number(cell.closest('.dept-group-body').dataset.deptId) : managerEmployees.find(e => e.id === Number(empId))?.departmentId;
    if (!deptId) { toast('This employee has no department set — assign one first.', 'error'); return; }
    try {
      await api('/api/scheduling/shifts', {method:'POST', body:JSON.stringify({departmentId: deptId, employeeId: isOpen ? null : Number(empId), date: cell.dataset.date, startTime: start, endTime: end})});
      closeAnyPopover();
      toast('Shift created.', 'success');
      await loadWeek();
    } catch (error) { toast(error.message, 'error'); }
  });
  document.addEventListener('click', function outside(ev) { if (!pop.contains(ev.target) && ev.target !== cell) { closeAnyPopover(); document.removeEventListener('click', outside); } }, { capture: true });
}
function openEditPopover(el, shiftId) {
  closeAnyPopover();
  const shift = managerShifts.find(s => s.id === shiftId);
  if (!shift) return;
  const employee = shift.employeeId ? managerEmployees.find(e => e.id === shift.employeeId) : null;
  const pop = document.createElement('div');
  pop.className = 'quick-pop';
  pop.style.left = '0px'; pop.style.top = '30px';
  pop.innerHTML = `<div class="qp-head">${employee ? escapeHtml(employee.name) : 'Open shift'} · ${shift.startTime}–${shift.endTime}${shift.isDraft ? ' · draft' : ''}${shift.status === 'Pending_Swap' ? ' · swap pending' : ''}</div>
    <div class="qp-actions"><button type="button" class="qp-del" id="qpDelete">Delete shift</button><button class="button secondary" type="button" id="qpClose">Close</button></div>`;
  el.parentElement.appendChild(pop);
  pop.querySelector('#qpClose').addEventListener('click', ev => { ev.stopPropagation(); closeAnyPopover(); });
  pop.querySelector('#qpDelete').addEventListener('click', async ev => {
    ev.stopPropagation();
    if (shift.employeeId && !(await confirmDialog(`Delete this assigned shift (${shift.startTime}–${shift.endTime})? This can't be undone.`, { danger: true, confirmLabel: 'Delete shift' }))) return;
    try {
      await api(`/api/scheduling/shifts/${shiftId}`, {method:'DELETE'});
      selectShift(null);
      closeAnyPopover();
      toast('Shift deleted.', 'success');
      if (viewMode === 'day') await loadDay(); else await loadWeek();
    } catch (error) { toast(error.message, 'error'); }
  });
  document.addEventListener('click', function outside(ev) { if (!pop.contains(ev.target) && ev.target !== el) { closeAnyPopover(); document.removeEventListener('click', outside); } }, { capture: true });
}

const HOUR_START = 7, HOUR_END = 24, HOUR_W = 42;
const fmtHourLabel = (h) => { const hh = h % 24; const ap = hh >= 12 ? 'pm' : 'am'; const h12 = hh % 12 === 0 ? 12 : hh % 12; return `${h12}${ap}`; };
const parseHourDec = (t) => { const [h, m] = t.split(':').map(Number); return h + m / 60; };

async function loadDay() {
  document.getElementById('dayView').innerHTML = '<div class="loading-state">Loading schedule…</div>';
  renderScheduleView();
  await ensureDepartments();
  currentWeek = mondayOf(focusDay);
  const week = isoDate(currentWeek);
  [, managerShifts] = await Promise.all([
    loadEmployees(),
    api(`/api/scheduling/shifts?weekStart=${week}`),
  ]);
  renderDay();
  renderPublishState();
  await loadQueue();
}
function renderDay() {
  const iso = focusDay;
  const d = new Date(`${iso}T12:00:00`);
  document.getElementById('navTitle').textContent = `${WEEKDAY_SHORT[(d.getDay() + 6) % 7]}, ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  const dayShifts = managerShifts.filter(s => s.date === iso);
  const open = dayShifts.filter(s => !s.employeeId).length;
  document.getElementById('scheduleSub').textContent = `${dayShifts.length} shift${dayShifts.length === 1 ? '' : 's'} scheduled${open ? ` · ${open} still open` : ''}. Click any empty row to add one.`;

  const hours = []; for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);
  const rulerHours = hours.map(h => `<div class="ruler-hour ${h % 2 === 0 ? 'label-hour' : ''}">${h % 2 === 0 ? fmtHourLabel(h) : ''}</div>`).join('');

  function blockHTML(s) {
    const left = (parseHourDec(s.startTime) - HOUR_START) * HOUR_W;
    const endDec = (s.endTime === '24:00' || s.endTime === '00:00') ? 24 : parseHourDec(s.endTime);
    const width = Math.max((endDec - parseHourDec(s.startTime)) * HOUR_W, 30);
    const warning = shiftWarning(s);
    return `<div class="shift-block ${!s.employeeId ? 'open-shift' : ''} ${s.status === 'Pending_Swap' ? 'pending-swap' : ''} ${warning ? 'warn' : ''}" style="left:${left}px;width:${width}px" data-shift-id="${s.id}" draggable="true" ${warning ? `title="${escapeHtml(warning)}"` : ''}>${s.startTime}–${s.endTime}</div>`;
  }
  function trackHTML(shifts, empId, isOpen) {
    let nowLine = '';
    if (iso === isoDate(new Date())) {
      const now = new Date(); const nowHour = now.getHours() + now.getMinutes() / 60;
      if (nowHour >= HOUR_START && nowHour <= HOUR_END) nowLine = `<div class="now-line" style="left:${(nowHour - HOUR_START) * HOUR_W}px"></div>`;
    }
    const employee = !isOpen && empId ? managerEmployees.find(e => e.id === empId) : null;
    const unavailable = employee && !dayHasAvailability(employee, iso);
    return `<div class="emp-row-track ${unavailable ? 'unavailable-day' : ''}" data-emp-id="${empId ?? ''}" data-open="${isOpen ? '1' : '0'}" style="width:${(HOUR_END - HOUR_START) * HOUR_W}px">${shifts.map(blockHTML).join('')}${nowLine}</div>`;
  }

  let groupsHtml = '';
  weekGroups().forEach(group => {
    const dept = group.department;
    const key = `d${dept.id}`;
    const collapsed = collapsedGroups.has(key);
    const openShifts = dayShifts.filter(s => !s.employeeId && (dept.id === 'none' ? !s.departmentId : s.departmentId === dept.id));
    groupsHtml += `<div class="dept-group-head ${collapsed ? 'collapsed' : ''}" data-group="${key}">
        <svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        ${escapeHtml(dept.name)} <span class="n">${group.employees.length} people${openShifts.length ? ` · ${openShifts.length} open` : ''}</span>
      </div>
      <div class="dept-group-body ${collapsed ? 'collapsed' : ''}" data-group-body="${key}" data-dept-id="${dept.id}">
        ${dept.id !== 'none' ? `<div class="emp-row open-row">
          <div class="emp-row-label"><span class="rl">Open shifts</span></div>
          ${trackHTML(openShifts, null, true)}
        </div>` : ''}
        ${group.employees.map(emp => `<div class="emp-row">
            <div class="emp-row-label">
              <button type="button" class="nm-btn" data-employee-card="${emp.id}"><span class="confidence-dot conf-${emp.schedulingConfidence}" title="Confidence ${emp.schedulingConfidence}/5"></span> ${escapeHtml(emp.name)}${emp.autoScheduleOptOut ? ' <span class="opt-out-badge" title="Excluded from Smart Fill">off</span>' : ''}</button>
              <span class="rl">${emp.role}</span>
            </div>
            ${trackHTML(dayShifts.filter(s => s.employeeId === emp.id), emp.id, false)}
          </div>`).join('')}
      </div>`;
  });

  const el = document.getElementById('dayView');
  el.innerHTML = `<div class="back-row">
      <button class="back-link" id="backToWeek"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> Back to week</button>
      <button class="day-plan-btn" id="btnDayPlan" type="button">Plan staffing for this day</button>
    </div>
    <div class="day-shell">
      <div class="timeline-scroll"><div class="timeline-inner">
        <div class="ruler"><div class="ruler-label-col"></div><div class="ruler-hours" style="width:${(HOUR_END - HOUR_START) * HOUR_W}px">${rulerHours}</div></div>
        ${groupsHtml}
      </div></div>
    </div>`;

  document.getElementById('backToWeek').addEventListener('click', () => setViewMode('week'));
  document.getElementById('btnDayPlan').addEventListener('click', () => { openDayPlanModal(iso).catch(error => toast(error.message, 'error')); });
  el.querySelectorAll('.dept-group-head').forEach(head => head.addEventListener('click', () => {
    const key = head.dataset.group;
    if (collapsedGroups.has(key)) collapsedGroups.delete(key); else collapsedGroups.add(key);
    renderDay();
  }));
  el.querySelectorAll('[data-employee-card]').forEach(button => button.addEventListener('click', e => { e.stopPropagation(); try { openEmployeeCard(Number(button.dataset.employeeCard)); } catch (error) { toast(error.message, 'error'); } }));
  el.querySelectorAll('.shift-block').forEach(block => {
    block.addEventListener('click', e => { e.stopPropagation(); selectShift(managerShifts.find(s => s.id === Number(block.dataset.shiftId))); openEditPopover(block, Number(block.dataset.shiftId)); });
    block.addEventListener('dragstart', e => e.dataTransfer.setData('shiftId', block.dataset.shiftId));
  });
  el.querySelectorAll('.emp-row-track').forEach(track => {
    track.addEventListener('click', e => { if (e.target.closest('.shift-block')) return; openQuickAddDay(track, e); });
    track.addEventListener('dragover', e => { e.preventDefault(); track.classList.add('drag-over'); });
    track.addEventListener('dragleave', () => track.classList.remove('drag-over'));
    track.addEventListener('drop', async e => {
      e.preventDefault(); track.classList.remove('drag-over');
      const shift = managerShifts.find(s => s.id === Number(e.dataTransfer.getData('shiftId')));
      if (!shift) return;
      const empId = track.dataset.empId ? Number(track.dataset.empId) : null;
      if (shift.employeeId === empId && !e.shiftKey) return;
      try {
        if (e.shiftKey) {
          await api('/api/scheduling/shifts', {method:'POST', body:JSON.stringify({departmentId:shift.departmentId, employeeId:empId, date:shift.date, startTime:shift.startTime, endTime:shift.endTime})});
          toast('Shift duplicated.', 'success');
        } else {
          await api(`/api/scheduling/shifts/${shift.id}`, {method:'PATCH', body:JSON.stringify({employeeId:empId, date:shift.date, startTime:shift.startTime, endTime:shift.endTime})});
        }
        await loadDay();
      } catch (error) { toast(error.message, 'error'); }
    });
  });
}
function openQuickAddDay(track, e) {
  closeAnyPopover();
  const rect = track.getBoundingClientRect();
  const x = e.clientX - rect.left;
  let startHour = HOUR_START + Math.round((x / HOUR_W) * 2) / 2;
  startHour = Math.max(HOUR_START, Math.min(HOUR_END - 1, startHour));
  const endHour = Math.min(HOUR_END, startHour + 4);
  const empId = track.dataset.empId;
  const isOpen = track.dataset.open === '1';
  const label = isOpen ? 'New open shift' : `New shift — ${managerEmployees.find(e => e.id === Number(empId))?.name || ''}`;
  const toHHMM = (hourDec) => { const h = Math.floor(hourDec); const m = hourDec % 1 ? 30 : 0; return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
  const pop = document.createElement('div');
  pop.className = 'quick-pop';
  pop.style.left = `${Math.max(0, x - 20)}px`; pop.style.top = '54px';
  pop.innerHTML = `<div class="qp-head">${escapeHtml(label)}</div>
    <div class="qp-row">
      <label>Start<input type="time" id="qpStart" value="${toHHMM(startHour)}"></label>
      <label>End<input type="time" id="qpEnd" value="${toHHMM(endHour)}"></label>
    </div>
    <div class="qp-actions"><button type="button" class="button secondary" id="qpCancel">Cancel</button><button class="button" type="button" id="qpSave">Add shift</button></div>`;
  track.appendChild(pop);
  pop.querySelector('#qpCancel').addEventListener('click', ev => { ev.stopPropagation(); closeAnyPopover(); });
  pop.querySelector('#qpSave').addEventListener('click', async ev => {
    ev.stopPropagation();
    const start = pop.querySelector('#qpStart').value;
    const end = pop.querySelector('#qpEnd').value;
    const deptId = isOpen ? Number(track.closest('.dept-group-body').dataset.deptId) : managerEmployees.find(e => e.id === Number(empId))?.departmentId;
    if (!deptId) { toast('This employee has no department set — assign one first.', 'error'); return; }
    try {
      await api('/api/scheduling/shifts', {method:'POST', body:JSON.stringify({departmentId: deptId, employeeId: isOpen ? null : Number(empId), date: focusDay, startTime: start, endTime: end})});
      closeAnyPopover();
      toast('Shift created.', 'success');
      await loadDay();
    } catch (error) { toast(error.message, 'error'); }
  });
  document.addEventListener('click', function outside(ev) { if (!pop.contains(ev.target) && ev.target !== track) { closeAnyPopover(); document.removeEventListener('click', outside); } }, { capture: true });
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dayOfWeekOf = (dateStr) => (new Date(`${dateStr}T12:00:00`).getDay() + 6) % 7; // Monday=0..Sunday=6, matches the backend

let dayPlanDate = null;
async function openDayPlanModal(dateStr) {
  dayPlanDate = dateStr;
  if (!managerDepartments.length) await loadDepartments();
  const dayOfWeek = dayOfWeekOf(dateStr);
  document.getElementById('dayPlanTitle').textContent = `Day plan — ${WEEKDAY_NAMES[dayOfWeek]}, ${dateStr}`;
  document.getElementById('reqDayName').textContent = WEEKDAY_NAMES[dayOfWeek];
  document.getElementById('reqDepartment').innerHTML = managerDepartments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  resetRequirementForm();
  await renderDayPlanList();
  document.getElementById('dayPlanModal').classList.remove('hidden');
}
function resetRequirementForm() {
  const form = document.getElementById('dayPlanForm');
  delete form.dataset.editId;
  form.reset();
  document.getElementById('reqSubmitBtn').textContent = 'Add requirement';
  document.getElementById('cancelReqEdit').classList.add('hidden');
}
async function renderDayPlanList() {
  const dayOfWeek = dayOfWeekOf(dayPlanDate);
  const requirements = (await api(`/api/scheduling/requirements?weekStart=${isoDate(currentWeek)}`)).filter(r => r.dayOfWeek === dayOfWeek);
  const list = document.getElementById('dayPlanList');
  list.innerHTML = requirements.length ? requirements.map(r => {
    const filled = managerShifts.filter(s => s.requirementId === r.id && s.date === dayPlanDate && s.employeeId).length;
    const total = managerShifts.filter(s => s.requirementId === r.id && s.date === dayPlanDate).length;
    const fillRatio = total ? filled / total : 0;
    const fillClass = !total ? '' : fillRatio >= 1 ? 'full' : fillRatio > 0 ? 'partial' : 'empty';
    return `<div class="requirement-row" data-req-id="${r.id}">
      <div><strong>${r.departmentName}</strong> · ${r.startTime}–${r.endTime}<br>
        <span class="req-meta">need ${r.countRequired}${r.minConfidence ? ` · confidence ${r.minConfidence}+` : ''}${r.notes ? ` · ${r.notes}` : ''} · ${r.isOverride ? 'this week only' : `every ${WEEKDAY_NAMES[r.dayOfWeek]}`}</span>
      </div>
      <div class="req-row-actions">
        ${total ? `<span class="coverage-pill ${fillClass}">${filled}/${total} filled</span>` : ''}
        <button type="button" class="button secondary" data-edit-req="${r.id}">Edit</button>
        <button type="button" class="button danger" data-delete-req="${r.id}">Delete</button>
      </div>
    </div>`;
  }).join('') : '<span class="empty-state">No staffing requirements defined for this day yet.</span>';
  list.querySelectorAll('[data-edit-req]').forEach(button => button.addEventListener('click', () => {
    const r = requirements.find(req => req.id === Number(button.dataset.editReq));
    const form = document.getElementById('dayPlanForm');
    form.dataset.editId = r.id;
    document.getElementById('reqDepartment').value = r.departmentId;
    document.getElementById('reqStart').value = r.startTime;
    document.getElementById('reqEnd').value = r.endTime;
    document.getElementById('reqCount').value = r.countRequired;
    document.getElementById('reqMinConfidence').value = r.minConfidence || '';
    document.getElementById('reqNotes').value = r.notes || '';
    form.querySelector(`input[name="reqScope"][value="${r.isOverride ? 'week' : 'recurring'}"]`).checked = true;
    document.getElementById('reqSubmitBtn').textContent = 'Update requirement';
    document.getElementById('cancelReqEdit').classList.remove('hidden');
  }));
  list.querySelectorAll('[data-delete-req]').forEach(button => button.addEventListener('click', async () => {
    try { await api(`/api/scheduling/requirements/${button.dataset.deleteReq}`, {method:'DELETE'}); resetRequirementForm(); await renderDayPlanList(); toast('Requirement deleted.', 'success'); } catch (error) { toast(error.message, 'error'); }
  }));
}

function openEmployeeCard(employeeId) {
  const employee = managerEmployees.find(e => e.id === employeeId);
  if (!employee) return;
  document.getElementById('employeeCardName').textContent = employee.name;
  document.getElementById('employeeCardMeta').textContent = `${employee.role.toUpperCase()} · ${employee.departmentName || 'No department'}`;
  document.getElementById('empConfidence').value = employee.schedulingConfidence;
  document.getElementById('confidenceValueLabel').textContent = employee.schedulingConfidence;
  document.getElementById('empMaxHours').value = employee.maxHoursPerWeek;
  document.getElementById('empMinHours').value = employee.minHoursPerWeek;
  document.getElementById('empPreferredHours').value = employee.preferredHoursPerWeek ?? '';
  document.getElementById('empOptOut').checked = employee.autoScheduleOptOut;
  document.getElementById('empNotes').value = employee.schedulingNotes || '';
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const availability = employee.weeklyAvailability || {};
  document.getElementById('empAvailabilitySummary').innerHTML = days.map(day => {
    const slots = availability[day];
    return `<div class="availability-summary-row"><span>${day}</span><span>${slots && slots.length ? slots.map(s => `${s.start}–${s.end}`).join(', ') : 'Unavailable'}</span></div>`;
  }).join('');
  document.getElementById('employeeCardForm').dataset.employeeId = employeeId;
  document.getElementById('employeeCardModal').classList.remove('hidden');
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const initials = (name) => String(name).trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const readReceiptsCache = new Map();
function fetchReads(id) {
  if (!readReceiptsCache.has(id)) {
    readReceiptsCache.set(id, api(`/api/announcements/${id}/reads`).catch(error => { readReceiptsCache.delete(id); throw error; }));
  }
  return readReceiptsCache.get(id);
}

function statTile(n, label, cls) {
  return `<div class="stat"><span class="n ${cls || ''}">${n}</span><span class="lbl">${label}</span></div>`;
}
function renderAnnouncementStats(announcements) {
  const strip = document.getElementById('announcementStats');
  const sub = document.getElementById('announcementsSub');
  if (isManager) {
    const withRecipients = announcements.filter(a => a.totalRecipients > 0);
    const avg = withRecipients.length
      ? Math.round(100 * withRecipients.reduce((sum, a) => sum + a.readCount / a.totalRecipients, 0) / withRecipients.length)
      : 100;
    const pinned = announcements.filter(a => a.pinned).length;
    strip.innerHTML = statTile(announcements.length, 'Posted') + statTile(avg + '%', 'Avg. read rate', 'good') + statTile(pinned, 'Pinned');
    sub.textContent = 'Posted by you and visible to the whole team.';
  } else {
    const needed = announcements.filter(a => !a.readByMe).length;
    strip.innerHTML = statTile(announcements.length, 'Total posts') + statTile(needed, 'Awaiting you', needed ? 'accent' : 'good');
    sub.textContent = needed
      ? `${needed} post${needed === 1 ? '' : 's'} need${needed === 1 ? 's' : ''} your acknowledgment.`
      : "You're all caught up.";
  }
}

const PIN_ICON = '<span class="pin" title="Pinned to top"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3l5 5-4 2-1 1v6l-2 2-2-4-5-1-1-2 5-5 1-4z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg></span>';

function announcementCardHTML(a, { compact = false, unread = false } = {}) {
  let footRight;
  if (isManager) {
    const total = a.totalRecipients || 0;
    const read = a.readCount || 0;
    const pct = total ? Math.round(100 * read / total) : 100;
    const full = total > 0 && read === total;
    footRight = `<div class="manager-actions">
        <button type="button" class="read-chip" data-reads="${a.id}">
          <div class="read-track"><div class="read-fill ${full ? 'full' : ''}" style="width:${pct}%"></div></div>
          <span class="read-text">${read}/${total}</span>
          <div class="read-tooltip">
            <div class="tt-head">Read by ${read} of ${total}</div>
            <div class="tt-body" data-tt-body="${a.id}">Hover to see who's read this.</div>
          </div>
        </button>
        <button type="button" class="del-btn" data-delete-announcement="${a.id}">Delete</button>
      </div>`;
  } else {
    footRight = a.readByMe
      ? `<span class="read-indicator">✓ Read ${shortDate(a.readAt)}</span>`
      : `<button type="button" class="ack-btn" data-ack="${a.id}">Acknowledge</button>`;
  }
  return `<div class="card ${unread ? 'unread' : ''} ${compact ? 'compact' : ''}">
      <div class="card-title-row">${a.pinned ? PIN_ICON : ''}${unread ? '<span class="pulse"></span>' : ''}<h3>${escapeHtml(a.title)}</h3></div>
      <p class="announcement-body">${escapeHtml(a.body)}</p>
      <div class="card-foot">
        <div class="byline"><span class="avatar">${initials(a.authorName)}</span>${escapeHtml(a.authorName)} · ${shortDate(a.createdAt)}</div>
        ${footRight}
      </div>
    </div>`;
}

async function loadAnnouncements() {
  readReceiptsCache.clear();
  const listId = isManager ? 'managerAnnouncementList' : 'attnList';
  document.getElementById(listId).innerHTML = '<div class="loading-state">Loading announcements…</div>';
  const announcements = await api('/api/announcements');
  renderAnnouncementStats(announcements);
  if (isManager) renderManagerAnnouncements(announcements); else renderEmployeeAnnouncements(announcements);
}
function renderManagerAnnouncements(announcements) {
  const list = document.getElementById('managerAnnouncementList');
  list.innerHTML = announcements.length
    ? announcements.map(a => announcementCardHTML(a)).join('')
    : '<span class="empty-state">No announcements posted yet.</span>';
  list.querySelectorAll('[data-delete-announcement]').forEach(button => button.addEventListener('click', async () => {
    if (!(await confirmDialog('Delete this announcement? This removes it for everyone.', { danger: true, confirmLabel: 'Delete' }))) return;
    try { await api(`/api/announcements/${button.dataset.deleteAnnouncement}`, {method:'DELETE'}); toast('Announcement deleted.', 'success'); await loadAnnouncements(); } catch (error) { toast(error.message, 'error'); }
  }));
  list.querySelectorAll('[data-reads]').forEach(chip => {
    const id = Number(chip.dataset.reads);
    const body = chip.querySelector('[data-tt-body]');
    let loaded = false;
    const load = async () => {
      if (loaded) return;
      try {
        const reads = await fetchReads(id);
        loaded = true;
        body.innerHTML = reads.length
          ? `<ul>${reads.map(r => r.read
              ? `<li class="read"><span class="mark">✓</span>${escapeHtml(r.name)}</li>`
              : `<li class="pending"><span class="mark">·</span>${escapeHtml(r.name)}</li>`).join('')}</ul>`
          : 'No other team members yet.';
      } catch (error) {
        body.textContent = "Couldn't load — try again.";
      }
    };
    chip.addEventListener('mouseenter', load);
    chip.addEventListener('focus', load);
    chip.addEventListener('click', () => { chip.classList.toggle('open'); load(); });
  });
}
function renderEmployeeAnnouncements(announcements) {
  const needAck = announcements.filter(a => !a.readByMe);
  const earlier = announcements.filter(a => a.readByMe);
  document.getElementById('attnLabel').style.display = needAck.length ? 'flex' : 'none';
  document.getElementById('attnCount').textContent = needAck.length;
  document.getElementById('attnList').innerHTML = needAck.length
    ? needAck.map(a => announcementCardHTML(a, { unread: true })).join('')
    : '';
  document.getElementById('earlierCount').textContent = earlier.length;
  document.getElementById('earlierList').innerHTML = earlier.length
    ? earlier.map(a => announcementCardHTML(a, { compact: true })).join('')
    : '<span class="empty-state">No announcements yet.</span>';
  document.querySelectorAll('[data-ack]').forEach(button => button.addEventListener('click', async () => {
    try { await api(`/api/announcements/${button.dataset.ack}/read`, {method:'POST'}); toast('Acknowledged.', 'success'); await loadAnnouncements(); } catch (error) { toast(error.message, 'error'); }
  }));
}

function ragSourceChipHTML(c) {
  return `<span class="source-chip" tabindex="0">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
      ${escapeHtml(c.documentTitle)}
      <div class="source-tooltip">
        <div class="tt-head">Cited passage</div>
        <div class="tt-quote">"${escapeHtml(c.citedText)}"</div>
        <button type="button" class="tt-view-doc" data-view-doc-title="${escapeHtml(c.documentTitle)}">View document →</button>
      </div>
    </span>`;
}
const RAG_PROMPTS = [
  "What's the opening and closing checklist?",
  "How do I handle a cash drawer discrepancy?",
  "Is there a recipe I can look up?",
  "What should I know for my first shift?",
];
let ragThread = [];
function renderRagThread() {
  const el = document.getElementById('chatThread');
  if (!ragThread.length) {
    el.innerHTML = `<div class="chat-empty">
        <div class="glyph"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
        <h2>Ask about anything in your knowledge base</h2>
        <p>Recipes, SOPs, training material, licenses — whatever your manager has added. Every answer cites exactly where it came from.</p>
        <div class="prompt-chips">${RAG_PROMPTS.map(p => `<button type="button" class="prompt-chip" data-prompt="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join('')}</div>
      </div>`;
    el.querySelectorAll('[data-prompt]').forEach(btn => btn.addEventListener('click', () => askRag(btn.dataset.prompt)));
    return;
  }
  el.innerHTML = ragThread.map(m => {
    const q = `<div class="msg-row q"><div class="msg q">${escapeHtml(m.question)}</div></div>`;
    let a;
    if (m.pending) {
      a = `<div class="msg-row a"><div class="msg a"><div class="typing"><span></span><span></span><span></span></div></div></div>`;
    } else if (m.error) {
      a = `<div class="msg-row a"><div class="msg a error"><p>${escapeHtml(m.error)}</p></div></div>`;
    } else {
      const sources = m.citations && m.citations.length ? `<div class="sources-row">${m.citations.map(ragSourceChipHTML).join('')}</div>` : '';
      a = `<div class="msg-row a"><div class="msg a"><p>${escapeHtml(m.answer)}</p>${sources}</div></div>`;
    }
    return q + a;
  }).join('');
  el.scrollTop = el.scrollHeight;
}
async function askRag(question) {
  question = (question || '').trim();
  if (!question) return;
  document.getElementById('ragQuestion').value = '';
  ragThread.push({ question, pending: true });
  renderRagThread();
  const sendBtn = document.querySelector('#ragAskForm button[type="submit"]');
  sendBtn.disabled = true;
  const entry = ragThread[ragThread.length - 1];
  try {
    const result = await api('/api/rag/query', {method:'POST', body:JSON.stringify({question})});
    entry.pending = false;
    entry.answer = result.answer;
    entry.citations = result.citations || [];
  } catch (error) {
    entry.pending = false;
    entry.error = error.message;
  }
  sendBtn.disabled = false;
  renderRagThread();
}

let ragDocuments = [];
async function loadRagDocuments() {
  document.getElementById('ragDocumentList').innerHTML = '<div class="loading-state">Loading documents…</div>';
  ragDocuments = await api('/api/rag/documents');
  document.getElementById('ragDocCount').textContent = ragDocuments.length;
  document.getElementById('ragDrawerFoot').classList.toggle('hidden', !isManager);
  renderRagDocuments();
}
function renderRagDocuments() {
  const list = document.getElementById('ragDocumentList');
  list.innerHTML = ragDocuments.length ? ragDocuments.map(d => `<div class="rag-doc-card" data-doc-id="${d.id}">
      <div class="rag-doc-top"><h3>${escapeHtml(d.title)}</h3><span class="rag-doc-type">${d.docType}</span></div>
      <div class="rag-doc-meta">${escapeHtml(d.uploadedByName)} · updated ${shortDate(d.updatedAt)}</div>
      <div class="rag-doc-actions">
        <a href="/api/rag/documents/${d.id}/file" class="button secondary" data-download-doc="${d.id}" title="Download ${escapeHtml(d.originalFilename)}">Download</a>
        ${isManager ? `<button type="button" class="button secondary" data-edit-doc="${d.id}">Edit</button><button type="button" class="button danger" data-delete-doc="${d.id}">Delete</button>` : ''}
      </div>
    </div>`).join('') : '<div class="empty-state">No documents yet — add a recipe, SOP, training doc, or license to get started.</div>';
  // A plain <a href> can't carry the Authorization bearer header, so intercept the click and
  // fetch through the authenticated api client instead, then hand the browser a blob URL.
  list.querySelectorAll('[data-download-doc]').forEach(link => link.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(link.getAttribute('href'), { headers: { Authorization: `Bearer ${session.token}` } });
      if (!response.ok) throw new Error('Download failed.');
      const blob = await response.blob();
      const doc = ragDocuments.find(d => d.id === Number(link.dataset.downloadDoc));
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc?.originalFilename || 'document';
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (error) { toast(error.message, 'error'); }
  }));
  list.querySelectorAll('[data-edit-doc]').forEach(button => button.addEventListener('click', () => {
    openRagDocumentModal(Number(button.dataset.editDoc)).catch(error => toast(error.message, 'error'));
  }));
  list.querySelectorAll('[data-delete-doc]').forEach(button => button.addEventListener('click', async () => {
    if (!(await confirmDialog('Delete this document? Employees will no longer be able to ask about it.', { danger: true, confirmLabel: 'Delete document' }))) return;
    try { await api(`/api/rag/documents/${button.dataset.deleteDoc}`, {method:'DELETE'}); toast('Document deleted.', 'success'); await loadRagDocuments(); } catch (error) { toast(error.message, 'error'); }
  }));
}
function openRagDrawer() { document.getElementById('ragDrawer').classList.add('open'); document.getElementById('ragDrawerVeil').classList.add('open'); }
function closeRagDrawer() { document.getElementById('ragDrawer').classList.remove('open'); document.getElementById('ragDrawerVeil').classList.remove('open'); }
function viewRagDoc(title) {
  const doc = ragDocuments.find(d => d.title === title);
  openRagDrawer();
  if (!doc) return;
  requestAnimationFrame(() => {
    const card = document.querySelector(`.rag-doc-card[data-doc-id="${doc.id}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 1400);
  });
}
document.getElementById('btnManageDocs').addEventListener('click', openRagDrawer);
document.getElementById('ragDrawerClose').addEventListener('click', closeRagDrawer);
document.getElementById('ragDrawerVeil').addEventListener('click', closeRagDrawer);
document.getElementById('chatThread').addEventListener('click', (e) => {
  const viewBtn = e.target.closest('[data-view-doc-title]');
  if (viewBtn) viewRagDoc(viewBtn.dataset.viewDocTitle);
});
function setRagSourceMode(mode) {
  document.getElementById('ragDocFileField').classList.toggle('hidden', mode !== 'file');
  document.getElementById('ragDocTextField').classList.toggle('hidden', mode !== 'text');
  document.querySelector(`input[name="ragSource"][value="${mode}"]`).checked = true;
}
document.querySelectorAll('input[name="ragSource"]').forEach(radio => radio.addEventListener('change', () => setRagSourceMode(radio.value)));

async function openRagDocumentModal(documentId) {
  const form = document.getElementById('ragDocumentForm');
  form.reset();
  const currentFileLabel = document.getElementById('ragDocCurrentFile');
  if (documentId) {
    const doc = await api(`/api/rag/documents/${documentId}`);
    form.dataset.editId = documentId;
    document.getElementById('ragDocumentModalTitle').textContent = 'Edit document';
    document.getElementById('ragDocTitle').value = doc.title;
    document.getElementById('ragDocType').value = doc.docType;
    if (doc.fileType === 'txt') {
      setRagSourceMode('text');
      document.getElementById('ragDocContentText').value = doc.content;
      currentFileLabel.textContent = 'Currently saved as pasted text. Edit it above, or switch to "Upload a file" to replace it with a PDF/Word file instead.';
    } else {
      setRagSourceMode('file');
      currentFileLabel.textContent = `Current file: ${doc.originalFilename}. Choose a new file only if you want to replace it.`;
    }
  } else {
    delete form.dataset.editId;
    document.getElementById('ragDocumentModalTitle').textContent = 'Add document';
    setRagSourceMode('file');
    currentFileLabel.textContent = '';
  }
  document.getElementById('ragDocumentModal').classList.remove('hidden');
}

async function loadQueue() {
  const requests = await api('/api/scheduling/swap-requests');
  const queue = document.getElementById('swapQueue');
  queue.innerHTML = requests.length ? requests.map(r => `<div class="queue-item"><strong>${escapeHtml(r.requestingEmployeeName)}</strong> → <strong>${escapeHtml(r.targetEmployeeName)}</strong><br>${r.date} · ${r.startTime}–${r.endTime}<div class="queue-actions"><button class="button" data-decision="true" data-id="${r.id}" data-approve="true">Approve</button><button class="button danger" data-decision="true" data-id="${r.id}" data-approve="false">Deny</button></div></div>`).join('') : '<span class="empty-state">No active approvals.</span>';
  queue.querySelectorAll('[data-decision]').forEach(button => button.addEventListener('click', async () => { try { await api(`/api/scheduling/swap-requests/${button.dataset.id}/decision`, {method:'POST', body:JSON.stringify({approve:button.dataset.approve === 'true'})}); await loadSchedule(); } catch(error) { toast(error.message, 'error'); }}));
  const badge = document.getElementById('buildToolsBadge');
  badge.textContent = requests.length;
  badge.classList.toggle('hidden', requests.length === 0);
}
function timeGreeting() { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; }
function fmtClock(t) { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}:${String(m).padStart(2, '0')}${ap}`; }

async function loadDashboard() {
  document.getElementById('dashGreeting').textContent = `Good ${timeGreeting()}, ${(session.user?.name || 'there').split(' ')[0]}`;
  document.getElementById('dashDateSub').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById(isManager ? 'managerDashGrid' : 'employeeDashGrid').classList.remove('hidden');
  if (isManager) await renderManagerDashboard(); else await renderEmployeeDashboard();
}
async function renderManagerDashboard() {
  const today = isoDate(new Date());
  const weekStart = isoDate(mondayOf(today));
  const [shifts, announcements, docs, swaps] = await Promise.all([
    api(`/api/scheduling/shifts?weekStart=${weekStart}`),
    api('/api/announcements'),
    api('/api/rag/documents'),
    api('/api/scheduling/swap-requests'),
  ]);
  const todayShifts = shifts.filter(s => s.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
  document.getElementById('dashRoster').innerHTML = todayShifts.length
    ? todayShifts.map(s => `<div class="roster-row ${s.employeeId ? '' : 'open'}">
        <span class="roster-avatar">${s.employeeId ? initials(s.employeeName) : '?'}</span>
        <span class="roster-name">${s.employeeId ? escapeHtml(s.employeeName.split(' ')[0]) : 'Open shift'}</span>
        <span class="roster-dept">${s.roleRequired.toUpperCase()}</span>
        <span class="roster-time">${fmtClock(s.startTime)} – ${fmtClock(s.endTime)}</span>
      </div>`).join('')
    : '<div class="empty-state">Nothing scheduled today yet.</div>';

  const openToday = todayShifts.filter(s => !s.employeeId).length;
  const openWeek = shifts.filter(s => !s.employeeId).length;
  const draftWeek = shifts.filter(s => s.isDraft).length;
  const attnItems = [];
  if (openToday) attnItems.push({ title: `${openToday} open shift${openToday === 1 ? '' : 's'} today`, sub: 'Still unassigned' });
  if (openWeek > openToday) attnItems.push({ title: `${openWeek} open shift${openWeek === 1 ? '' : 's'} this week`, sub: 'Across the whole week' });
  if (draftWeek) attnItems.push({ title: `${draftWeek} shift${draftWeek === 1 ? '' : 's'} not yet published`, sub: "Employees can't see these yet" });
  if (swaps.length) attnItems.push({ title: `${swaps.length} swap request${swaps.length === 1 ? '' : 's'} awaiting approval`, sub: 'In Schedule → Build tools' });
  document.getElementById('dashAttention').innerHTML = attnItems.length
    ? attnItems.map(i => `<div class="attn-item"><span class="attn-dot"></span><div class="attn-text"><strong>${escapeHtml(i.title)}</strong><span>${escapeHtml(i.sub)}</span></div></div>`).join('')
    : '<div class="all-clear">✓ Nothing needs your attention right now</div>';

  document.getElementById('dashManagerAnnouncements').innerHTML = announcements.length
    ? announcements.slice(0, 3).map(a => `<div class="ann-item">${a.pinned ? '<span class="pin">Pinned</span>' : ''}<h3>${escapeHtml(a.title)}</h3><div class="meta">${a.readCount}/${a.totalRecipients} read</div></div>`).join('')
    : '<div class="empty-state">No announcements yet.</div>';

  document.getElementById('dashDocCount').textContent = docs.length;
}
async function renderEmployeeDashboard() {
  const today = isoDate(new Date());
  const thisMonday = mondayOf(today);
  const nextMonday = new Date(thisMonday); nextMonday.setDate(nextMonday.getDate() + 7);
  const [shifts, nextShifts, announcements, docs] = await Promise.all([
    api(`/api/scheduling/shifts?weekStart=${isoDate(thisMonday)}`),
    api(`/api/scheduling/shifts?weekStart=${isoDate(nextMonday)}`),
    api('/api/announcements'),
    api('/api/rag/documents'),
  ]);
  const mine = shifts.filter(s => s.employeeId === session.user.id).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const todayShift = mine.find(s => s.date === today);
  const nextShift = mine.find(s => s.date > today);
  const el = document.getElementById('dashMyShift');
  if (todayShift) {
    el.innerHTML = `<div class="myshift-card">
        <div class="myshift-time"><div class="t">${fmtClock(todayShift.startTime)}</div><div class="d">start</div></div>
        <div class="myshift-divider"></div>
        <div class="myshift-detail"><div class="dept">${todayShift.roleRequired.toUpperCase()} · until ${fmtClock(todayShift.endTime)}</div><div class="note">You're on today</div></div>
      </div>`;
  } else {
    const nextLabel = nextShift
      ? `Your next shift is <strong>${new Date(`${nextShift.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}, ${fmtClock(nextShift.startTime)}–${fmtClock(nextShift.endTime)}</strong>`
      : 'No upcoming shifts scheduled yet this week.';
    el.innerHTML = `<div class="myshift-empty"><div class="big">You're off today</div><div class="sub">${nextLabel}</div></div>`;
  }

  const hoursThisWeek = mine.reduce((sum, s) => sum + shiftHours(s), 0);
  const mineNext = nextShifts.filter(s => s.employeeId === session.user.id);
  const hoursNextWeek = mineNext.reduce((sum, s) => sum + shiftHours(s), 0);
  document.getElementById('dashHoursThisWeek').textContent = Math.round(hoursThisWeek * 10) / 10;
  document.getElementById('dashHoursNextWeek').textContent = mineNext.length ? Math.round(hoursNextWeek * 10) / 10 : '—';

  const unread = announcements.filter(a => !a.readByMe);
  document.getElementById('dashEmployeeAnnouncements').innerHTML = unread.length
    ? unread.slice(0, 3).map(a => `<div class="ann-item">${a.pinned ? '<span class="pin">Pinned</span>' : ''}<h3>${escapeHtml(a.title)}</h3><div class="meta">Needs your acknowledgment</div></div>`).join('')
    : "<div class=\"empty-state\">You're all caught up.</div>";

  document.getElementById('dashDocCountEmployee').textContent = docs.length;
}
async function loadEmployeeSchedule() { document.getElementById('myScheduleFeed').innerHTML = '<div class="loading-state">Loading…</div>'; document.getElementById('eligibleFeed').innerHTML = '<div class="loading-state">Loading…</div>'; const shifts = await api(`/api/scheduling/shifts?weekStart=${isoDate(currentWeek)}`); const mine = shifts.filter(s => s.employeeId === session.user.id); document.getElementById('myScheduleFeed').innerHTML = mine.length ? mine.map(s => `<div class="my-shift"><strong>${s.date}</strong> · ${s.startTime}–${s.endTime} (${s.roleRequired.toUpperCase()})<br><button class="button danger" data-drop="${s.id}" ${s.status === 'Pending_Swap' ? 'disabled' : ''}>${s.status === 'Pending_Swap' ? 'Swap pending' : 'Offer shift'}</button></div>`).join('') : '<span class="empty-state">No shifts scheduled this week.</span>'; document.querySelectorAll('[data-drop]').forEach(button => button.addEventListener('click', async () => { try { const result = await api(`/api/scheduling/drop-shift?shiftId=${button.dataset.drop}`, {method:'POST'}); toast(result.matches.length ? `${result.matches.length} eligible teammate${result.matches.length === 1 ? '' : 's'} can now claim it.` : 'No eligible coworkers available for a swap right now.', result.matches.length ? 'success' : ''); await loadEmployeeSchedule(); } catch(error) { toast(error.message, 'error'); }})); const eligible = await api('/api/scheduling/eligible-shifts'); document.getElementById('eligibleFeed').innerHTML = eligible.length ? eligible.map(s => `<div class="feed-item"><strong>${s.date}</strong> · ${s.startTime}–${s.endTime}<br>${s.roleRequired.toUpperCase()} · you meet every scheduling rule<br><button class="button" data-claim="${s.swapRequestId}">Claim shift</button></div>`).join('') : '<span class="empty-state">No eligible shifts right now.</span>'; document.querySelectorAll('[data-claim]').forEach(button => button.addEventListener('click', async () => { try { await api(`/api/scheduling/swap-requests/${button.dataset.claim}/claim`, {method:'POST'}); toast('Claim sent to your manager for approval.', 'success'); await loadEmployeeSchedule(); } catch(error) { toast(error.message, 'error'); }})); }
const isManager = session.user?.role === 'manager'; document.getElementById(isManager ? 'managerSchedule' : 'employeeSchedule').classList.remove('hidden');
document.getElementById(isManager ? 'managerAnnouncements' : 'employeeAnnouncements').classList.remove('hidden');
document.getElementById('newAnnouncement').classList.toggle('hidden', !isManager);
loadAnnouncements().catch(e => toast(e.message, 'error'));
renderRagThread();
loadRagDocuments().catch(e => toast(e.message, 'error'));
loadDashboard().catch(e => toast(e.message, 'error'));
document.getElementById('ragAskForm').addEventListener('submit', (e) => {
  e.preventDefault();
  askRag(document.getElementById('ragQuestion').value);
});
document.querySelectorAll('[data-goto]').forEach(link => link.addEventListener('click', (e) => {
  e.preventDefault();
  document.querySelector(`[data-panel="${link.dataset.goto}"]`).click();
}));
document.getElementById('dashAskForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('dashAskInput');
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  document.querySelector('[data-panel="rag"]').click();
  askRag(q);
});
document.getElementById('dashAskFormEmployee').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('dashAskInputEmployee');
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  document.querySelector('[data-panel="rag"]').click();
  askRag(q);
});
if (isManager) { document.getElementById('departmentsSettingsRow').classList.remove('hidden'); document.getElementById('teamSettingsRow').classList.remove('hidden'); loadSchedule().catch(e => toast(e.message, 'error')); loadTemplates().catch(e => toast(e.message, 'error'));
  document.getElementById('newRagDocument').addEventListener('click', () => { openRagDocumentModal(null).catch(error => toast(error.message, 'error')); });
  document.getElementById('ragDocumentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const editId = form.dataset.editId;
    const title = document.getElementById('ragDocTitle').value;
    const source = form.querySelector('input[name="ragSource"]:checked').value;
    const body = new FormData();
    body.append('title', title);
    body.append('docType', document.getElementById('ragDocType').value);
    if (source === 'file') {
      const file = document.getElementById('ragDocFile').files[0];
      if (file) body.append('file', file);
      else if (!editId) { toast('Choose a file to upload.', 'error'); return; }
    } else {
      const text = document.getElementById('ragDocContentText').value.trim();
      if (!text) { toast('Enter some text to save.', 'error'); return; }
      const slug = (title.trim() || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
      body.append('file', new File([text], `${slug}.txt`, { type: 'text/plain' }));
    }
    await withBusy(form.querySelector('button[type="submit"]'), editId ? 'Saving…' : 'Adding…', async () => {
      try {
        if (editId) {
          await api(`/api/rag/documents/${editId}`, {method:'PUT', body});
        } else {
          await api('/api/rag/documents', {method:'POST', body});
        }
        closeModal('ragDocumentModal');
        toast(editId ? 'Document updated.' : 'Document added.', 'success');
        await loadRagDocuments();
      } catch (error) { toast(error.message, 'error'); }
    });
  });
  document.querySelectorAll('.view-switch button').forEach(b => b.addEventListener('click', () => setViewMode(b.dataset.view)));
  document.getElementById('navPrev').addEventListener('click', () => nav(-1));
  document.getElementById('navNext').addEventListener('click', () => nav(1));
  document.getElementById('btnToday').addEventListener('click', goToday);

  const toolsDrawer = document.getElementById('toolsDrawer');
  const toolsVeil = document.getElementById('toolsVeil');
  document.getElementById('btnBuildTools').addEventListener('click', () => { toolsDrawer.classList.add('open'); toolsVeil.classList.add('open'); });
  document.getElementById('toolsClose').addEventListener('click', () => { toolsDrawer.classList.remove('open'); toolsVeil.classList.remove('open'); });
  toolsVeil.addEventListener('click', () => { toolsDrawer.classList.remove('open'); toolsVeil.classList.remove('open'); });

  document.getElementById('autoBuild').addEventListener('click', async () => { try { const result = await api('/api/scheduling/auto-build', {method:'POST', body:JSON.stringify({weekStart:isoDate(currentWeek)})}); toast(`${result.assigned.length} shift(s) assigned${result.unfilledShiftIds.length ? ` · ${result.unfilledShiftIds.length} still open` : ''}.`, 'success'); await loadSchedule(); } catch(e) { toast(e.message, 'error'); }});
  document.getElementById('btnPublish').addEventListener('click', async () => { try { const departmentId = document.getElementById('toolDepartment').value; const result = await api('/api/scheduling/publish', {method:'POST', body:JSON.stringify({weekStart:isoDate(currentWeek), departmentId: departmentId ? Number(departmentId) : null})}); toast(`${result.publishedCount} shift(s) published.`, 'success'); await loadSchedule(); } catch(e) { toast(e.message, 'error'); }});
  document.getElementById('saveTemplate').addEventListener('click', async () => { const name = await promptDialog('Template name'); if (!name) return; try { await api('/api/scheduling/templates', {method:'POST', body:JSON.stringify({name, weekStart:isoDate(currentWeek)})}); toast('Template saved.', 'success'); await loadTemplates(); } catch(e) { toast(e.message, 'error'); }});
  document.getElementById('templateSelect').addEventListener('change', async (e) => { const id = e.target.value; if (!id) return; try { const result = await api(`/api/scheduling/templates/${id}/apply?weekStart=${isoDate(currentWeek)}`, {method:'POST'}); toast(`${result.applied.length} shift(s) applied${result.skippedCount ? ` · ${result.skippedCount} skipped` : ''}.`, 'success'); await loadSchedule(); } catch(err) { toast(err.message, 'error'); } finally { e.target.value = ''; }});
  document.getElementById('addDeptBtn').addEventListener('click', async () => { const nameInput = document.getElementById('newDeptName'); const name = nameInput.value.trim(); if (!name) return; try { await api('/api/scheduling/departments', {method:'POST', body:JSON.stringify({name, roleCategory:document.getElementById('newDeptCategory').value})}); nameInput.value = ''; await loadDepartments(); renderDepartmentsSettings(); toast('Department added.', 'success'); } catch(e) { toast(e.message, 'error'); }});
  document.getElementById('dayPlanForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const editId = form.dataset.editId;
    const scope = form.querySelector('input[name="reqScope"]:checked').value;
    const body = {
      startTime: document.getElementById('reqStart').value,
      endTime: document.getElementById('reqEnd').value,
      countRequired: Number(document.getElementById('reqCount').value),
      minConfidence: document.getElementById('reqMinConfidence').value ? Number(document.getElementById('reqMinConfidence').value) : null,
      notes: document.getElementById('reqNotes').value,
    };
    // resetRequirementForm() (which changes reqSubmitBtn's label back to its rest state) runs
    // after withBusy resolves, not inside it — withBusy restores the pre-click label in its own
    // `finally`, and doing the reset first would just get overwritten by that restore.
    let succeeded = false;
    try {
      await withBusy(document.getElementById('reqSubmitBtn'), editId ? 'Updating…' : 'Adding…', async () => {
        if (editId) {
          await api(`/api/scheduling/requirements/${editId}`, {method:'PATCH', body:JSON.stringify(body)});
        } else {
          await api('/api/scheduling/requirements', {method:'POST', body:JSON.stringify({
            ...body,
            departmentId: Number(document.getElementById('reqDepartment').value),
            dayOfWeek: dayOfWeekOf(dayPlanDate),
            weekStartOverride: scope === 'week' ? isoDate(currentWeek) : null,
          })});
        }
        succeeded = true;
      });
    } catch (error) { toast(error.message, 'error'); }
    if (succeeded) {
      toast(editId ? 'Requirement updated.' : 'Requirement added.', 'success');
      resetRequirementForm();
      await renderDayPlanList();
    }
  });
  document.getElementById('cancelReqEdit').addEventListener('click', resetRequirementForm);
  document.getElementById('generateShifts').addEventListener('click', async () => {
    try {
      const departmentId = document.getElementById('toolDepartment').value;
      const result = await api('/api/scheduling/requirements/generate-shifts', {method:'POST', body:JSON.stringify({weekStart:isoDate(currentWeek), departmentId: departmentId ? Number(departmentId) : null})});
      toast(`${result.created.length} shift(s) generated${result.skippedCount ? ` · ${result.skippedCount} already covered` : ''}.`, 'success');
      await loadSchedule();
    } catch (e) { toast(e.message, 'error'); }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.read-chip')) document.querySelectorAll('.read-chip.open').forEach(chip => chip.classList.remove('open'));
  });
  document.getElementById('newAnnouncement').addEventListener('click', () => { document.getElementById('announcementForm').reset(); document.getElementById('announcementModal').classList.remove('hidden'); });
  document.getElementById('announcementForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await withBusy(e.target.querySelector('button[type="submit"]'), 'Posting…', async () => {
      try {
        await api('/api/announcements', {method:'POST', body:JSON.stringify({
          title: document.getElementById('annTitle').value,
          body: document.getElementById('annBody').value,
          pinned: document.getElementById('annPinned').checked,
        })});
        closeModal('announcementModal');
        toast('Announcement posted.', 'success');
        await loadAnnouncements();
      } catch (error) { toast(error.message, 'error'); }
    });
  });
  document.getElementById('empConfidence').addEventListener('input', (e) => { document.getElementById('confidenceValueLabel').textContent = e.target.value; });
  document.getElementById('employeeCardForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const employeeId = Number(e.target.dataset.employeeId);
    await withBusy(e.target.querySelector('button[type="submit"]'), 'Saving…', async () => {
      try {
        await api(`/api/scheduling/employees/${employeeId}`, {method:'PATCH', body:JSON.stringify({
          schedulingConfidence: Number(document.getElementById('empConfidence').value),
          maxHoursPerWeek: Number(document.getElementById('empMaxHours').value),
          minHoursPerWeek: Number(document.getElementById('empMinHours').value),
          preferredHoursPerWeek: document.getElementById('empPreferredHours').value ? Number(document.getElementById('empPreferredHours').value) : null,
          schedulingNotes: document.getElementById('empNotes').value,
          autoScheduleOptOut: document.getElementById('empOptOut').checked,
        })});
        closeModal('employeeCardModal');
        toast('Employee profile saved.', 'success');
        await loadSchedule();
      } catch (error) { toast(error.message, 'error'); }
    });
  });
} else { loadEmployeeSchedule().catch(e => toast(e.message, 'error')); document.getElementById('refreshEmployee').onclick = () => loadEmployeeSchedule().catch(e => toast(e.message, 'error')); document.getElementById('editAvailability').onclick = async () => { try { const current = (await api('/api/scheduling/availability')).weeklyAvailability || {}; const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']; document.getElementById('availabilityRows').innerHTML = days.map(day => { const slot = current[day]?.[0]; return `<label class="availability-row"><span><input type="checkbox" data-day-enabled="${day}" ${slot ? 'checked' : ''}/> ${day}</span><input data-day-start="${day}" type="time" value="${slot?.start || '09:00'}" ${slot ? '' : 'disabled'}/><input data-day-end="${day}" type="time" value="${slot?.end || '17:00'}" ${slot ? '' : 'disabled'}/></label>`; }).join(''); document.querySelectorAll('[data-day-enabled]').forEach(box => box.addEventListener('change', () => document.querySelectorAll(`[data-day-start="${box.dataset.dayEnabled}"], [data-day-end="${box.dataset.dayEnabled}"]`).forEach(input => input.disabled = !box.checked))); document.getElementById('availabilityModal').classList.remove('hidden'); } catch(e) { toast(e.message, 'error'); }}; document.getElementById('availabilityForm').onsubmit = async e => { e.preventDefault(); const availability = {}; document.querySelectorAll('[data-day-enabled]').forEach(box => { if (box.checked) availability[box.dataset.dayEnabled] = [{start:document.querySelector(`[data-day-start="${box.dataset.dayEnabled}"]`).value, end:document.querySelector(`[data-day-end="${box.dataset.dayEnabled}"]`).value}]; }); await withBusy(e.target.querySelector('button[type="submit"]'), 'Saving…', async () => { try { await api('/api/scheduling/availability', {method:'PATCH', body:JSON.stringify({weeklyAvailability:availability})}); closeModal('availabilityModal'); toast('Availability saved.', 'success'); } catch(error) { toast(error.message, 'error'); } }); }; document.querySelectorAll('[data-employee-panel]').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('[data-employee-panel]').forEach(t => t.classList.toggle('active', t === tab)); document.getElementById('myScheduleFeed').classList.toggle('hidden', tab.dataset.employeePanel !== 'my'); document.getElementById('eligibleFeed').classList.toggle('hidden', tab.dataset.employeePanel !== 'eligible'); })); }
