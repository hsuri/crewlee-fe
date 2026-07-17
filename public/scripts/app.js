import { createApiClient } from './lib/api.js';
import { clearSession, getSession } from './lib/session.js';
import { toast } from './lib/toast.js';

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

document.querySelectorAll('[data-panel]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-panel]').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');
  });
});

const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
settingsBtn.addEventListener('click', async () => {
  settingsOverlay.classList.remove('hidden');
  settingsBtn.classList.add('active');
  if (isManager) { if (!managerDepartments.length) await loadDepartments(); renderDepartmentsSettings(); }
});
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) {
    settingsOverlay.classList.add('hidden');
    settingsBtn.classList.remove('active');
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
let managerEmployees = [], managerShifts = [], managerDepartments = [], managerTemplates = [];
let selectedShift = null, focusedCell = null, shiftClipboard = null;
function selectShift(shift) {
  document.querySelectorAll('.shift.selected').forEach(el => el.classList.remove('selected'));
  selectedShift = shift || null;
  if (selectedShift) { const el = document.querySelector(`.shift[data-shift-id="${selectedShift.id}"]`); if (el) el.classList.add('selected'); }
}
function focusCell(zone) {
  document.querySelectorAll('.drop-zone.focused').forEach(el => el.classList.remove('focused'));
  zone.classList.add('focused');
  focusedCell = { element: zone, employeeId: zone.dataset.employeeId, date: zone.dataset.date };
}
function moveFocus(key) {
  const zones = Array.from(document.querySelectorAll('#managerGrid .drop-zone'));
  if (!zones.length) return;
  let idx = focusedCell ? zones.indexOf(focusedCell.element) : -1;
  if (idx === -1) idx = 0;
  if (key === 'ArrowRight') idx = Math.min(idx + 1, zones.length - 1);
  else if (key === 'ArrowLeft') idx = Math.max(idx - 1, 0);
  else if (key === 'ArrowDown') idx = Math.min(idx + 7, zones.length - 1);
  else if (key === 'ArrowUp') idx = Math.max(idx - 7, 0);
  focusCell(zones[idx]);
}
document.addEventListener('keydown', async (e) => {
  const managerPanel = document.getElementById('managerSchedule');
  if (!managerPanel || managerPanel.classList.contains('hidden')) return;
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault(); moveFocus(e.key);
  } else if ((e.key === 'c' || e.key === 'C') && selectedShift) {
    shiftClipboard = { departmentId: selectedShift.departmentId, employeeId: selectedShift.employeeId, startTime: selectedShift.startTime, endTime: selectedShift.endTime };
    toast('Shift copied.', '');
  } else if ((e.key === 'v' || e.key === 'V') && shiftClipboard && focusedCell) {
    e.preventDefault();
    try { await api('/api/scheduling/shifts', {method:'POST', body:JSON.stringify({departmentId:shiftClipboard.departmentId, employeeId:Number(focusedCell.employeeId), date:focusedCell.date, startTime:shiftClipboard.startTime, endTime:shiftClipboard.endTime})}); toast('Shift pasted.', 'success'); await loadManagerSchedule(); } catch (error) { toast(error.message, 'error'); }
  } else if ((e.key === 'Backspace' || e.key === 'Delete') && selectedShift) {
    e.preventDefault();
    const shiftId = selectedShift.id;
    try { await api(`/api/scheduling/shifts/${shiftId}`, {method:'DELETE'}); selectShift(null); toast('Shift deleted.', 'success'); await loadManagerSchedule(); } catch (error) { toast(error.message, 'error'); }
  }
});
const dayLabel = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
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
function shiftButton(shift, draggable = false) {
  const warning = shiftWarning(shift);
  return `<button class="shift ${shift.status === 'Pending_Swap' ? 'pending' : shift.employeeId ? '' : 'open'} ${shift.isDraft ? 'draft' : ''}" ${draggable ? `draggable="true" data-shift-id="${shift.id}"` : ''} ${warning ? `title="${warning}"` : ''}><strong>${shift.startTime}–${shift.endTime}</strong>${warning ? ' <span class="warn-icon">⚠️</span>' : ''}<br>${shift.departmentName || shift.roleRequired.toUpperCase()}${shift.status === 'Pending_Swap' ? ' · swap pending' : ''}</button>`;
}
async function loadDepartments() {
  managerDepartments = await api('/api/scheduling/departments');
  const filter = document.getElementById('departmentFilter');
  const previous = filter.value;
  filter.innerHTML = '<option value="">All departments</option>' + managerDepartments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  filter.value = managerDepartments.some(d => String(d.id) === previous) ? previous : '';
}
async function loadTemplates() {
  managerTemplates = await api('/api/scheduling/templates');
  document.getElementById('templateSelect').innerHTML = '<option value="">Apply template…</option>' + managerTemplates.map(t => `<option value="${t.id}">${t.name} (${t.shiftCount})</option>`).join('');
}
function renderDepartmentsSettings() {
  document.getElementById('departmentsList').innerHTML = managerDepartments.length ? managerDepartments.map(d => `<div class="dept-row"><input type="text" value="${d.name}" data-dept-id="${d.id}" /><span class="role-badge">${d.roleCategory.toUpperCase()}</span><button type="button" class="button secondary" data-save-dept="${d.id}">Save</button></div>`).join('') : '<span class="empty-state">No departments yet.</span>';
  document.querySelectorAll('[data-save-dept]').forEach(button => button.addEventListener('click', async () => {
    const input = document.querySelector(`input[data-dept-id="${button.dataset.saveDept}"]`);
    try { await api(`/api/scheduling/departments/${button.dataset.saveDept}`, {method:'PATCH', body:JSON.stringify({name:input.value})}); await loadDepartments(); renderDepartmentsSettings(); toast('Department renamed.', 'success'); await loadManagerSchedule(); } catch (error) { toast(error.message, 'error'); }
  }));
}
const closeModal = id => document.getElementById(id).classList.add('hidden');
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.close)));

async function loadManagerSchedule() {
  const week = isoDate(currentWeek);
  if (!managerDepartments.length) await loadDepartments();
  const departmentId = document.getElementById('departmentFilter').value;
  const deptQuery = departmentId ? `&departmentId=${departmentId}` : '';
  [managerEmployees, managerShifts] = await Promise.all([
    api(`/api/scheduling/employees${departmentId ? `?departmentId=${departmentId}` : ''}`),
    api(`/api/scheduling/shifts?weekStart=${week}${deptQuery}`),
  ]);
  const draftCount = managerShifts.filter(s => s.isDraft).length;
  document.getElementById('publishWeek').classList.toggle('hidden', draftCount === 0);
  document.getElementById('publishBadge').classList.toggle('hidden', draftCount === 0);
  document.getElementById('publishBadge').textContent = draftCount;
  const grid = document.getElementById('managerGrid'); grid.innerHTML = '<div class="head">Employee</div>';
  const days = Array.from({length:7}, (_, index) => { const d = new Date(currentWeek); d.setDate(d.getDate() + index); return d; });
  days.forEach(day => grid.insertAdjacentHTML('beforeend', `<div class="head day-head" data-date="${isoDate(day)}" title="Click to plan staffing for this day">${dayLabel(day)}</div>`));
  const groups = managerDepartments
    .filter(d => !departmentId || String(d.id) === departmentId)
    .map(d => ({ department: d, employees: managerEmployees.filter(e => e.departmentId === d.id) }))
    .filter(g => g.employees.length);
  const unassigned = managerEmployees.filter(e => !e.departmentId);
  if (unassigned.length) groups.push({ department: { name: 'No department' }, employees: unassigned });
  groups.forEach(group => {
    grid.insertAdjacentHTML('beforeend', `<div class="dept-header">${group.department.name}</div>`);
    group.employees.forEach(employee => {
      grid.insertAdjacentHTML('beforeend', `<div class="employee"><button type="button" class="employee-name" data-employee-card="${employee.id}" title="Edit Smart Fill profile"><span class="confidence-dot conf-${employee.schedulingConfidence}" title="Confidence ${employee.schedulingConfidence}/5"></span>${employee.name}${employee.autoScheduleOptOut ? ' <span class="opt-out-badge" title="Excluded from Smart Fill">off</span>' : ''}</button><br><span class="role-badge">${employee.role}</span></div>`);
      days.forEach(day => { const dateStr = isoDate(day); const shifts = managerShifts.filter(s => s.employeeId === employee.id && s.date === dateStr); const unavailable = !dayHasAvailability(employee, dateStr); grid.insertAdjacentHTML('beforeend', `<div class="drop-zone ${unavailable ? 'unavailable' : ''}" data-employee-id="${employee.id}" data-date="${dateStr}">${shifts.map(s => shiftButton(s, true)).join('')}</div>`); });
    });
  });
  document.getElementById('openShiftList').innerHTML = managerShifts.filter(s => !s.employeeId).length ? managerShifts.filter(s => !s.employeeId).map(s => `<div class="queue-item">${s.date}<br>${shiftButton(s, true)}</div>`).join('') : '<span class="empty-state">No open shifts.</span>';
  document.querySelectorAll('[draggable]').forEach(el => el.addEventListener('dragstart', e => e.dataTransfer.setData('shiftId', el.dataset.shiftId)));
  document.querySelectorAll('.shift[data-shift-id]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); selectShift(managerShifts.find(s => s.id === Number(el.dataset.shiftId))); }));
  grid.querySelectorAll('.drop-zone').forEach(zone => {
    zone.addEventListener('click', () => focusCell(zone));
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', async e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      const shift = managerShifts.find(s => s.id === Number(e.dataTransfer.getData('shiftId')));
      if (!shift) return;
      const sameCell = shift.employeeId === Number(zone.dataset.employeeId) && shift.date === zone.dataset.date;
      if (sameCell && !e.shiftKey) return;
      try {
        if (e.shiftKey) {
          await api('/api/scheduling/shifts', {method:'POST', body:JSON.stringify({departmentId:shift.departmentId, employeeId:Number(zone.dataset.employeeId), date:zone.dataset.date, startTime:shift.startTime, endTime:shift.endTime})});
          toast('Shift duplicated.', 'success');
        } else {
          await api(`/api/scheduling/shifts/${shift.id}`, {method:'PATCH', body:JSON.stringify({employeeId:Number(zone.dataset.employeeId), date:zone.dataset.date, startTime:shift.startTime, endTime:shift.endTime})});
        }
        await loadManagerSchedule();
      } catch (error) { toast(error.message, 'error'); }
    });
  });
  grid.querySelectorAll('.day-head').forEach(head => head.addEventListener('click', async () => { try { await openDayPlanModal(head.dataset.date); } catch (error) { toast(error.message, 'error'); } }));
  grid.querySelectorAll('[data-employee-card]').forEach(button => button.addEventListener('click', e => { e.stopPropagation(); try { openEmployeeCard(Number(button.dataset.employeeCard)); } catch (error) { toast(error.message, 'error'); } }));
  if (selectedShift) { const el = document.querySelector(`.shift[data-shift-id="${selectedShift.id}"]`); if (el) el.classList.add('selected'); else selectedShift = null; }
  if (focusedCell) { const zone = document.querySelector(`.drop-zone[data-employee-id="${focusedCell.employeeId}"][data-date="${focusedCell.date}"]`); if (zone) { zone.classList.add('focused'); focusedCell.element = zone; } else focusedCell = null; }
  await loadQueue();
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
async function loadQueue() { const requests = await api('/api/scheduling/swap-requests'); const queue = document.getElementById('swapQueue'); queue.innerHTML = requests.length ? requests.map(r => `<div class="queue-item"><strong>${r.requestingEmployeeName}</strong> → <strong>${r.targetEmployeeName}</strong><br>${r.date} · ${r.startTime}–${r.endTime}<div class="queue-actions"><button class="button" data-decision="true" data-id="${r.id}" data-approve="true">Approve</button><button class="button danger" data-decision="true" data-id="${r.id}" data-approve="false">Deny</button></div></div>`).join('') : '<span class="empty-state">No active approvals.</span>'; queue.querySelectorAll('[data-decision]').forEach(button => button.addEventListener('click', async () => { try { await api(`/api/scheduling/swap-requests/${button.dataset.id}/decision`, {method:'POST', body:JSON.stringify({approve:button.dataset.approve === 'true'})}); await loadManagerSchedule(); } catch(error) { toast(error.message, 'error'); }})); }
async function loadEmployeeSchedule() { const shifts = await api(`/api/scheduling/shifts?weekStart=${isoDate(currentWeek)}`); const mine = shifts.filter(s => s.employeeId === session.user.id); document.getElementById('myScheduleFeed').innerHTML = mine.length ? mine.map(s => `<div class="my-shift"><strong>${s.date}</strong> · ${s.startTime}–${s.endTime} (${s.roleRequired.toUpperCase()})<br><button class="button danger" data-drop="${s.id}" ${s.status === 'Pending_Swap' ? 'disabled' : ''}>${s.status === 'Pending_Swap' ? 'Swap pending' : 'Offer shift'}</button></div>`).join('') : '<span class="empty-state">No shifts scheduled this week.</span>'; document.querySelectorAll('[data-drop]').forEach(button => button.addEventListener('click', async () => { try { const result = await api(`/api/scheduling/drop-shift?shiftId=${button.dataset.drop}`, {method:'POST'}); toast(result.matches.length ? `${result.matches.length} eligible teammate${result.matches.length === 1 ? '' : 's'} can now claim it.` : 'No eligible coworkers available for a swap right now.', result.matches.length ? 'success' : ''); await loadEmployeeSchedule(); } catch(error) { toast(error.message, 'error'); }})); const eligible = await api('/api/scheduling/eligible-shifts'); document.getElementById('eligibleFeed').innerHTML = eligible.length ? eligible.map(s => `<div class="feed-item"><strong>${s.date}</strong> · ${s.startTime}–${s.endTime}<br>${s.roleRequired.toUpperCase()} · you meet every scheduling rule<br><button class="button" data-claim="${s.swapRequestId}">Claim shift</button></div>`).join('') : '<span class="empty-state">No eligible shifts right now.</span>'; document.querySelectorAll('[data-claim]').forEach(button => button.addEventListener('click', async () => { try { await api(`/api/scheduling/swap-requests/${button.dataset.claim}/claim`, {method:'POST'}); toast('Claim sent to your manager for approval.', 'success'); await loadEmployeeSchedule(); } catch(error) { toast(error.message, 'error'); }})); }
const isManager = session.user?.role === 'manager'; document.getElementById(isManager ? 'managerSchedule' : 'employeeSchedule').classList.remove('hidden');
if (isManager) { document.getElementById('departmentsSettingsRow').classList.remove('hidden'); loadManagerSchedule().catch(e => toast(e.message, 'error')); loadTemplates().catch(e => toast(e.message, 'error'));
  const savedDensity = localStorage.getItem('crewleeDensity') || 'cozy';
  document.getElementById('densitySelect').value = savedDensity;
  if (savedDensity !== 'cozy') document.getElementById('managerGrid').classList.add(`density-${savedDensity}`);
  document.getElementById('densitySelect').addEventListener('change', (e) => {
    const managerGrid = document.getElementById('managerGrid');
    managerGrid.classList.remove('density-compact', 'density-spacious');
    if (e.target.value !== 'cozy') managerGrid.classList.add(`density-${e.target.value}`);
    localStorage.setItem('crewleeDensity', e.target.value);
  });
  const scheduleLayout = document.querySelector('.schedule-layout');
  const toggleSidebarBtn = document.getElementById('toggleSidebar');
  if (localStorage.getItem('crewleeSidebarCollapsed') === 'true') { scheduleLayout.classList.add('sidebar-collapsed'); toggleSidebarBtn.textContent = 'Show panel'; }
  toggleSidebarBtn.addEventListener('click', () => {
    const collapsed = scheduleLayout.classList.toggle('sidebar-collapsed');
    toggleSidebarBtn.textContent = collapsed ? 'Show panel' : 'Hide panel';
    localStorage.setItem('crewleeSidebarCollapsed', collapsed);
  }); document.getElementById('newShift').onclick = async () => { try { if (!managerDepartments.length) await loadDepartments(); if (!managerEmployees.length) managerEmployees = await api('/api/scheduling/employees'); const deptSelect = document.getElementById('shiftDepartment'); deptSelect.innerHTML = managerDepartments.map(d => `<option value="${d.id}">${d.name}</option>`).join(''); const employeeSelect = document.getElementById('shiftEmployee'); employeeSelect.innerHTML = '<option value="">Open shift — assign later</option>' + managerEmployees.map(e => `<option value="${e.id}" data-department="${e.departmentId || ''}">${e.name} · ${e.role.toUpperCase()}</option>`).join(''); employeeSelect.onchange = () => { const selected = employeeSelect.options[employeeSelect.selectedIndex]; if (selected.dataset.department) deptSelect.value = selected.dataset.department; }; document.getElementById('shiftDate').value = isoDate(currentWeek); document.getElementById('shiftModal').classList.remove('hidden'); } catch(e) { toast(e.message, 'error'); }}; document.getElementById('shiftForm').onsubmit = async e => { e.preventDefault(); const employeeValue = document.getElementById('shiftEmployee').value; try { await api('/api/scheduling/shifts', {method:'POST', body:JSON.stringify({departmentId:Number(document.getElementById('shiftDepartment').value), employeeId:employeeValue ? Number(employeeValue) : null, date:document.getElementById('shiftDate').value, startTime:document.getElementById('shiftStart').value, endTime:document.getElementById('shiftEnd').value})}); closeModal('shiftModal'); toast('Shift created.', 'success'); await loadManagerSchedule(); } catch(error) { toast(error.message, 'error'); }}; document.getElementById('autoBuild').addEventListener('click', async () => { try { const result = await api('/api/scheduling/auto-build', {method:'POST', body:JSON.stringify({weekStart:isoDate(currentWeek)})}); toast(`${result.assigned.length} shift(s) assigned${result.unfilledShiftIds.length ? ` · ${result.unfilledShiftIds.length} still open` : ''}.`, 'success'); await loadManagerSchedule(); } catch(e) { toast(e.message, 'error'); }}); document.getElementById('publishWeek').addEventListener('click', async () => { try { const departmentId = document.getElementById('departmentFilter').value; const result = await api('/api/scheduling/publish', {method:'POST', body:JSON.stringify({weekStart:isoDate(currentWeek), departmentId: departmentId ? Number(departmentId) : null})}); toast(`${result.publishedCount} shift(s) published.`, 'success'); await loadManagerSchedule(); } catch(e) { toast(e.message, 'error'); }}); document.getElementById('saveTemplate').addEventListener('click', async () => { const name = prompt('Name this template:'); if (!name || !name.trim()) return; try { await api('/api/scheduling/templates', {method:'POST', body:JSON.stringify({name:name.trim(), weekStart:isoDate(currentWeek)})}); toast('Template saved.', 'success'); await loadTemplates(); } catch(e) { toast(e.message, 'error'); }}); document.getElementById('templateSelect').addEventListener('change', async (e) => { const id = e.target.value; if (!id) return; try { const result = await api(`/api/scheduling/templates/${id}/apply?weekStart=${isoDate(currentWeek)}`, {method:'POST'}); toast(`${result.applied.length} shift(s) applied${result.skippedCount ? ` · ${result.skippedCount} skipped` : ''}.`, 'success'); await loadManagerSchedule(); } catch(err) { toast(err.message, 'error'); } finally { e.target.value = ''; }}); document.getElementById('previousWeek').onclick = () => { currentWeek.setDate(currentWeek.getDate() - 7); loadManagerSchedule().catch(e => toast(e.message, 'error')); }; document.getElementById('nextWeek').onclick = () => { currentWeek.setDate(currentWeek.getDate() + 7); loadManagerSchedule().catch(e => toast(e.message, 'error')); }; document.getElementById('departmentFilter').onchange = () => loadManagerSchedule().catch(e => toast(e.message, 'error')); document.getElementById('addDeptBtn').addEventListener('click', async () => { const nameInput = document.getElementById('newDeptName'); const name = nameInput.value.trim(); if (!name) return; try { await api('/api/scheduling/departments', {method:'POST', body:JSON.stringify({name, roleCategory:document.getElementById('newDeptCategory').value})}); nameInput.value = ''; await loadDepartments(); renderDepartmentsSettings(); toast('Department added.', 'success'); } catch(e) { toast(e.message, 'error'); }});
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
    try {
      if (editId) {
        await api(`/api/scheduling/requirements/${editId}`, {method:'PATCH', body:JSON.stringify(body)});
        toast('Requirement updated.', 'success');
      } else {
        await api('/api/scheduling/requirements', {method:'POST', body:JSON.stringify({
          ...body,
          departmentId: Number(document.getElementById('reqDepartment').value),
          dayOfWeek: dayOfWeekOf(dayPlanDate),
          weekStartOverride: scope === 'week' ? isoDate(currentWeek) : null,
        })});
        toast('Requirement added.', 'success');
      }
      resetRequirementForm();
      await renderDayPlanList();
    } catch (error) { toast(error.message, 'error'); }
  });
  document.getElementById('cancelReqEdit').addEventListener('click', resetRequirementForm);
  document.getElementById('generateShifts').addEventListener('click', async () => {
    try {
      const departmentId = document.getElementById('departmentFilter').value;
      const result = await api('/api/scheduling/requirements/generate-shifts', {method:'POST', body:JSON.stringify({weekStart:isoDate(currentWeek), departmentId: departmentId ? Number(departmentId) : null})});
      toast(`${result.created.length} shift(s) generated${result.skippedCount ? ` · ${result.skippedCount} already covered` : ''}.`, 'success');
      await loadManagerSchedule();
    } catch (e) { toast(e.message, 'error'); }
  });
  document.getElementById('empConfidence').addEventListener('input', (e) => { document.getElementById('confidenceValueLabel').textContent = e.target.value; });
  document.getElementById('employeeCardForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const employeeId = Number(e.target.dataset.employeeId);
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
      await loadManagerSchedule();
    } catch (error) { toast(error.message, 'error'); }
  });
} else { loadEmployeeSchedule().catch(e => toast(e.message, 'error')); document.getElementById('refreshEmployee').onclick = () => loadEmployeeSchedule().catch(e => toast(e.message, 'error')); document.getElementById('editAvailability').onclick = async () => { try { const current = (await api('/api/scheduling/availability')).weeklyAvailability || {}; const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']; document.getElementById('availabilityRows').innerHTML = days.map(day => { const slot = current[day]?.[0]; return `<label class="availability-row"><span><input type="checkbox" data-day-enabled="${day}" ${slot ? 'checked' : ''}/> ${day}</span><input data-day-start="${day}" type="time" value="${slot?.start || '09:00'}" ${slot ? '' : 'disabled'}/><input data-day-end="${day}" type="time" value="${slot?.end || '17:00'}" ${slot ? '' : 'disabled'}/></label>`; }).join(''); document.querySelectorAll('[data-day-enabled]').forEach(box => box.addEventListener('change', () => document.querySelectorAll(`[data-day-start="${box.dataset.dayEnabled}"], [data-day-end="${box.dataset.dayEnabled}"]`).forEach(input => input.disabled = !box.checked))); document.getElementById('availabilityModal').classList.remove('hidden'); } catch(e) { toast(e.message, 'error'); }}; document.getElementById('availabilityForm').onsubmit = async e => { e.preventDefault(); const availability = {}; document.querySelectorAll('[data-day-enabled]').forEach(box => { if (box.checked) availability[box.dataset.dayEnabled] = [{start:document.querySelector(`[data-day-start="${box.dataset.dayEnabled}"]`).value, end:document.querySelector(`[data-day-end="${box.dataset.dayEnabled}"]`).value}]; }); try { await api('/api/scheduling/availability', {method:'PATCH', body:JSON.stringify({weeklyAvailability:availability})}); closeModal('availabilityModal'); toast('Availability saved.', 'success'); } catch(error) { toast(error.message, 'error'); }}; document.querySelectorAll('[data-employee-panel]').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('[data-employee-panel]').forEach(t => t.classList.toggle('active', t === tab)); document.getElementById('myScheduleFeed').classList.toggle('hidden', tab.dataset.employeePanel !== 'my'); document.getElementById('eligibleFeed').classList.toggle('hidden', tab.dataset.employeePanel !== 'eligible'); })); }
