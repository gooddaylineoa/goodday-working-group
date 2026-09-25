import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import jwt from 'jsonwebtoken';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined
    })
  });
}

const adminDb = getFirestore();

function hasPermission(permissions, page) {
  return permissions.includes('all') || permissions.includes(page);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'ใช้ได้เฉพาะ POST เท่านั้น' });

  const { token, action, data, uid } = req.body;

  let payload;
  try {
    payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
  } catch (err) {
    return res.status(403).json({ error: 'session หมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }

  try {
    if (action === 'dashboard-stats') {
      const usersSnap = await adminDb.collection('users').get();

      const provinceCount = {};
      const ageCount = { 'ต่ำกว่า 20': 0, '20-29': 0, '30-39': 0, '40-49': 0, '50-59': 0, '60 ขึ้นไป': 0, 'ไม่ระบุ': 0 };
      const memberDaily = {};
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now); d.setDate(now.getDate() - i);
        memberDaily[d.toISOString().slice(0, 10)] = 0;
      }

      const wasteLogsSnap = await adminDb.collectionGroup('wasteLogs').get();
      const wasteUserIds = new Set();
      wasteLogsSnap.forEach(d => {
        const uid = d.ref.parent.parent.id;
        wasteUserIds.add(uid);
      });

      let wwwParticipants = 0;
      const libraryBranchCount = {};

      usersSnap.forEach(doc => {
        const data = doc.data();

        const prov = data.address?.prov || data.libraryMember?.province;
        if (prov) provinceCount[prov] = (provinceCount[prov] || 0) + 1;

        const age = data.age;
        if (age == null) ageCount['ไม่ระบุ']++;
        else if (age < 20) ageCount['ต่ำกว่า 20']++;
        else if (age < 30) ageCount['20-29']++;
        else if (age < 40) ageCount['30-39']++;
        else if (age < 50) ageCount['40-49']++;
        else if (age < 60) ageCount['50-59']++;
        else ageCount['60 ขึ้นไป']++;

        if (data.createdAt) {
          const dateKey = data.createdAt.toDate().toISOString().slice(0, 10);
          if (memberDaily[dateKey] !== undefined) memberDaily[dateKey]++;
        }

        if (data.wwwRegistration) wwwParticipants++;

        if (data.libraryMember?.joined && data.libraryMember?.branchName) {
          const branch = data.libraryMember.branchName;
          libraryBranchCount[branch] = (libraryBranchCount[branch] || 0) + 1;
        }
      });

      return res.status(200).json({
        totalMembers: usersSnap.size,
        memberDaily,
        provinceCount,
        ageCount,
        wasteParticipants: wasteUserIds.size,
        wwwParticipants,
        libraryBranchCount
      });
    }

    // ================= Waste to Wealth =================

    if (action === 'waste-list') {
      if (!hasPermission(payload.permissions, 'wasteToWealth')) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
      }

      const usersSnap = await adminDb.collection('users').get();
      const wasteLogsSnap = await adminDb.collectionGroup('wasteLogs').get();

      // รวมยอดขยะ+แต้ม แยกตาม uid
      const wasteByUid = {};
      wasteLogsSnap.forEach(d => {
        const uid = d.ref.parent.parent.id;
        const log = d.data();
        if (!wasteByUid[uid]) wasteByUid[uid] = { totalAmount: 0, logCount: 0, lastLogAt: null };
        wasteByUid[uid].totalAmount += log.amount || 0;
        wasteByUid[uid].logCount += 1;
        const logDate = log.createdAt?.toDate ? log.createdAt.toDate() : null;
        if (logDate && (!wasteByUid[uid].lastLogAt || logDate > wasteByUid[uid].lastLogAt)) {
          wasteByUid[uid].lastLogAt = logDate;
        }
      });

      const participants = [];
      usersSnap.forEach(doc => {
        const uid = doc.id;
        if (!wasteByUid[uid]) return; // เอาเฉพาะคนที่มีข้อมูลขยะจริง
        const u = doc.data();
        participants.push({
          uid,
          name: u.name || 'ไม่ระบุชื่อ',
          memberId: u.memberId || '-',
          phone: u.phone || '-',
          province: u.address?.prov || '-',
          district: u.address?.dist || '-',
          subdistrict: u.address?.subdist || '-',
          totalAmount: wasteByUid[uid].totalAmount,
          logCount: wasteByUid[uid].logCount,
          lastLogAt: wasteByUid[uid].lastLogAt ? wasteByUid[uid].lastLogAt.toISOString() : null
        });
      });

      // สรุปยอดรวมแยกจังหวัด (ใช้ทำกราฟ)
      const provinceAmountSummary = {};
      participants.forEach(p => {
        provinceAmountSummary[p.province] = (provinceAmountSummary[p.province] || 0) + p.totalAmount;
      });

      return res.status(200).json({ participants, provinceAmountSummary });
    }

    if (action === 'waste-update') {
      if (!hasPermission(payload.permissions, 'wasteToWealth')) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขข้อมูลนี้' });
      }
      // แก้ไขข้อมูลที่อยู่ของผู้เข้าร่วม (จุดที่คณะทำงานแก้ไขได้จริงตอนนี้)
      await adminDb.collection('users').doc(uid).update({
        'address.prov': data.province,
        'address.dist': data.district,
        'address.subdist': data.subdistrict
      });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'ไม่รู้จัก action นี้' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

    // ================= ห้องสมุด =================

    if (action === 'library-list') {
      if (!hasPermission(payload.permissions, 'library')) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
      }

      const usersSnap = await adminDb.collection('users').get();
      const branchesSnap = await adminDb.collection('libraryBranches').get();

      const branchNames = {};
      branchesSnap.forEach(d => { branchNames[d.id] = d.data().branchName; });

      const participants = [];
      const branchCount = {};

      usersSnap.forEach(doc => {
        const u = doc.data();
        if (!u.libraryMember?.joined) return;

        const branchName = u.libraryMember.branchName || 'ไม่ระบุสาขา';
        branchCount[branchName] = (branchCount[branchName] || 0) + 1;

        participants.push({
          uid: doc.id,
          name: u.name || 'ไม่ระบุชื่อ',
          memberId: u.memberId || '-',
          cardId: u.libraryMember.cardId || '-',
          branchName,
          province: u.libraryMember.province || '-',
          joinedAt: u.libraryMember.joinedAt?.toDate ? u.libraryMember.joinedAt.toDate().toISOString() : null
        });
      });

      return res.status(200).json({ participants, branchCount });
    }