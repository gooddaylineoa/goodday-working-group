import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
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

  const { memberId, password } = req.body;
  if (!memberId || !password) return res.status(400).json({ error: 'กรุณากรอกรหัสสมาชิกและรหัสผ่าน' });

  try {
    const accountDoc = await adminDb.collection('adminAccounts').doc(memberId).get();
    if (!accountDoc.exists) {
      return res.status(401).json({ error: 'รหัสสมาชิกหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const account = accountDoc.data();
    const testHash = crypto.pbkdf2Sync(password, account.salt, 100000, 64, 'sha512').toString('hex');

    if (testHash !== account.passwordHash) {
      return res.status(401).json({ error: 'รหัสสมาชิกหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const permissions = account.committeePermissions || [];
    if (permissions.length === 0) {
      return res.status(403).json({ error: 'บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าใช้งานเว็บคณะทำงาน' });
    }

    const token = jwt.sign(
      { memberId, name: account.name, permissions },
      process.env.ADMIN_JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.status(200).json({ token, name: account.name, permissions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}