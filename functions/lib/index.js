"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.rentalReminderSystem = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const webpush = __importStar(require("web-push"));
const date_fns_1 = require("date-fns");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
/**
 * Motor de notificaciones de alquileres v1.6.7
 * Utiliza los nombres de variables definidos en functions/.env
 */
exports.rentalReminderSystem = (0, scheduler_1.onSchedule)({
    schedule: "every day 09:00",
    timeZone: "America/Argentina/Buenos_Aires",
    memory: "256MiB",
    region: "us-central1",
}, async (event) => {
    const sanitize = (value) => value.replace(/["'\s\n\t]/g, '').trim();
    const pubKey = sanitize(process.env.PUSH_PUBKEY || process.env.VAPID_PUBLIC_KEY || '');
    const privKey = sanitize(process.env.PUSH_PRIVKEY || process.env.VAPID_PRIVATE_KEY || '');
    const mailTo = (process.env.PUSH_MAILTO || process.env.VAPID_MAILTO || '')
        .replace(/["']/g, '')
        .trim();
    console.log("[PUSH] --- INICIANDO CICLO DE ALERTAS v1.6.8 ---");
    if (!pubKey || !privKey || !mailTo) {
        console.error("[PUSH ERROR] Faltan llaves VAPID (PUSH_* o VAPID_* en functions/.env)");
        return;
    }
    try {
        webpush.setVapidDetails(mailTo, pubKey, privKey);
        const today = (0, date_fns_1.startOfToday)();
        const subsSnap = await db.collection("pushSubscriptions").get();
        if (subsSnap.empty) {
            console.log("[PUSH] No hay suscriptores registrados en el sistema.");
            return;
        }
        console.log(`[PUSH] Suscripciones totales encontradas: ${subsSnap.size}`);
        const subsByOrg = {};
        subsSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.orgId) {
                if (!subsByOrg[data.orgId])
                    subsByOrg[data.orgId] = [];
                subsByOrg[data.orgId].push(data);
            }
        });
        for (const orgId of Object.keys(subsByOrg)) {
            console.log(`[PUSH] Procesando Organización: ${orgId}`);
            const settingsSnap = await db.collection("settings").doc(`alerts_${orgId}`).get();
            const settings = settingsSnap.data();
            const maxCheckInDays = settings?.checkInDays ?? 7;
            const maxCheckOutDays = settings?.checkOutDays ?? 3;
            console.log(`[PUSH] Umbrales: In=${maxCheckInDays} días, Out=${maxCheckOutDays} días`);
            const bookingsSnap = await db.collection("bookings")
                .where("orgId", "==", orgId)
                .where("status", "in", ["active", "pending"])
                .get();
            if (bookingsSnap.empty) {
                console.log(`[PUSH] Org ${orgId}: Sin reservas activas o pendientes.`);
                continue;
            }
            console.log(`[PUSH] Org ${orgId}: Analizando ${bookingsSnap.size} reservas.`);
            const [propSnap, tenantSnap] = await Promise.all([
                db.collection("properties").where("orgId", "==", orgId).get(),
                db.collection("tenants").where("orgId", "==", orgId).get()
            ]);
            const propsMap = new Map(propSnap.docs.map(d => [d.id, d.data().name]));
            const tenantsMap = new Map(tenantSnap.docs.map(d => [d.id, d.data().name]));
            const subscriptions = subsByOrg[orgId];
            for (const doc of bookingsSnap.docs) {
                const booking = doc.data();
                const start = booking.startDate ? new Date(booking.startDate) : null;
                const end = booking.endDate ? new Date(booking.endDate) : null;
                const propName = propsMap.get(booking.propertyId) || "Propiedad Desconocida";
                if (!start || !end || isNaN(start.getTime())) {
                    console.log(`[PUSH] Booking ${doc.id} (${propName}): Fecha inválida. Omitiendo.`);
                    continue;
                }
                const diffIn = (0, date_fns_1.differenceInDays)(start, today);
                const diffOut = (0, date_fns_1.differenceInDays)(end, today);
                // Lógica de Check-in
                if (diffIn >= 0 && diffIn <= maxCheckInDays) {
                    const title = `Check-in: ${propName}`;
                    const body = `${tenantsMap.get(booking.tenantId) || "Inquilino"} llega en ${diffIn === 0 ? "HOY" : diffIn + " días"}.`;
                    console.log(`[PUSH] DISPARANDO Check-in para ${propName} (T-${diffIn} días)`);
                    await sendPush(subscriptions, title, body, `in-${doc.id}`);
                }
                // Lógica de Check-out
                if (diffOut >= 0 && diffOut <= maxCheckOutDays) {
                    const title = `Check-out: ${propName}`;
                    const body = `${tenantsMap.get(booking.tenantId) || "Inquilino"} sale en ${diffOut === 0 ? "HOY" : diffOut + " días"}.`;
                    console.log(`[PUSH] DISPARANDO Check-out para ${propName} (T-${diffOut} días)`);
                    await sendPush(subscriptions, title, body, `out-${doc.id}`);
                }
            }
        }
        console.log("[PUSH] --- CICLO COMPLETADO ---");
    }
    catch (error) {
        console.error("[PUSH CRITICAL ERROR]:", error.message);
    }
});
function toWebPushSubscription(data) {
    const keys = data.keys;
    if (typeof data.endpoint !== "string" || !keys?.p256dh || !keys?.auth) {
        throw new Error("Suscripción push incompleta");
    }
    return {
        endpoint: data.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
    };
}
async function sendPush(subscriptions, title, body, tag) {
    const payload = JSON.stringify({
        title,
        body,
        tag,
        url: '/bookings',
        icon: '/icons/icon-192x192.png'
    });
    await Promise.all(subscriptions.map(async (sub) => {
        try {
            await webpush.sendNotification(toWebPushSubscription(sub), payload);
        }
        catch (e) {
            const endpoint = typeof sub.endpoint === "string" ? sub.endpoint : "desconocido";
            console.log(`[PUSH] Error enviando a ${endpoint.substring(0, 30)}...: ${e.statusCode}`);
            if (e.statusCode === 410 || e.statusCode === 404 || e.statusCode === 403 || e.statusCode === 401) {
                console.log(`[PUSH] Eliminando suscripción obsoleta.`);
                const docId = encodeURIComponent(endpoint);
                await db.collection("pushSubscriptions").doc(docId).delete().catch(() => { });
            }
        }
    }));
}
//# sourceMappingURL=index.js.map