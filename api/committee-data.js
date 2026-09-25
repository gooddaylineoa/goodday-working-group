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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'ใช้ได้เฉพาะ POST เท่านั้น' });

  const { token, action } = req.body;

  try {
    jwt.verify(token, process.env.ADMIN_JWT_SECRET);
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

        // 🔶 สมมติฐาน: เข้าร่วม Well Well Well เช็คจาก field นี้ — แก้ชื่อ field ให้ตรงจริงได้
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

    return res.status(400).json({ error: 'ไม่รู้จัก action นี้' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}