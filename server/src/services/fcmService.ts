import type { app as AdminApp } from 'firebase-admin';

let adminMessaging: ReturnType<AdminApp['messaging']> | null = null;

export function initFcm(): void {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[FCM] env vars missing — push notifications disabled');
    return;
  }

  try {
    // Dynamic require so the module is not imported in test environments
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin') as typeof import('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    }
    adminMessaging = admin.app().messaging();
  } catch (err) {
    console.warn('[FCM] init failed:', err);
  }
}

export async function sendPush(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (!adminMessaging) return;

  await adminMessaging.send({
    token: fcmToken,
    notification: { title, body },
    ...(data && { data }),
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } },
  });
}

/** 보호자 전체에게 "누락 발생" 알림을 일괄 발송 */
export async function notifyMissedDose(
  guardianTokens: string[],
  patientEmail: string,
  medicationName: string,
): Promise<void> {
  await Promise.allSettled(
    guardianTokens.map((token) =>
      sendPush(
        token,
        '복용 누락 알림',
        `${patientEmail}님이 ${medicationName} 복용을 놓쳤습니다.`,
        { type: 'missed_dose' },
      ),
    ),
  );
}
