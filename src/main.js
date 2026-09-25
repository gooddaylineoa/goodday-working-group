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
  else if (name === 'www') loadWWW();
  else if (name === 'health') loadHealth();
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

// ================= Well Well Well =================

let allWWWParticipants = [];
let wwwCharts = {};

async function loadWWW() {
  try {
    const { participants } = await callCommitteeApi('www-list');
    allWWWParticipants = participants;

    document.getElementById('www-total-participants').innerText = participants.length.toLocaleString();

    const provinceCount = {};
    participants.forEach(p => {
      provinceCount[p.province] = (provinceCount[p.province] || 0) + 1;
    });
    const topProvince = Object.entries(provinceCount).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('www-top-province').innerText = topProvince ? topProvince[0] : '-';

    if (wwwCharts.province) wwwCharts.province.destroy();
    const sorted = Object.entries(provinceCount).sort((a, b) => b[1] - a[1]).slice(0, 15);
    wwwCharts.province = new Chart(document.getElementById('chart-www-province'), {
      type: 'bar',
      data: { labels: sorted.map(([p]) => p), datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: '#f472b6' }] },
      options: { plugins: { legend: { display: false } } }
    });

    const provinces = [...new Set(participants.map(p => p.province))].filter(p => p !== '-');
    document.getElementById('www-province-filter').innerHTML =
      '<option value="">ทุกจังหวัด</option>' + provinces.map(p => `<option value="${p}">${p}</option>`).join('');

    renderWWWTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('www-search').oninput = () => renderWWWTable();
document.getElementById('www-province-filter').onchange = () => renderWWWTable();

function renderWWWTable() {
  const term = document.getElementById('www-search').value.trim().toLowerCase();
  const provFilter = document.getElementById('www-province-filter').value;

  let filtered = allWWWParticipants;
  if (term) {
    filtered = filtered.filter(p => p.name.toLowerCase().includes(term) || p.memberId.toLowerCase().includes(term));
  }
  if (provFilter) {
    filtered = filtered.filter(p => p.province === provFilter);
  }

  document.getElementById('www-table-body').innerHTML = filtered.map(p => `
    <tr class="border-t border-gray-100">
      <td class="p-3 font-bold text-gray-800">${p.name}</td>
      <td class="p-3 text-gray-500">${p.memberId}</td>
      <td class="p-3 text-gray-500">${p.province}</td>
      <td class="p-3 text-gray-500">${p.age ?? '-'}</td>
      <td class="p-3 text-gray-400 text-xs">${p.registeredAt ? new Date(p.registeredAt).toLocaleDateString('th-TH') : '-'}</td>
      <td class="p-3">
        <button class="text-blue-600 font-bold text-sm underline btn-view-www" data-uid="${p.uid}">ดูรายละเอียด</button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.btn-view-www').forEach(btn => {
    btn.onclick = () => openWWWDetail(btn.dataset.uid);
  });
}

async function openWWWDetail(uid) {
  showLoading('กำลังโหลดข้อมูล...');
  try {
    const res = await fetch('/api/committee-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: adminToken, action: 'www-detail', uid })
    });
    const detail = await res.json();
    hideLoading();

    if (!res.ok) { showToast(detail.error || 'โหลดข้อมูลไม่สำเร็จ', 'error'); return; }

    document.getElementById('wwwd-name').innerText = detail.name;
    document.getElementById('wwwd-sub').innerText = `${detail.memberId} · ${detail.province} · อายุ ${detail.age ?? '-'} ปี`;

    if (wwwCharts.sleep) wwwCharts.sleep.destroy();
    wwwCharts.sleep = new Chart(document.getElementById('chart-www-sleep'), {
      type: 'line',
      data: {
        labels: detail.sleepLogs.map(s => s.date ? s.date.slice(5) : ''),
        datasets: [{ data: detail.sleepLogs.map(s => s.hours), borderColor: '#818cf8', backgroundColor: 'rgba(129,140,248,0.1)', fill: true, tension: 0.3 }]
      },
      options: { plugins: { legend: { display: false } } }
    });

    if (wwwCharts.meal) wwwCharts.meal.destroy();
    wwwCharts.meal = new Chart(document.getElementById('chart-www-meal'), {
      type: 'bar',
      data: {
        labels: detail.mealLogs.map(m => m.date ? m.date.slice(5) : ''),
        datasets: [{ data: detail.mealLogs.map(m => m.calories), backgroundColor: '#fb923c' }]
      },
      options: { plugins: { legend: { display: false } } }
    });

    const healthList = document.getElementById('wwwd-health-list');
    if (detail.healthLogs.length === 0) {
      healthList.innerHTML = '<p class="text-gray-400 py-4">ยังไม่มีประวัติการบันทึกสุขภาพ</p>';
    } else {
      healthList.innerHTML = detail.healthLogs.map(h => `
        <div class="bg-white rounded-xl shadow-sm border p-4">
          <p class="text-sm text-gray-400 font-bold mb-2">${h.createdAt ? new Date(h.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}</p>
          <div class="grid grid-cols-3 gap-3 text-sm">
            <div><p class="text-gray-400">น้ำหนัก</p><p class="font-bold text-gray-800">${h.weight ?? '-'} กก.</p></div>
            <div><p class="text-gray-400">ส่วนสูง</p><p class="font-bold text-gray-800">${h.height ?? '-'} ซม.</p></div>
            <div><p class="text-gray-400">BMI</p><p class="font-bold text-gray-800">${h.bmi ?? '-'}</p></div>
            <div><p class="text-gray-400">ความดัน</p><p class="font-bold text-gray-800">${h.bloodPressure ?? '-'}</p></div>
            <div><p class="text-gray-400">ความเสี่ยงหัวใจ</p><p class="font-bold text-gray-800">${h.cvRisk ?? '-'}</p></div>
            <div><p class="text-gray-400">TDEE</p><p class="font-bold text-gray-800">${h.tdee ?? '-'}</p></div>
          </div>
        </div>
      `).join('');
    }

    document.querySelectorAll('.module-tab').forEach(b => b.classList.remove('bg-white/10'));
    document.querySelectorAll('.module-content').forEach(c => c.classList.add('hidden'));
    document.getElementById('module-www-detail').classList.remove('hidden');
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
}

document.getElementById('btn-back-www-detail').onclick = () => switchModule('www');

    // ================= Well Well Well =================

    if (action === 'www-list') {
      if (!hasPermission(payload.permissions, 'wellWellWell')) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
      }

      const usersSnap = await adminDb.collection('users').get();
      const participants = [];

      usersSnap.forEach(doc => {
        const u = doc.data();
        // 🔶 สมมติฐาน: เข้าร่วม Well Well Well เช็คจาก field นี้ — แก้ให้ตรงจริงได้
        if (!u.wwwRegistration) return;

        participants.push({
          uid: doc.id,
          name: u.name || 'ไม่ระบุชื่อ',
          memberId: u.memberId || '-',
          province: u.address?.prov || '-',
          age: u.age ?? null,
          registeredAt: u.wwwRegistration?.registeredAt
            ? u.wwwRegistration.registeredAt.toDate().toISOString()
            : null
        });
      });

      return res.status(200).json({ participants });
    }

    if (action === 'www-detail') {
      if (!hasPermission(payload.permissions, 'wellWellWell')) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
      }

      const userDoc = await adminDb.collection('users').doc(uid).get();
      if (!userDoc.exists) return res.status(404).json({ error: 'ไม่พบข้อมูลสมาชิก' });
      const u = userDoc.data();

      const [healthSnap, sleepSnap, mealSnap] = await Promise.all([
        adminDb.collection('users').doc(uid).collection('healthLogs').orderBy('createdAt', 'desc').get(),
        adminDb.collection('users').doc(uid).collection('sleepLogs').orderBy('createdAt', 'desc').limit(30).get(),
        adminDb.collection('users').doc(uid).collection('mealLogs').orderBy('createdAt', 'desc').limit(30).get()
      ]);

      const healthLogs = [];
      healthSnap.forEach(d => {
        const h = d.data();
        healthLogs.push({
          id: d.id,
          createdAt: h.createdAt?.toDate ? h.createdAt.toDate().toISOString() : null,
          // 🔶 สมมติฐาน: field ผลลัพธ์แบบฟอร์มสุขภาพ — แก้ให้ตรงจริงได้
          weight: h.weight ?? null,
          height: h.height ?? null,
          bmi: h.bmi ?? null,
          bloodPressure: h.bloodPressure ?? null,
          cvRisk: h.cvRisk ?? null,
          tdee: h.tdee ?? null
        });
      });

      const sleepLogs = [];
      sleepSnap.forEach(d => {
        const s = d.data();
        sleepLogs.push({
          date: s.date || (s.createdAt?.toDate ? s.createdAt.toDate().toISOString().slice(0, 10) : null),
          // 🔶 สมมติฐาน: ชั่วโมงนอน
          hours: s.hours ?? s.sleepHours ?? null
        });
      });

      const mealLogs = [];
      mealSnap.forEach(d => {
        const m = d.data();
        mealLogs.push({
          date: m.date || (m.createdAt?.toDate ? m.createdAt.toDate().toISOString().slice(0, 10) : null),
          // 🔶 สมมติฐาน: แคลอรี่ที่กิน
          calories: m.calories ?? null,
          mealName: m.mealName || m.name || '-'
        });
      });

      return res.status(200).json({
        name: u.name || 'ไม่ระบุชื่อ',
        memberId: u.memberId || '-',
        province: u.address?.prov || '-',
        age: u.age ?? null,
        healthLogs,
        sleepLogs: sleepLogs.reverse(),
        mealLogs: mealLogs.reverse()
      });
    }

        // ================= บันทึกสุขภาพ =================

    if (action === 'health-list') {
      if (!hasPermission(payload.permissions, 'health')) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
      }

      const usersSnap = await adminDb.collection('users').get();
      const healthLogsSnap = await adminDb.collectionGroup('healthLogs').get();

      const summaryByUid = {};
      healthLogsSnap.forEach(d => {
        const uid = d.ref.parent.parent.id;
        const log = d.data();
        if (!summaryByUid[uid]) summaryByUid[uid] = { logCount: 0, lastLogAt: null };
        summaryByUid[uid].logCount += 1;
        const logDate = log.createdAt?.toDate ? log.createdAt.toDate() : null;
        if (logDate && (!summaryByUid[uid].lastLogAt || logDate > summaryByUid[uid].lastLogAt)) {
          summaryByUid[uid].lastLogAt = logDate;
        }
      });

      const participants = [];
      usersSnap.forEach(doc => {
        const uid = doc.id;
        if (!summaryByUid[uid]) return; // เอาเฉพาะคนที่เคยกรอกจริง
        const u = doc.data();
        participants.push({
          uid,
          name: u.name || 'ไม่ระบุชื่อ',
          memberId: u.memberId || '-',
          province: u.address?.prov || '-',
          age: u.age ?? null,
          logCount: summaryByUid[uid].logCount,
          lastLogAt: summaryByUid[uid].lastLogAt ? summaryByUid[uid].lastLogAt.toISOString() : null
        });
      });

      return res.status(200).json({ participants });
    }

    if (action === 'health-detail') {
      if (!hasPermission(payload.permissions, 'health')) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
      }

      const userDoc = await adminDb.collection('users').doc(uid).get();
      if (!userDoc.exists) return res.status(404).json({ error: 'ไม่พบข้อมูลสมาชิก' });
      const u = userDoc.data();

      const healthSnap = await adminDb.collection('users').doc(uid).collection('healthLogs').orderBy('createdAt', 'desc').get();

      const healthLogs = [];
      healthSnap.forEach(d => {
        const h = d.data();
        healthLogs.push({
          id: d.id,
          createdAt: h.createdAt?.toDate ? h.createdAt.toDate().toISOString() : null,
          // 🔶 สมมติฐาน field ผลลัพธ์แบบฟอร์มสุขภาพ — แก้ให้ตรงจริงได้
          weight: h.weight ?? null,
          height: h.height ?? null,
          bmi: h.bmi ?? null,
          bloodPressure: h.bloodPressure ?? null,
          cvRisk: h.cvRisk ?? null,
          tdee: h.tdee ?? null
        });
      });

      return res.status(200).json({
        name: u.name || 'ไม่ระบุชื่อ',
        memberId: u.memberId || '-',
        province: u.address?.prov || '-',
        age: u.age ?? null,
        healthLogs
      });
    }

// ================= บันทึกสุขภาพ =================

let allHealthParticipants = [];

async function loadHealth() {
  try {
    const { participants } = await callCommitteeApi('health-list');
    allHealthParticipants = participants;

    document.getElementById('health-total-participants').innerText = participants.length.toLocaleString();
    const totalLogs = participants.reduce((sum, p) => sum + p.logCount, 0);
    document.getElementById('health-total-logs').innerText = totalLogs.toLocaleString();

    const provinces = [...new Set(participants.map(p => p.province))].filter(p => p !== '-');
    document.getElementById('health-province-filter').innerHTML =
      '<option value="">ทุกจังหวัด</option>' + provinces.map(p => `<option value="${p}">${p}</option>`).join('');

    renderHealthTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('health-search').oninput = () => renderHealthTable();
document.getElementById('health-province-filter').onchange = () => renderHealthTable();

function renderHealthTable() {
  const term = document.getElementById('health-search').value.trim().toLowerCase();
  const provFilter = document.getElementById('health-province-filter').value;

  let filtered = allHealthParticipants;
  if (term) {
    filtered = filtered.filter(p => p.name.toLowerCase().includes(term) || p.memberId.toLowerCase().includes(term));
  }
  if (provFilter) {
    filtered = filtered.filter(p => p.province === provFilter);
  }

  document.getElementById('health-table-body').innerHTML = filtered.map(p => `
    <tr class="border-t border-gray-100">
      <td class="p-3 font-bold text-gray-800">${p.name}</td>
      <td class="p-3 text-gray-500">${p.memberId}</td>
      <td class="p-3 text-gray-500">${p.province}</td>
      <td class="p-3 text-gray-500">${p.logCount}</td>
      <td class="p-3 text-gray-400 text-xs">${p.lastLogAt ? new Date(p.lastLogAt).toLocaleDateString('th-TH') : '-'}</td>
      <td class="p-3">
        <button class="text-blue-600 font-bold text-sm underline btn-view-health" data-uid="${p.uid}">ดูรายละเอียด</button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.btn-view-health').forEach(btn => {
    btn.onclick = () => openHealthDetail(btn.dataset.uid);
  });
}

async function openHealthDetail(uid) {
  showLoading('กำลังโหลดข้อมูล...');
  try {
    const res = await fetch('/api/committee-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: adminToken, action: 'health-detail', uid })
    });
    const detail = await res.json();
    hideLoading();

    if (!res.ok) { showToast(detail.error || 'โหลดข้อมูลไม่สำเร็จ', 'error'); return; }

    document.getElementById('healthd-name').innerText = detail.name;
    document.getElementById('healthd-sub').innerText = `${detail.memberId} · ${detail.province} · อายุ ${detail.age ?? '-'} ปี`;

    const list = document.getElementById('healthd-list');
    if (detail.healthLogs.length === 0) {
      list.innerHTML = '<p class="text-gray-400 py-4">ยังไม่มีประวัติการบันทึกสุขภาพ</p>';
    } else {
      list.innerHTML = detail.healthLogs.map(h => `
        <div class="bg-white rounded-xl shadow-sm border p-4">
          <p class="text-sm text-gray-400 font-bold mb-2">${h.createdAt ? new Date(h.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}</p>
          <div class="grid grid-cols-3 gap-3 text-sm">
            <div><p class="text-gray-400">น้ำหนัก</p><p class="font-bold text-gray-800">${h.weight ?? '-'} กก.</p></div>
            <div><p class="text-gray-400">ส่วนสูง</p><p class="font-bold text-gray-800">${h.height ?? '-'} ซม.</p></div>
            <div><p class="text-gray-400">BMI</p><p class="font-bold text-gray-800">${h.bmi ?? '-'}</p></div>
            <div><p class="text-gray-400">ความดัน</p><p class="font-bold text-gray-800">${h.bloodPressure ?? '-'}</p></div>
            <div><p class="text-gray-400">ความเสี่ยงหัวใจ</p><p class="font-bold text-gray-800">${h.cvRisk ?? '-'}</p></div>
            <div><p class="text-gray-400">TDEE</p><p class="font-bold text-gray-800">${h.tdee ?? '-'}</p></div>
          </div>
        </div>
      `).join('');
    }

    document.querySelectorAll('.module-tab').forEach(b => b.classList.remove('bg-white/10'));
    document.querySelectorAll('.module-content').forEach(c => c.classList.add('hidden'));
    document.getElementById('module-health-detail').classList.remove('hidden');
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
}

document.getElementById('btn-back-health-detail').onclick = () => switchModule('health');