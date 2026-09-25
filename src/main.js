function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const colors = { success: 'bg-emerald-500', error: 'bg-rose-500', info: 'bg-blue-500' };
  const toast = document.createElement('div');
  toast.className = `${colors[type]} text-white rounded-xl shadow-lg px-4 py-3 font-bold text-sm`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showLoading(msg = 'กำลังประมวลผล...') {
  document.getElementById('loading-text').innerText = msg;
  document.getElementById('loading-overlay').classList.remove('hidden');
  document.getElementById('loading-overlay').classList.add('flex');
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
  document.getElementById('loading-overlay').classList.remove('flex');
}

let adminToken = sessionStorage.getItem('committeeToken') || null;
let myPermissions = JSON.parse(sessionStorage.getItem('committeePermissions') || '[]');
let myName = sessionStorage.getItem('committeeName') || '';

async function callCommitteeApi(action, extra = {}) {
  const res = await fetch('/api/committee-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: adminToken, action, ...extra })
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'เกิดข้อผิดพลาด');
  return result;
}

function applyPermissionsToSidebar() {
  document.getElementById('sidebar-user-name').innerText = myName;
  document.querySelectorAll('.module-tab[data-perm]').forEach(btn => {
    const perm = btn.dataset.perm;
    const allowed = myPermissions.includes('all') || myPermissions.includes(perm);
    btn.classList.toggle('hidden', !allowed);
  });
}

if (adminToken) {
  document.getElementById('login-view').classList.remove('active');
  document.getElementById('dashboard-view').classList.add('active');
  applyPermissionsToSidebar();
  switchModule('dashboard');
}

document.getElementById('btn-admin-login').onclick = async () => {
  const memberId = document.getElementById('admin-memberid-input').value.trim();
  const password = document.getElementById('admin-password-input').value;
  const errBox = document.getElementById('login-error');
  errBox.classList.add('hidden');

  if (!memberId || !password) {
    errBox.innerText = 'กรุณากรอกรหัสสมาชิกและรหัสผ่านให้ครบ';
    errBox.classList.remove('hidden');
    return;
  }

  showLoading('กำลังเข้าสู่ระบบ...');
  try {
    const res = await fetch('/api/committee-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, password })
    });
    const result = await res.json();
    hideLoading();

    if (!res.ok) {
      errBox.innerText = result.error || 'เข้าสู่ระบบไม่สำเร็จ';
      errBox.classList.remove('hidden');
      return;
    }

    adminToken = result.token;
    myPermissions = result.permissions;
    myName = result.name;
    sessionStorage.setItem('committeeToken', adminToken);
    sessionStorage.setItem('committeePermissions', JSON.stringify(myPermissions));
    sessionStorage.setItem('committeeName', myName);

    document.getElementById('login-view').classList.remove('active');
    document.getElementById('dashboard-view').classList.add('active');
    applyPermissionsToSidebar();
    switchModule('dashboard');
  } catch (err) {
    hideLoading();
    errBox.innerText = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    errBox.classList.remove('hidden');
  }
};

document.querySelectorAll('.module-tab').forEach(btn => {
  btn.onclick = () => switchModule(btn.dataset.module);
});

function switchModule(name) {
  document.querySelectorAll('.module-tab').forEach(b => b.classList.remove('bg-white/10'));
  const activeBtn = document.querySelector(`[data-module="${name}"]`);
  if (activeBtn) activeBtn.classList.add('bg-white/10');

  document.querySelectorAll('.module-content').forEach(c => c.classList.add('hidden'));
  document.getElementById(`module-${name}`).classList.remove('hidden');

  if (name === 'dashboard') loadDashboard();
  else if (name === 'waste') loadWaste();
}

// ================= Dashboard ภาพรวม =================

let dashCharts = {};
let dashboardStatsCache = null;
let dashProvinceMapInstance = null;

async function loadDashboard() {
  try {
    const stats = await callCommitteeApi('dashboard-stats');
    dashboardStatsCache = stats;

    document.getElementById('dash-total-members').innerText = stats.totalMembers.toLocaleString();
    document.getElementById('dash-waste-count').innerText = stats.wasteParticipants.toLocaleString();
    document.getElementById('dash-www-count').innerText = stats.wwwParticipants.toLocaleString();
    const libraryTotal = Object.values(stats.libraryBranchCount).reduce((a, b) => a + b, 0);
    document.getElementById('dash-library-count').innerText = libraryTotal.toLocaleString();

    renderMemberDailyChart(stats.memberDaily, 30);
    renderProvinceChart(stats.provinceCount);
    renderAgeChart(stats.ageCount);
    renderLibraryBranchChart(stats.libraryBranchCount);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function destroyChart(key) {
  if (dashCharts[key]) { dashCharts[key].destroy(); delete dashCharts[key]; }
}

function renderMemberDailyChart(memberDaily, days) {
  destroyChart('members');
  const entries = Object.entries(memberDaily).slice(-days);
  dashCharts.members = new Chart(document.getElementById('chart-new-members'), {
    type: 'line',
    data: {
      labels: entries.map(([d]) => d.slice(5)),
      datasets: [{ data: entries.map(([, v]) => v), borderColor: '#d81b60', backgroundColor: 'rgba(216,27,96,0.1)', fill: true, tension: 0.3, pointRadius: 0 }]
    },
    options: { plugins: { legend: { display: false } } }
  });
}

document.getElementById('member-range-7').onclick = () => {
  document.getElementById('member-range-7').className = 'px-3 py-1 rounded-full text-xs font-bold theme-pink text-white';
  document.getElementById('member-range-30').className = 'px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600';
  if (dashboardStatsCache) renderMemberDailyChart(dashboardStatsCache.memberDaily, 7);
};
document.getElementById('member-range-30').onclick = () => {
  document.getElementById('member-range-30').className = 'px-3 py-1 rounded-full text-xs font-bold theme-pink text-white';
  document.getElementById('member-range-7').className = 'px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600';
  if (dashboardStatsCache) renderMemberDailyChart(dashboardStatsCache.memberDaily, 30);
};

function renderProvinceChart(provinceCount) {
  destroyChart('province');
  const sorted = Object.entries(provinceCount).sort((a, b) => b[1] - a[1]).slice(0, 15);
  dashCharts.province = new Chart(document.getElementById('chart-province'), {
    type: 'bar',
    data: { labels: sorted.map(([p]) => p), datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: '#d81b60' }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } } }
  });
}

const provinceCoords = {
  'กรุงเทพมหานคร': [13.7563, 100.5018], 'นครปฐม': [13.8196, 100.0645],
  'นนทบุรี': [13.8622, 100.5144], 'ปทุมธานี': [14.0208, 100.5250],
  'สมุทรปราการ': [13.5991, 100.5998], 'ชลบุรี': [13.3611, 100.9847],
  'เชียงใหม่': [18.7883, 98.9853], 'ขอนแก่น': [16.4419, 102.8360]
};

function renderProvinceMap(provinceCount) {
  if (!dashProvinceMapInstance) {
    dashProvinceMapInstance = L.map('province-map').setView([13.7563, 100.5018], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(dashProvinceMapInstance);
  }
  Object.entries(provinceCount).forEach(([prov, count]) => {
    const coords = provinceCoords[prov];
    if (!coords) return;
    L.circleMarker(coords, {
      radius: Math.min(8 + count * 2, 40),
      fillColor: '#d81b60', color: '#fff', weight: 2, fillOpacity: 0.7
    }).bindPopup(`<b>${prov}</b><br>${count} คน`).addTo(dashProvinceMapInstance);
  });
}

document.getElementById('province-view-chart').onclick = () => {
  document.getElementById('province-view-chart').className = 'px-3 py-1 rounded-full text-xs font-bold theme-pink text-white';
  document.getElementById('province-view-map').className = 'px-3 py-1 rounded-full text-xs font-bold text-gray-600';
  document.getElementById('chart-province').classList.remove('hidden');
  document.getElementById('province-map').classList.add('hidden');
};
document.getElementById('province-view-map').onclick = () => {
  document.getElementById('province-view-map').className = 'px-3 py-1 rounded-full text-xs font-bold theme-pink text-white';
  document.getElementById('province-view-chart').className = 'px-3 py-1 rounded-full text-xs font-bold text-gray-600';
  document.getElementById('chart-province').classList.add('hidden');
  document.getElementById('province-map').classList.remove('hidden');
  setTimeout(() => {
    if (dashboardStatsCache) renderProvinceMap(dashboardStatsCache.provinceCount);
    if (dashProvinceMapInstance) dashProvinceMapInstance.invalidateSize();
  }, 100);
};

function renderAgeChart(ageCount) {
  destroyChart('age');
  const labels = Object.keys(ageCount);
  const data = Object.values(ageCount);
  dashCharts.age = new Chart(document.getElementById('chart-age'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: ['#f472b6', '#fb923c', '#facc15', '#4ade80', '#60a5fa', '#a78bfa', '#9ca3af'] }] },
    options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } } }
  });
}

function renderLibraryBranchChart(libraryBranchCount) {
  destroyChart('library');
  const entries = Object.entries(libraryBranchCount);
  dashCharts.library = new Chart(document.getElementById('chart-library-branches'), {
    type: 'bar',
    data: { labels: entries.map(([b]) => b), datasets: [{ data: entries.map(([, v]) => v), backgroundColor: '#3b82f6' }] },
    options: { plugins: { legend: { display: false } } }
  });
}

// ================= Waste to Wealth =================

let allWasteParticipants = [];
let wasteCharts = {};

async function loadWaste() {
  try {
    const { participants, provinceAmountSummary } = await callCommitteeApi('waste-list');
    allWasteParticipants = participants;

    document.getElementById('waste-total-participants').innerText = participants.length.toLocaleString();
    const totalAmount = participants.reduce((sum, p) => sum + p.totalAmount, 0);
    document.getElementById('waste-total-amount').innerText = totalAmount.toLocaleString();

    const topProvince = Object.entries(provinceAmountSummary).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('waste-top-province').innerText = topProvince ? topProvince[0] : '-';

    if (wasteCharts.province) wasteCharts.province.destroy();
    const sorted = Object.entries(provinceAmountSummary).sort((a, b) => b[1] - a[1]).slice(0, 15);
    wasteCharts.province = new Chart(document.getElementById('chart-waste-province'), {
      type: 'bar',
      data: { labels: sorted.map(([p]) => p), datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: '#10b981' }] },
      options: { plugins: { legend: { display: false } } }
    });

    const provinces = [...new Set(participants.map(p => p.province))].filter(p => p !== '-');
    document.getElementById('waste-province-filter').innerHTML =
      '<option value="">ทุกจังหวัด</option>' + provinces.map(p => `<option value="${p}">${p}</option>`).join('');

    renderWasteTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('waste-search').oninput = () => renderWasteTable();
document.getElementById('waste-province-filter').onchange = () => renderWasteTable();

function renderWasteTable() {
  const term = document.getElementById('waste-search').value.trim().toLowerCase();
  const provFilter = document.getElementById('waste-province-filter').value;

  let filtered = allWasteParticipants;
  if (term) {
    filtered = filtered.filter(p => p.name.toLowerCase().includes(term) || p.memberId.toLowerCase().includes(term));
  }
  if (provFilter) {
    filtered = filtered.filter(p => p.province === provFilter);
  }

  const canEdit = myPermissions.includes('all') || myPermissions.includes('wasteToWealth');

  document.getElementById('waste-table-body').innerHTML = filtered.map(p => `
    <tr class="border-t border-gray-100">
      <td class="p-3 font-bold text-gray-800">${p.name}</td>
      <td class="p-3 text-gray-500">${p.memberId}</td>
      <td class="p-3 text-gray-500">${p.province} / ${p.district}</td>
      <td class="p-3 font-bold text-emerald-600">${p.totalAmount.toLocaleString()}</td>
      <td class="p-3 text-gray-500">${p.logCount}</td>
      <td class="p-3 text-gray-400 text-xs">${p.lastLogAt ? new Date(p.lastLogAt).toLocaleDateString('th-TH') : '-'}</td>
      <td class="p-3">
        ${canEdit ? `<button class="text-blue-600 font-bold text-sm underline btn-edit-waste" data-uid="${p.uid}">แก้ไข</button>` : '-'}
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.btn-edit-waste').forEach(btn => {
    btn.onclick = () => openWasteEditModal(btn.dataset.uid);
  });
}

function openWasteEditModal(uid) {
  const p = allWasteParticipants.find(x => x.uid === uid);
  if (!p) return;

  document.getElementById('waste-edit-uid').value = uid;
  document.getElementById('waste-edit-name').innerText = p.name;
  document.getElementById('waste-edit-province').value = p.province === '-' ? '' : p.province;
  document.getElementById('waste-edit-district').value = p.district === '-' ? '' : p.district;
  document.getElementById('waste-edit-subdistrict').value = p.subdistrict === '-' ? '' : p.subdistrict;

  document.getElementById('waste-edit-modal').classList.remove('hidden');
  document.getElementById('waste-edit-modal').classList.add('flex');
}

document.getElementById('btn-close-waste-edit').onclick = () => {
  document.getElementById('waste-edit-modal').classList.add('hidden');
  document.getElementById('waste-edit-modal').classList.remove('flex');
};

document.getElementById('btn-save-waste-edit').onclick = async () => {
  const uid = document.getElementById('waste-edit-uid').value;
  const data = {
    province: document.getElementById('waste-edit-province').value.trim(),
    district: document.getElementById('waste-edit-district').value.trim(),
    subdistrict: document.getElementById('waste-edit-subdistrict').value.trim()
  };

  showLoading('กำลังบันทึก...');
  try {
    const res = await fetch('/api/committee-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: adminToken, action: 'waste-update', uid, data })
    });
    const result = await res.json();
    hideLoading();

    if (!res.ok) { showToast(result.error || 'บันทึกไม่สำเร็จ', 'error'); return; }

    showToast('บันทึกสำเร็จ!', 'success');
    document.getElementById('btn-close-waste-edit').click();
    loadWaste();
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
};