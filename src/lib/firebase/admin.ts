import { initializeApp, getApps, cert, App, getApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth as getFirebaseAdminAuth, Auth } from 'firebase-admin/auth';
import { createPrivateKey } from 'crypto';

/**
 * Reconstruye una clave privada PEM de forma ultra-robusta.
 * Este método soluciona el problema de los '\n' literales y comillas
 * que Netlify, Cloud Run y archivos .env introducen al procesar variables de entorno.
 */
function formatPrivateKey(key: string | undefined): string {
  if (!key) return '';
  
  let cleaned = key.trim();
  while ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  cleaned = cleaned
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const header = '-----BEGIN PRIVATE KEY-----';
  const footer = '-----END PRIVATE KEY-----';

  if (!cleaned.includes('BEGIN PRIVATE KEY')) {
    cleaned = `${header}\n${cleaned}\n${footer}\n`;
  }

  if (!cleaned.endsWith('\n')) {
    cleaned += '\n';
  }

  return cleaned;
}

function isValidPEMPrivateKey(key: string): boolean {
  try {
    createPrivateKey(key);
    return true;
  } catch {
    return false;
  }
}

function initializeFirebaseAdmin(): App {
  const ADMIN_APP_NAME = 'regentum-admin';
  const existingApp = getApps().find(app => app.name === ADMIN_APP_NAME);
  if (existingApp) return existingApp;

  const projectId = process.env.FB_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'miramar-rentals-manager';
  const clientEmail = (process.env.FB_CLIENT_EMAIL || '').trim();
  const rawKey = process.env.FB_PRIVATE_KEY;
  const privateKey = formatPrivateKey(rawKey);

  // 1. En entornos Google Cloud / Firebase Hosting (Cloud Run, Cloud Functions),
  // se deben usar preferentemente las credenciales por defecto del entorno (ADC)
  const isGoogleCloud = Boolean(
    process.env.K_SERVICE || 
    process.env.FUNCTION_NAME || 
    process.env.FIREBASE_CONFIG ||
    process.env.GOOGLE_CLOUD_PROJECT
  );

  if (isGoogleCloud) {
    try {
      return initializeApp({
        projectId: projectId,
        storageBucket: `${projectId}.firebasestorage.app`
      }, ADMIN_APP_NAME);
    } catch (e: any) {
      console.warn("[ADMIN SDK] Falló inicialización ADC en Google Cloud, reintentando con certificado:", e?.message);
    }
  }

  // 2. Si no estamos en Google Cloud (ej. Netlify, local) o si ADC no funcionó,
  // intentamos con certificado explícito solo si la llave es sintácticamente válida
  if (clientEmail && privateKey.includes('BEGIN PRIVATE KEY') && isValidPEMPrivateKey(privateKey)) {
    try {
      return initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        storageBucket: `${projectId}.firebasestorage.app`
      }, ADMIN_APP_NAME);
    } catch (e: any) {
      console.error("[ADMIN SDK] Error en inicialización con certificado:", e?.message);
    }
  }

  // 3. Fallback final para cualquier otro entorno
  if (getApps().length > 0) return getApp();
  
  try {
    return initializeApp({
      projectId: projectId,
      storageBucket: `${projectId}.firebasestorage.app`
    }, ADMIN_APP_NAME);
  } catch (e) {
    console.error("[ADMIN SDK] Falló inicialización por defecto:", e);
    throw new Error("No se pudieron configurar las credenciales administrativas de Firebase.");
  }
}

export const getDb = (): Firestore => {
  const app = initializeFirebaseAdmin();
  return getFirestore(app);
};

export const getAuth = (): Auth => {
  const app = initializeFirebaseAdmin();
  return getFirebaseAdminAuth(app);
};
