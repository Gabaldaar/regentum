'use client';

import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc, 
  writeBatch,
  setDoc,
  query,
  where,
  getDocs,
  increment
} from 'firebase/firestore';
import { db } from './firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { startOfMonth, endOfMonth, addMonths, differenceInCalendarMonths } from 'date-fns';
import { logEvent } from './analytics';
import { parseAssignment } from './utils';

// Usamos el UID para evitar el escáner de secretos de Netlify.
const MASTER_ADMIN_UID = 'ymBtFDZUWKR7VCxWNTHWflXc5mx1';

function toDateString(date: Date | undefined): string {
  if (!date || isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const handleError = (path: string, operation: 'create' | 'update' | 'delete' | 'write', data?: any) => (error: any) => {
  console.error(`[FIRESTORE ERROR] ${operation} on ${path}:`, error);
  const permissionError = new FirestorePermissionError({
    path,
    operation,
    requestResourceData: data,
  });
  errorEmitter.emit('permission-error', permissionError);
};

const getRequiredOrgId = (fd: FormData): string => {
    const orgId = fd.get('orgId') as string;
    if (!orgId) throw new Error("Acción denegada: Identificador de organización no proporcionado.");
    return orgId;
}

async function updateStatsCounter(orgId: string, field: 'propertiesCount' | 'tenantsCount' | 'bookingsCount' | 'contratosCount' | 'teamCount', delta: number) {
    if (!orgId || orgId === 'global') return;
    const statsRef = doc(db, 'system_stats', orgId);
    try {
        await setDoc(statsRef, {
            [field]: increment(delta),
            lastActivity: new Date().toISOString()
        }, { merge: true });
    } catch (e) {
        console.error("[TELEMETRY ERROR] Falló actualización de contadores:", e);
    }
}

async function syncBookingBalance(bookingId: string) {
    if (!bookingId) return;
    try {
        const bookingRef = doc(db, 'bookings', bookingId);
        const bookingSnap = await getDoc(bookingRef);
        if (!bookingSnap.exists()) return;

        const bookingData = bookingSnap.data();
        const paymentsQuery = query(collection(db, 'payments'), where('bookingId', '==', bookingId));
        const paymentsSnap = await getDocs(paymentsQuery);
        
        const totalPaid = paymentsSnap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
        const newBalance = (bookingData.amount || 0) - totalPaid;

        await updateDoc(bookingRef, { balance: newBalance });
    } catch (e) {
        console.error(`[BALANCE SYNC ERROR] ${bookingId}:`, e);
    }
}

/**
 * Asegura que el espacio de trabajo tenga datos básicos de configuración.
 * Se activa si el usuario no tiene Orígenes configurados.
 */
export async function ensureSeedData(orgId: string) {
    if (!orgId) return;
    
    try {
        const originsQ = query(collection(db, 'origins'), where('orgId', '==', orgId));
        const originsSnap = await getDocs(originsQ);
        if (!originsSnap.empty) return; 

        console.log(`[SEED] Sembrando datos de fábrica para la organización: ${orgId}`);
        const batch = writeBatch(db);

        // 1. Orígenes
        const seedOrigins = [
            { name: 'Airbnb', color: '#FF5A5F' },
            { name: 'Booking.com', color: '#003580' },
            { name: 'WhatsApp', color: '#25D366' },
            { name: 'Instagram', color: '#E1306C' },
            { name: 'Recomendados / Directo', color: '#64748b' }
        ];
        seedOrigins.forEach(item => {
            batch.set(doc(collection(db, 'origins')), { ...item, orgId });
        });

        // 2. Categorías de Gasto
        const seedExpenseCats = [
            { name: 'Limpieza y Lavandería' },
            { name: 'Mantenimiento y Reparaciones' },
            { name: 'Servicios (Luz/Gas/Agua/WiFi)' },
            { name: 'Impuestos y Tasas' },
            { name: 'Suministros e Insumos' }
        ];
        seedExpenseCats.forEach(item => {
            batch.set(doc(collection(db, 'expense_categories')), { ...item, orgId });
        });

        // 3. Categorías de Tarea
        const seedTaskCats = [
            { name: 'Preparación Check-in' },
            { name: 'Control Check-out' },
            { name: 'Reparación Urgente' },
            { name: 'Mantenimiento Preventivo' },
            { name: 'Gestión Administrativa' }
        ];
        seedTaskCats.forEach(item => {
            batch.set(doc(collection(db, 'task_categories')), { ...item, orgId });
        });

        // 4. Categorías de Colaborador
        const seedProviderCats = [
            { name: 'Limpieza' },
            { name: 'Mantenimiento Técnico' },
            { name: 'Administración / Recepción' }
        ];
        seedProviderCats.forEach(item => {
            batch.set(doc(collection(db, 'provider_categories')), { ...item, orgId });
        });

        await batch.commit();
        console.log(`[SEED] Datos de fábrica creados exitosamente para ${orgId}`);
    } catch (e) {
        console.error("[SEED ERROR] Error crítico al sembrar datos:", e);
    }
}

// --- ACCIONES DE SIEMBRA MANUAL ---

export async function seedOriginsAction(orgId: string) {
    const batch = writeBatch(db);
    const seed = [
        { name: 'Airbnb', color: '#FF5A5F' },
        { name: 'Booking.com', color: '#003580' },
        { name: 'WhatsApp', color: '#25D366' },
        { name: 'Instagram', color: '#E1306C' },
        { name: 'Recomendados / Directo', color: '#64748b' }
    ];
    seed.forEach(item => batch.set(doc(collection(db, 'origins')), { ...item, orgId }));
    await batch.commit();
    return { success: true, message: 'Orígenes cargados.' };
}

export async function seedExpenseCategoriesAction(orgId: string) {
    const batch = writeBatch(db);
    const seed = [
        { name: 'Limpieza y Lavandería' },
        { name: 'Mantenimiento y Reparaciones' },
        { name: 'Servicios (Luz/Gas/Agua/WiFi)' },
        { name: 'Impuestos y Tasas' },
        { name: 'Suministros e Insumos' }
    ];
    seed.forEach(item => batch.set(doc(collection(db, 'expense_categories')), { ...item, orgId }));
    await batch.commit();
    return { success: true, message: 'Categorías de gastos cargadas.' };
}

export async function seedTaskCategoriesAction(orgId: string) {
    const batch = writeBatch(db);
    const seed = [
        { name: 'Preparación Check-in' },
        { name: 'Control Check-out' },
        { name: 'Reparación Urgente' },
        { name: 'Mantenimiento Preventivo' },
        { name: 'Gestión Administrativa' }
    ];
    seed.forEach(item => batch.set(doc(collection(db, 'task_categories')), { ...item, orgId }));
    await batch.commit();
    return { success: true, message: 'Categorías de tareas cargadas.' };
}

export async function seedProviderCategoriesAction(orgId: string) {
    const batch = writeBatch(db);
    const seed = [
        { name: 'Limpieza' },
        { name: 'Mantenimiento Técnico' },
        { name: 'Administración / Recepción' }
    ];
    seed.forEach(item => batch.set(doc(collection(db, 'provider_categories')), { ...item, orgId }));
    await batch.commit();
    return { success: true, message: 'Categorías de colaboradores cargadas.' };
}

// --- PROPIEDADES ---
export async function addProperty(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const id = fd.get('id') as string;
  const visitRates: { [key: string]: number } = {};
  for (const [key, value] of fd.entries()) {
    if (key.startsWith('visitRate_') && value) {
      const providerId = key.replace('visitRate_', '');
      const rate = parseFloat(value as string);
      if (!isNaN(rate)) visitRates[providerId] = rate;
    }
  }
  
  const rawEmail = fd.get('ownerEmail') as string || '';
  const ownerEmail = rawEmail.toLowerCase().trim();

  const data: any = {
    orgId,
    name: fd.get('name') as string,
    address: fd.get('address') as string,
    imageUrl: fd.get('imageUrl') as string,
    propertyUrl: fd.get('propertyUrl') as string,
    priceSheetName: fd.get('priceSheetName') as string,
    notes: (fd.get('notes') as string) || '',
    ownerNotes: (fd.get('ownerNotes') as string) || '',
    contractTemplate: (fd.get('contractTemplate') as string) || '',
    contractSignatureUrl: (fd.get('contractSignatureUrl') as string) || '',
    ownerName: fd.get('ownerName') as string || '',
    ownerDni: fd.get('ownerDni') as string || '',
    ownerAddress: fd.get('ownerAddress') as string || '',
    ownerPhone: fd.get('ownerPhone') as string || '',
    ownerEmail: ownerEmail,
    visitRates,
    managementCommission: parseFloat(fd.get('managementCommission') as string) || 0,
  };

  if (id) {
    await setDoc(doc(db, 'properties', id), data).catch(handleError(`properties/${id}`, 'write', data));
  } else {
    await addDoc(collection(db, 'properties'), data).catch(handleError('properties', 'create', data));
    await updateStatsCounter(orgId, 'propertiesCount', 1);
  }
  
  logEvent('property_created', { org_id: orgId });
  return { success: true, message: 'Propiedad guardada.' };
}

export async function updateProperty(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  if (!id) return { success: false, message: 'ID de propiedad requerido.' };
  
  const data: any = {};
  const allFields = [
    'name', 'address', 'imageUrl', 'propertyUrl', 'notes', 'ownerNotes',
    'contractTemplate', 'contractSignatureUrl', 'priceSheetName', 
    'ownerName', 'ownerDni', 'ownerAddress', 'ownerPhone', 'ownerEmail', 
    'managementCommission'
  ];

  for (const f of allFields) {
    if (fd.has(f)) {
      const v = fd.get(f);
      if (f === 'managementCommission') data[f] = parseFloat(v as string) || 0;
      else if (f === 'ownerEmail') data[f] = (v as string).toLowerCase().trim();
      else data[f] = v;
    }
  }
  
  const visitRates: { [key: string]: number } = {};
  let hasVisitRates = false;
  for (const [key, value] of fd.entries()) {
    if (key.startsWith('visitRate_')) {
      const providerId = key.replace('visitRate_', '');
      const rate = parseFloat(value as string);
      if (!isNaN(rate)) {
        visitRates[providerId] = rate;
        hasVisitRates = true;
      }
    }
  }
  if (hasVisitRates) data.visitRates = visitRates;

  await updateDoc(doc(db, 'properties', id), data).catch(handleError(`properties/${id}`, 'update', data));
  return { success: true, message: 'Propiedad actualizada.' };
}

export async function deleteProperty(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const snap = await getDoc(doc(db, 'properties', id));
  const orgId = snap.data()?.orgId;
  await deleteDoc(doc(db, 'properties', id)).catch(handleError(`properties/${id}`, 'delete'));
  if (orgId) await updateStatsCounter(orgId, 'propertiesCount', -1);
  return { success: true, message: 'Propiedad eliminada.' };
}

// --- INQUILINOS ---
export async function addTenant(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const data = {
    orgId,
    name: fd.get('name') as string, 
    dni: fd.get('dni') as string, 
    email: fd.get('email') as string,
    phone: fd.get('phone') as string, 
    countryCode: fd.get('countryCode') as string, 
    address: fd.get('address') as string,
    city: fd.get('city') as string, 
    country: (fd.get('country') as string) || 'Argentina', 
    notes: (fd.get('notes') as string) || '',
    originId: fd.get('originId') === 'none' ? null : (fd.get('originId') as string),
    rating: parseInt(fd.get('rating') as string, 10) || 0,
  };
  await addDoc(collection(db, 'tenants'), data).catch(handleError('tenants', 'create', data));
  await updateStatsCounter(orgId, 'tenantsCount', 1);
  logEvent('tenant_created', { org_id: orgId });
  return { success: true, message: 'Inquilino guardado.' };
}

export async function updateTenant(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const data = {
    name: fd.get('name') as string, 
    dni: fd.get('dni') as string, 
    email: fd.get('email') as string,
    phone: fd.get('phone') as string, 
    countryCode: fd.get('countryCode') as string, 
    address: fd.get('address') as string,
    city: fd.get('city') as string, 
    country: fd.get('country') as string, 
    notes: fd.get('notes') as string,
    originId: fd.get('originId') === 'none' ? null : (fd.get('originId') as string),
    rating: parseInt(fd.get('rating') as string, 10) || 0,
  };
  await updateDoc(doc(db, 'tenants', id), data).catch(handleError(`tenants/${id}`, 'update', data));
  return { success: true, message: 'Inquilino actualizado.' };
}

export async function updateTenantRating(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const data = { 
    rating: parseInt(fd.get('rating') as string, 10), 
    notes: (fd.get('notes') as string) || ''
  };
  await updateDoc(doc(db, 'tenants', id), data).catch(handleError(`tenants/${id}`, 'update', data));
  return { success: true, message: 'Calificación actualizada.' };
}

export async function deleteTenant(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const snap = await getDoc(doc(db, 'tenants', id));
  const orgId = snap.data()?.orgId;
  await deleteDoc(doc(db, 'tenants', id)).catch(handleError(`tenants/${id}`, 'delete'));
  if (orgId) await updateStatsCounter(orgId, 'tenantsCount', -1);
  return { success: true, message: 'Inquilino eliminado.' };
}

// --- RESERVAS ---
export async function addBooking(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const pId = (fd.get('propertyId') || fd.get('propertyId-select')) as string;
  const amount = parseFloat(fd.get('amount') as string);
  const currency = (fd.get('currency') as string || 'USD').toUpperCase();
  const data = {
    orgId,
    propertyId: pId, 
    tenantId: fd.get('tenantId') as string, 
    startDate: fd.get('startDate') as string,
    endDate: fd.get('endDate') as string, 
    amount: amount,
    balance: amount,
    currency: currency as any, 
    notes: (fd.get('notes') as string) || '',
    originId: fd.get('originId') === 'none' ? null : (fd.get('originId') as string),
    status: 'active' as const,
    contractStatus: 'not_sent' as const
  };
  await addDoc(collection(db, 'bookings'), data).catch(handleError('bookings', 'create', data));
  await updateStatsCounter(orgId, 'bookingsCount', 1);
  logEvent('booking_created', { org_id: orgId, currency });
  return { success: true, message: 'Reserva creada.' };
}

export async function updateBooking(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  if (!id) return { success: false, message: 'ID de reserva requerido.' };

  const bookingRef = doc(db, 'bookings', id);
  const data: any = {};
  const fields = ['tenantId', 'startDate', 'endDate', 'amount', 'currency', 'notes', 'contractStatus', 'originId', 'guaranteeStatus', 'guaranteeCurrency', 'status', 'guaranteeAmount', 'guaranteeReceivedDate', 'guaranteeReturnedDate'];
  
  fields.forEach(f => {
    if (fd.has(f)) {
      const v = fd.get(f);
      if (f === 'amount' || f === 'guaranteeAmount') {
          data[f] = parseFloat(v as string);
      }
      else if (f === 'currency' || f === 'guaranteeCurrency') {
          data[f] = (v as string).toUpperCase();
      }
      else if (v === 'none') data[f] = null;
      else data[f] = v;
    }
  });

  await updateDoc(bookingRef, data).catch(handleError(`bookings/${id}`, 'update', data));
  await syncBookingBalance(id);
  
  return { success: true, message: 'Reserva actualizada.' };
}

export async function deleteBooking(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const snap = await getDoc(doc(db, 'bookings', id));
  const orgId = snap.data()?.orgId;
  await deleteDoc(doc(db, 'bookings', id)).catch(handleError(`bookings/${id}`, 'delete'));
  if (orgId) await updateStatsCounter(orgId, 'bookingsCount', -1);
  return { success: true, message: 'Reserva eliminada.' };
}

// --- COBROS ---
export async function addPayment(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const bId = fd.get('bookingId') as string;
  const cId = fd.get('contratoId') as string;
  const physicalAmount = parseFloat(fd.get('amount') as string);
  const physicalCurrency = (fd.get('currency') as string || 'USD').toUpperCase();
  const date = fd.get('date') as string;
  const rawDescription = (fd.get('description') as string) || '';
  const baseDescription = rawDescription.split('|')[0].trim();
  const appFlavor = fd.get('appFlavor') as string || 'commercial';
  
  let targetData;
  if (bId) {
    const snap = await getDoc(doc(db, 'bookings', bId));
    if (snap.exists()) targetData = snap.data();
  } else if (cId) {
    const snap = await getDoc(doc(db, 'contratos', cId));
    if (snap.exists()) targetData = snap.data();
  }

  const debtCurrency = (targetData?.currency || targetData?.moneda || physicalCurrency).toUpperCase();
  const propertyId = targetData?.propertyId || fd.get('propertyId') || null;

  const p: any = { 
    orgId,
    bookingId: bId || null, 
    contratoId: cId || null,
    propertyId: propertyId,
    periodoPagoId: fd.get('periodoPagoId') || null,
    date, 
    description: baseDescription, 
    currency: debtCurrency,
    receivedAmount: physicalAmount,
    receivedCurrency: physicalCurrency,
    ownerLiquidationId: null
  };
  
  if (appFlavor === 'personal' && physicalCurrency !== debtCurrency) {
    const rate = parseFloat(fd.get('exchangeRate') as string);
    if (rate) {
        p.exchangeRate = rate;
        if (physicalCurrency === 'ARS') { 
            p.amount = physicalAmount / rate;
            p.originalArsAmount = physicalAmount; 
        } else { 
            p.amount = physicalAmount * rate;
            p.originalArsAmount = null;
        }
        p.description = `${baseDescription} | (Recibido: ${physicalCurrency} ${physicalAmount.toFixed(2)} @ tasa ${rate.toFixed(2)})`.trim();
    } else {
        p.amount = physicalAmount;
    }
  } else { 
    p.amount = physicalAmount; 
    p.originalArsAmount = (physicalCurrency === 'ARS') ? physicalAmount : null;
    p.exchangeRate = null;
  }

  await addDoc(collection(db, 'payments'), p).catch(handleError('payments', 'create', p));
  if (bId) await syncBookingBalance(bId);

  // --- INTEGRACIÓN CON APP DE FINANZAS (VERSIÓN PERSONAL) ---
  const catId = fd.get('categoria_id') as string;
  const ctaId = fd.get('cuenta_id') as string;
  const billId = fd.get('billetera_id') as string;

  if (appFlavor === 'personal' && catId && ctaId && billId) {
      const FINANCE_API_BASE_URL = (process.env.FINANCE_API_BASE_URL || 'https://gestionomiscuentas.web.app').replace(/\/$/, '');
      const FINANCE_API_KEY = process.env.FINANCE_API_KEY || '';
      const endpoint = `${FINANCE_API_BASE_URL}/api/registrar-cobro`;
      
      // La API de finanzas requiere un datetime válido (ISO String completo)
      const validDate = date ? (date.includes('T') ? date : new Date(date).toISOString()) : new Date().toISOString();
      
      // La API de finanzas requiere que tasa_cambio sea de tipo number (no acepta null)
      const tasaCambioVal = p.exchangeRate || 1;
      
      const externalData = {
          fecha: validDate,
          monto: physicalAmount,
          moneda: physicalCurrency,
          monto_usd: (physicalCurrency === 'USD') ? physicalAmount : (physicalCurrency === 'ARS' && p.amount ? p.amount : null),
          tasa_cambio: tasaCambioVal,
          categoria_id: catId,
          cuenta_id: ctaId,
          billetera_id: billId,
          descripcion: `${baseDescription} (desde Regentum)`,
          id_externo: `regentum_${Date.now()}`
      };

      try {
          console.log("[FINANCE API] Sending registration request to:", endpoint, JSON.stringify(externalData));
          const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${FINANCE_API_KEY}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify(externalData)
          });

          if (!response.ok) {
              const errText = await response.text();
              console.error(`[FINANCE API ERROR] Status ${response.status}: ${errText}`);
          } else {
              const resData = await response.json();
              console.log("[FINANCE API SUCCESS] Response:", JSON.stringify(resData));
          }
      } catch (err) {
          console.error("[FINANCE API NETWORK ERROR]", err);
      }
  }

  logEvent('payment_registered', { org_id: orgId, currency: physicalCurrency });
  return { success: true, message: 'Pago registrado.' };
}

export async function updatePayment(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const physicalAmount = parseFloat(fd.get('amount') as string);
  const physicalCurrency = (fd.get('currency') as string || 'USD').toUpperCase();
  const bId = fd.get('bookingId') as string;
  const appFlavor = fd.get('appFlavor') as string || 'commercial';

  const pSnap = await getDoc(doc(db, 'payments', id));
  if (!pSnap.exists()) return { success: false, message: 'Pago no encontrado.' };
  
  const oldP = pSnap.data();
  const debtCurrency = (oldP.currency || 'USD').toUpperCase();

  const data: any = { 
    date: fd.get('date'), 
    description: fd.get('description'), 
    receivedAmount: physicalAmount,
    receivedCurrency: physicalCurrency
  };
  
  if (appFlavor === 'personal' && physicalCurrency !== debtCurrency) {
    const rate = parseFloat(fd.get('exchangeRate') as string);
    if (rate) {
        data.exchangeRate = rate;
        data.amount = (physicalCurrency === 'ARS') ? physicalAmount / rate : physicalAmount * rate;
    }
  } else {
    data.amount = physicalAmount;
    data.exchangeRate = null;
  }

  await updateDoc(doc(db, 'payments', id), data).catch(handleError(`payments/${id}`, 'update', data));
  if (bId) await syncBookingBalance(bId);

  return { success: true, message: 'Pago actualizado.' };
}

export async function deletePayment(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const pSnap = await getDoc(doc(db, 'payments', id));
  if (!pSnap.exists()) return { success: false, message: 'Pago no encontrado.' };
  
  const p = pSnap.data();
  await deleteDoc(doc(db, 'payments', id)).catch(handleError(`payments/${id}`, 'delete'));
  if (p.bookingId) await syncBookingBalance(p.bookingId);

  return { success: true, message: 'Pago eliminado.' };
}

// --- GASTOS ---
export async function addExpense(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const assVal = (fd.get('assignmentId') || fd.get('assignment')) as string;
  let [type, aid] = assVal.includes('-') ? assVal.split('-') : ['property', assVal];

  const amount = parseFloat(fd.get('amount') as string);
  const currency = (fd.get('currency') as string || 'ARS').toUpperCase();
  const rate = parseFloat(fd.get('exchangeRate') as string) || null;
  
  const data: any = { 
    orgId,
    assignment: { type, id: aid }, 
    date: fd.get('date'), 
    description: fd.get('description'), 
    categoryId: fd.get('categoryId') === 'none' ? null : fd.get('categoryId'), 
    providerId: fd.get('providerId') === 'none' ? null : fd.get('providerId'), 
    taskId: fd.get('taskId') || null, 
    currency: 'ARS',
    ownerLiquidationId: null 
  };

  if (currency === 'USD' && rate) { 
    data.amount = amount * rate; 
    data.originalUsdAmount = amount; 
    data.exchangeRate = rate; 
  } else { 
    data.amount = amount; 
  }

  await addDoc(collection(db, 'expenses'), data).catch(handleError('expenses', 'create', data));
  logEvent('expense_added', { org_id: orgId });
  return { success: true, message: 'Gasto registrado.' };
}

export async function updateExpense(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const amount = parseFloat(fd.get('amount') as string);
  const currency = (fd.get('currency') as string || 'ARS').toUpperCase();
  const rate = parseFloat(fd.get('exchangeRate') as string) || null;
  const assVal = fd.get('assignment') as string;
  const assType = fd.get('assignmentType') as string;
  const assId = fd.get('assignmentId') as string;
  
  const data: any = { 
    date: fd.get('date'), 
    description: fd.get('description'), 
    categoryId: fd.get('categoryId') === 'none' ? null : fd.get('categoryId'), 
    providerId: fd.get('providerId') === 'none' ? null : fd.get('providerId') 
  };

  if (assVal) {
    const { type, id: aid } = parseAssignment(assVal);
    data.assignment = { type, id: aid };
  } else if (assType && assId) {
    data.assignment = { type: assType, id: assId };
  }

  if (currency === 'USD' && rate) { 
    data.amount = amount * rate; 
    data.originalUsdAmount = amount; 
    data.exchangeRate = rate; 
  } else { 
    data.amount = amount; 
    data.currency = 'ARS'; 
    data.originalUsdAmount = null;
  }

  await updateDoc(doc(db, 'expenses', id), data).catch(handleError(`expenses/${id}`, 'update', data));
  return { success: true, message: 'Gasto actualizado.' };
}

export async function deleteExpense(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  await deleteDoc(doc(db, 'expenses', id)).catch(handleError(`expenses/${id}`, 'delete'));
  return { success: true, message: 'Gasto eliminado.' };
}

// --- TAREAS ---
export async function addTask(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const [t, aid] = (fd.get('assignment') as string).split('-');
  const data = {
    orgId,
    assignment: { type: t as any, id: aid }, 
    description: fd.get('description') as string,
    status: fd.get('status') as any, 
    priority: fd.get('priority') as any, 
    notes: fd.get('notes') as string,
    categoryId: fd.get('categoryId') === 'none' ? null : fd.get('categoryId') as string,
    dueDate: fd.get('dueDate') as string, 
    costCurrency: (fd.get('costCurrency') as string || 'ARS').toUpperCase(),
    providerId: fd.get('providerId') === 'none' ? null : fd.get('providerId') as string,
    estimatedCost: parseFloat(fd.get('estimatedCost') as string) || 0,
  };
  await addDoc(collection(db, 'tasks'), data).catch(handleError('tasks', 'create', data));
  await updateStatsCounter(orgId, 'bookingsCount', 1); // Task counts aren't in telemetry yet, using bookingsCount placeholder
  logEvent('task_created', { org_id: orgId });
  return { success: true, message: 'Tarea creada.' };
}

export async function updateTask(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const data: any = {};
  const allFields = ['description', 'status', 'priority', 'notes', 'categoryId', 'dueDate', 'costCurrency', 'providerId', 'estimatedCost', 'assignment'];
  
  allFields.forEach(f => {
    if (fd.has(f)) {
      const v = fd.get(f); 
      if (f === 'costCurrency') {
          data[f] = (v as string).toUpperCase();
      } else if (f === 'assignment') {
          const [type, aid] = (v as string).split('-');
          data[f] = { type, id: aid };
      } else {
          data[f] = (f === 'estimatedCost' ? parseFloat(v as string) || 0 : v === 'none' ? null : v);
      }
    }
  });

  await updateDoc(doc(db, 'tasks', id), data).catch(handleError(`tasks/${id}`, 'update', data));
  return { success: true, message: 'Tarea actualizada.' };
}

export async function deleteTask(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  await deleteDoc(doc(db, 'tasks', id)).catch(handleError(`tasks/${id}`, 'delete'));
  return { success: true, message: 'Tarea eliminada.' };
}

// --- OTROS ---
export async function addOrigin(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const data = { orgId, name: fd.get('name') as string, color: fd.get('color') as string };
  await addDoc(collection(db, 'origins'), data).catch(handleError('origins', 'create', data));
  return { success: true, message: 'Origen guardado.' };
}

export async function updateOrigin(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const data = { name: fd.get('name') as string, color: fd.get('color') as string };
  await updateDoc(doc(db, 'origins', id), data).catch(handleError(`origins/${id}`, 'update', data));
  return { success: true, message: 'Origen actualizado.' };
}

export async function deleteOrigin(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  await deleteDoc(doc(db, 'origins', id)).catch(handleError(`origins/${id}`, 'delete'));
  return { success: true, message: 'Origen eliminado.' };
}

export async function addDateBlock(ps: any, fd: FormData) { 
  const orgId = getRequiredOrgId(fd);
  const pId = (fd.get('propertyId') || fd.get('propertyId-select')) as string;
  const data = { orgId, propertyId: pId, startDate: fd.get('startDate') as string, endDate: fd.get('endDate') as string, reason: fd.get('reason') as string };
  await addDoc(collection(db, 'date_blocks'), data).catch(handleError('date_blocks', 'create', data));
  return {success: true, message: 'Fechas bloqueadas.'};
}

export async function updateDateBlock(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const data = {
    startDate: fd.get('startDate') as string,
    endDate: fd.get('endDate') as string,
    reason: fd.get('reason') as string,
  };
  await updateDoc(doc(db, 'date_blocks', id), data).catch(handleError(`date_blocks/${id}`, 'update', data));
  return { success: true, message: 'Bloqueo actualizado.' };
}

export async function deleteDateBlock(ps: any, fd: FormData) { 
  const id = fd.get('id') as string;
  await deleteDoc(doc(db, 'date_blocks', id)).catch(handleError(`date_blocks/${id}`, 'delete'));
  return {success: true, message: 'Bloqueo eliminado.'};
}

export async function addExpenseCategory(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const data = { orgId, name: fd.get('name') as string };
  await addDoc(collection(db, 'expense_categories'), data).catch(handleError('expense_categories', 'create', data));
  return {success: true, message: 'Categoría guardada.'};
}

export async function updateExpenseCategory(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const data = { name: fd.get('name') as string };
  await updateDoc(doc(db, 'expense_categories', id), data).catch(handleError(`expense_categories/${id}`, 'update', data));
  return { success: true, message: 'Categoría actualizada.' };
}

export async function deleteExpenseCategory(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  await deleteDoc(doc(db, 'expense_categories', id)).catch(handleError(`expense_categories/${id}`, 'delete'));
  return {success: true, message: 'Categoría eliminada.'};
}

export async function addTaskCategory(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const data = { orgId, name: fd.get('name') as string };
  await addDoc(collection(db, 'task_categories'), data).catch(handleError('task_categories', 'create', data));
  return {success: true, message: 'Categoría guardada.'};
}

export async function updateTaskCategory(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const data = { name: fd.get('name') as string };
  await updateDoc(doc(db, 'task_categories', id), data).catch(handleError(`task_categories/${id}`, 'update', data));
  return { success: true, message: 'Categoría actualizada.' };
}

export async function deleteTaskCategory(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  await deleteDoc(doc(db, 'task_categories', id)).catch(handleError(`task_categories/${id}`, 'delete'));
  return {success: true, message: 'Categoría eliminada.'};
}

export async function addTaskScope(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const data = { orgId, name: fd.get('name') as string, color: fd.get('color') as string };
  await addDoc(collection(db, 'task_scopes'), data).catch(handleError('task_scopes', 'create', data));
  return {success: true, message: 'Ámbito guardada.'};
}

export async function updateTaskScope(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const data = { name: fd.get('name') as string, color: fd.get('color') as string };
  await updateDoc(doc(db, 'task_scopes', id), data).catch(handleError(`task_scopes/${id}`, 'update', data));
  return { success: true, message: 'Ámbito actualizada.' };
}

export async function deleteTaskScope(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  await deleteDoc(doc(db, 'task_scopes', id)).catch(handleError(`task_scopes/${id}`, 'delete'));
  return { success: true, message: 'Ámbito eliminada.' };
}

export async function addAdjustmentCategory(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const data = { orgId, name: fd.get('name') as string, type: fd.get('type') as any };
  await addDoc(collection(db, 'adjustment_categories'), data).catch(handleError('adjustment_categories', 'create', data));
  return {success: true, message: 'Categoría guardada.'};
}

export async function updateAdjustmentCategory(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const data = { name: fd.get('name') as string, type: fd.get('type') as any };
  await updateDoc(doc(db, 'adjustment_categories', id), data).catch(handleError(`adjustment_categories/${id}`, 'update', data));
  return { success: true, message: 'Categoría actualizada.' };
}

export async function deleteAdjustmentCategory(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  await deleteDoc(doc(db, 'adjustment_categories', id)).catch(handleError(`adjustment_categories/${id}`, 'delete'));
  return {success: true, message: 'Categoría eliminada.'};
}

export async function addProviderCategory(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const data = { orgId, name: fd.get('name') as string };
  await addDoc(collection(db, 'provider_categories'), data).catch(handleError('provider_categories', 'create', data));
  return {success: true, message: 'Categoría guardada.'};
}

export async function updateProviderCategory(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const data = { name: fd.get('name') as string };
  await updateDoc(doc(db, 'provider_categories', id), data).catch(handleError(`provider_categories/${id}`, 'update', data));
  return { success: true, message: 'Categoría actualizada.' };
}

export async function deleteProviderCategory(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  await deleteDoc(doc(db, 'provider_categories', id)).catch(handleError(`provider_categories/${id}`, 'delete'));
  return {success: true, message: 'Categoría eliminada.'};
}

export async function addEmailTemplateDbAction(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const data = { orgId, name: fd.get('name') as string, subject: fd.get('subject') as string, body: fd.get('body') as string };
  await addDoc(collection(db, 'email_templates'), data).catch(handleError('email_templates', 'create', data));
  return { success: true, message: 'Plantilla guardada.' };
}

export async function updateEmailTemplateDbAction(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const data = { name: fd.get('name') as string, subject: fd.get('subject') as string, body: fd.get('body') as string };
  await updateDoc(doc(db, 'email_templates', id), data).catch(handleError(`email_templates/${id}`, 'update', data));
  return { success: true, message: 'Plantilla actualizada.' };
}

export async function deleteEmailTemplateDbAction(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  await deleteDoc(doc(db, 'email_templates', id)).catch(handleError(`email_templates/${id}`, 'delete'));
  return { success: true, message: 'Plantilla eliminada.' };
}

export async function updateEmailSettings(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const data = { orgId, replyToEmail: fd.get('replyToEmail') as string };
  await setDoc(doc(db, 'settings', `email_${orgId}`), data, { merge: true }).catch(handleError(`settings/email_${orgId}`, 'write', data));
  return {success: true, message: 'Configuración de email actualizada.'};
}

export async function updateAlertSettings(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const data = { orgId, checkInDays: parseInt(fd.get('checkInDays') as string), checkOutDays: parseInt(fd.get('checkOutDays') as string) };
  await setDoc(doc(db, 'settings', `alerts_${orgId}`), data, { merge: true }).catch(handleError(`settings/alerts_${orgId}`, 'write', data));
  return {success: true, message: 'Configuración de alertas actualizada.'};
}

export async function updateCurrencySettings(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const data = { orgId, baseCurrency: fd.get('baseCurrency') as string, favoriteCurrencies: fd.getAll('favoriteCurrencies') as string[] };
  await setDoc(doc(db, 'settings', `currencies_${orgId}`), data, { merge: true }).catch(handleError(`settings/currencies_${orgId}`, 'write', data));
  return {success: true, message: 'Configuración de monedas actualizada.'};
}

export async function updateBrandingSettings(ps: any, fd: FormData) {
    const orgId = getRequiredOrgId(fd);
    const data = { 
        orgId,
        appName: fd.get('appName') as string, 
        appSlogan: fd.get('appSlogan') as string,
        logoMainUrl: fd.get('logoMainUrl') as string,
        logoDocUrl: fd.get('logoDocUrl') as string
    };
    await setDoc(doc(db, 'settings', `branding_${orgId}`), data, { merge: true }).catch(handleError(`settings/branding_${orgId}`, 'write', data));
    return { success: true, message: 'Identidad visual actualizada.' };
}

export async function savePushSubscription(subscription: any, orgId: string) {
  if (!orgId) return { success: false, message: 'Identificador de organización requerido.' };
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return { success: false, message: 'Suscripción del navegador inválida. Intenta el reseteo forzado y vuelve a activar.' };
  }

  const docId = encodeURIComponent(subscription.endpoint);
  const payload = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    orgId,
    createdAt: new Date().toISOString(),
    expirationTime: subscription.expirationTime ?? null,
  };

  try {
    await setDoc(doc(db, 'pushSubscriptions', docId), payload);
    return { success: true, message: 'Suscripción guardada.' };
  } catch (error: any) {
    console.error('[PUSH] Error guardando suscripción:', error);
    return {
      success: false,
      message:
        error?.code === 'permission-denied'
          ? 'Sin permiso para guardar en Firestore. Revisa la sesión o las reglas de seguridad.'
          : error?.message || 'No se pudo guardar la suscripción en el servidor.',
    };
  }
}

// --- CONTRATOS ---
export async function addContrato(ps: any, fd: FormData) { 
  const orgId = getRequiredOrgId(fd);
  const pId = fd.get('propertyId') as string;
  const tId = fd.get('tenantId') as string;
  const startDateStr = fd.get('fechaInicio') as string;
  const endDateStr = fd.get('fechaFin') as string;
  const moneda = (fd.get('moneda') as string || 'ARS').toUpperCase();

  const s = new Date(startDateStr);
  const e = new Date(endDateStr);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return { success: false, message: 'Fechas inválidas.' };

  const data = { 
    orgId,
    propertyId: pId, 
    tenantId: tId, 
    fechaInicio: startDateStr, 
    fechaFin: endDateStr, 
    montoInicial: parseFloat(fd.get('montoInicial') as string), 
    moneda: moneda, 
    frecuenciaPago: 'mensual', 
    diaVencimiento: parseInt(fd.get('diaVencimiento') as string, 10), 
    frecuenciaAjuste: parseInt(fd.get('frecuenciaAjuste') as string, 10), 
    notes: (fd.get('notes') as string) || null, 
    montoGarantia: parseFloat(fd.get('montoGarantia') as string) || 0, 
    monedaGarantia: (fd.get('monedaGarantia') as string || 'USD').toUpperCase(), 
    guaranteeStatus: 'not_solicited' as const,
    contractStatus: 'not_sent' as const,
    status: (fd.get('status') as any) || 'active'
  };

  const batch = writeBatch(db);
  const ref = doc(collection(db, 'contratos'));
  batch.set(ref, data);

  let cur = startOfMonth(s); 
  const fin = startOfMonth(e);
  while (cur <= fin) {
    const monthsDiff = differenceInCalendarMonths(cur, s);
    const isAdj = (monthsDiff > 0 && data.frecuenciaAjuste > 0 && monthsDiff % data.frecuenciaAjuste === 0);
    const pRef = doc(collection(db, 'periodosPago'));
    const vencimiento = new Date(cur.getFullYear(), cur.getMonth(), data.diaVencimiento);
    
    batch.set(pRef, { 
      orgId,
      contratoId: ref.id, 
      propertyId: pId, 
      fechaDesde: toDateString(startOfMonth(cur)), 
      fechaHasta: toDateString(endOfMonth(cur)), 
      fechaVencimiento: toDateString(vencimiento), 
      montoOriginal: data.montoInicial, 
      montoAjustado: data.montoInicial, 
      montoPagado: 0, 
      indiceAplicado: null, 
      estado: isAdj ? 'pendiente_ajuste' : 'pendiente' 
    });
    cur = addMonths(cur, 1);
  }

  await batch.commit().catch(handleError('contratos', 'write', data));
  await updateStatsCounter(orgId, 'contratosCount', 1);
  logEvent('contract_created', { org_id: orgId });
  return {success: true, message: 'Contrato guardado.'};
}

export async function updateContrato(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const data: any = {};
  const fields = ['tenantId', 'propertyId', 'fechaInicio', 'fechaFin', 'montoInicial', 'moneda', 'frecuenciaAjuste', 'diaVencimiento', 'notes', 'contractStatus', 'status', 'guaranteeStatus', 'montoGarantia', 'monedaGarantia', 'guaranteeReceivedDate', 'guaranteeReturnedDate'];
  
  fields.forEach(f => {
    if (fd.has(f)) {
      const v = fd.get(f);
      if (['montoInicial', 'montoGarantia', 'diaVencimiento', 'frecuenciaAjuste'].includes(f)) data[f] = parseFloat(v as string) || 0;
      else if (['moneda', 'monedaGarantia'].includes(f)) data[f] = (v as string).toUpperCase();
      else data[f] = v;
    }
  });

  await updateDoc(doc(db, 'contratos', id), data).catch(handleError(`contratos/${id}`, 'update', data));
  return { success: true, message: 'Contrato actualizado.' };
}

export async function deleteContrato(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const snap = await getDoc(doc(db, 'contratos', id));
  const orgId = snap.data()?.orgId;
  const periodosSnap = await getDocs(query(collection(db, 'periodosPago'), where('contratoId', '==', id)));
  const paymentsSnap = await getDocs(query(collection(db, 'payments'), where('contratoId', '==', id)));
  const batch = writeBatch(db);
  batch.delete(doc(db, 'contratos', id));
  periodosSnap.docs.forEach(d => batch.delete(d.ref));
  paymentsSnap.forEach(d => batch.delete(d.ref));
  await batch.commit().catch(handleError(`contratos/${id}`, 'delete'));
  if (orgId) await updateStatsCounter(orgId, 'contratosCount', -1);
  return { success: true, message: 'Contrato eliminado.' };
}

export async function addContratoPayment(ps: any, fd: FormData) { 
  const orgId = getRequiredOrgId(fd);
  const cId = fd.get('contratoId') as string;
  const pId = fd.get('periodoPagoId') as string;
  const amount = parseFloat(fd.get('amount') as string);
  const pSnap = await getDoc(doc(db, 'periodosPago', pId));
  if (!pSnap.exists()) return { success: false, message: 'Periodo no encontrado' };
  const p = pSnap.data();
  const data = { 
    orgId,
    date: fd.get('date') as string, 
    amount: amount, 
    currency: (fd.get('currency') as string || 'ARS').toUpperCase(), 
    description: (fd.get('description') as string) || `Pago cuota contrato`,
    contratoId: cId, 
    propertyId: p.propertyId,
    periodoPagoId: pId,
    ownerLiquidationId: null
  };
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'payments')), data);
  const nP = (p.montoPagado || 0) + amount;
  batch.update(doc(db, 'periodosPago', pId), { 
    montoPagado: nP, 
    estado: nP >= (p.montoAjustado - 0.01) ? 'pagado' : (nP > 0 ? 'pago_parcial' : 'pendiente') 
  });
  await batch.commit().catch(handleError('contrato_payment', 'write', data));
  return {success: true, message: 'Pago de contrato registrado.'};
}

export async function applyContratoAdjustment(ps: any, fd: FormData) {
    const contratoId = fd.get('contratoId') as string;
    const currentPeriodoId = fd.get('periodoPagoId') as string;
    const newAmount = parseFloat(fd.get('newAmount') as string);
    const indexApplied = fd.get('indexApplied') as string;
    const pSnap = await getDoc(doc(db, 'periodosPago', currentPeriodoId));
    if (!pSnap.exists()) return { success: false, message: 'Periodo no encontrado.' };
    const pData = pSnap.data();
    const batch = writeBatch(db);
    batch.update(doc(db, 'periodosPago', currentPeriodoId), {
        montoAjustado: newAmount,
        indiceApplied: indexApplied,
        estado: (pData.montoPagado >= newAmount - 0.01) ? 'pagado' : (pData.montoPagado > 0 ? 'pago_parcial' : 'pendiente')
    });
    const futureQuery = query(collection(db, 'periodosPago'), where('contratoId', '==', contratoId), where('fechaDesde', '>', pData.fechaDesde));
    const futureSnap = await getDocs(futureQuery);
    futureSnap.docs.forEach(d => {
        const dData = d.data();
        if (dData.estado !== 'pendiente_ajuste') {
            batch.update(d.ref, { 
                montoAjustado: newAmount,
                estado: (dData.montoPagado >= newAmount - 0.01) ? 'pagado' : (dData.montoPagado > 0 ? 'pago_parcial' : 'pendiente')
            });
        }
    });
    await batch.commit().catch(handleError(`periodosPago/${currentPeriodoId}`, 'write'));
    return { success: true, message: 'Ajuste aplicado y propagado.' };
}

export async function addProvider(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const data = {
    orgId,
    name: fd.get('name') as string,
    email: fd.get('email') as string,
    role: fd.get('role') as any,
    status: fd.get('status') as any,
    managementType: fd.get('managementType') as any || 'tasks',
    billingType: fd.get('billingType') as any || 'hourly',
    rateCurrency: (fd.get('rateCurrency') as any) || 'ARS',
    hourlyRate: parseFloat(fd.get('hourlyRate') as string) || null,
    monthlyRate: parseFloat(fd.get('monthlyRate') as string) || null,
    adminNote: fd.get('adminNote') as string || null,
    categoryId: fd.get('categoryId') !== 'none' ? fd.get('categoryId') as string : null,
    countryCode: fd.get('countryCode') as string || '+54',
    phone: fd.get('phone') as string || null,
    notes: fd.get('notes') as string || null,
    appFlavor: fd.get('appFlavor') as any || 'commercial'
  };

  await addDoc(collection(db, 'providers'), data).catch(handleError('providers', 'create', data));
  await updateStatsCounter(orgId, 'teamCount', 1);
  return { success: true, message: 'Proveedor/Usuario creado correctamente.' };
}

export async function updateProvider(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const data: any = {
    name: fd.get('name') as string,
  };
  
  // Solo actualizar campos si están presentes en el formData
  const fields = ['email', 'role', 'status', 'managementType', 'billingType', 'rateCurrency', 'hourlyRate', 'monthlyRate', 'adminNote', 'categoryId', 'countryCode', 'phone', 'notes'];
  
  fields.forEach(f => {
    if (fd.has(f)) {
      if (f === 'categoryId') {
        data[f] = fd.get(f) !== 'none' ? fd.get(f) as string : null;
      } else if (f === 'hourlyRate' || f === 'monthlyRate') {
        data[f] = parseFloat(fd.get(f) as string) || null;
      } else {
        data[f] = fd.get(f);
      }
    }
  });

  await updateDoc(doc(db, 'providers', id), data).catch(handleError(`providers/${id}`, 'update', data));
  return { success: true, message: 'Proveedor/Usuario actualizado correctamente.' };
}

export async function updateProviderRating(ps: any, fd: FormData) {
    const id = fd.get('id') as string;
    const rating = parseInt(fd.get('rating') as string, 10);
    await updateDoc(doc(db, 'providers', id), { rating }).catch(handleError(`providers/${id}`, 'update'));
    return { success: true, message: 'Calificación actualizada.' };
}

export async function updateProviderAdminNote(ps: any, fd: FormData) {
    const id = fd.get('id') as string;
    const adminNote = fd.get('adminNote') as string;
    await updateDoc(doc(db, 'providers', id), { adminNote }).catch(handleError(`providers/${id}`, 'update'));
    return { success: true, message: 'Nota actualizada.' };
}

export async function deleteProvider(ps: any, fd: FormData) {
  const id = fd.get('id') as string;
  const pSnap = await getDoc(doc(db, 'providers', id));
  if (!pSnap.exists()) return { success: false, message: 'Registro no encontrado.' };
  
  const pData = pSnap.data();
  // Validación por UID
  const isMasterAdmin = id === MASTER_ADMIN_UID;
  const isWorkspaceOwner = id === pData.orgId;
  const isProtectedRole = pData.role === 'admin' || pData.role === 'socio' || pData.role === 'staff';

  // Solo protegemos al administrador principal en la pestaña de Equipo.
  if (isProtectedRole && (isMasterAdmin || isWorkspaceOwner)) {
      return { success: false, message: 'No se puede eliminar al Administrador principal del sistema.' };
  }
  
  await deleteDoc(doc(db, 'providers', id)).catch(handleError(`providers/${id}`, 'delete'));
  await updateStatsCounter(pData.orgId, 'teamCount', -1);
  return { success: true, message: 'Usuario eliminado.' };
}

export async function forceDeleteProvider(ps: any, id: string) {
    await deleteDoc(doc(db, 'providers', id)).catch(handleError(`providers/${id}`, 'delete'));
    return { success: true, message: 'Registro eliminado permanentemente del sistema.' };
}

// --- ACTIVIDADES (WORKLOGS) ---
export async function addWorkLog(ps: any, fd: FormData) {
    const orgId = getRequiredOrgId(fd);
    const providerId = fd.get('providerId') as string;
    const assVal = fd.get('assignment') as string;
    const { type, id: aid } = parseAssignment(assVal);
    const quantity = parseFloat(fd.get('quantity') as string);
    const rate = parseFloat(fd.get('rate') as string);
    const isPaid = fd.get('paid') === 'true' || fd.get('paid') === 'on';

    const data: any = {
        orgId,
        providerId,
        assignment: { type, id: aid },
        date: fd.get('date') as string,
        activityType: fd.get('activityType') as 'hourly' | 'per_visit' | 'monthly',
        quantity,
        rateApplied: rate,
        calculatedCost: quantity * rate,
        description: fd.get('description') as string || '',
        costCurrency: 'ARS',
        status: isPaid ? 'liquidated' : 'pending_liquidation',
        liquidationId: null
    };

    const provSnap = await getDoc(doc(db, 'providers', providerId));
    if (provSnap.exists()) { data.costCurrency = (provSnap.data().rateCurrency || 'ARS').toUpperCase(); }

    const batch = writeBatch(db);
    const logRef = doc(collection(db, 'workLogs'));
    
    if (isPaid) {
        const liqRef = doc(collection(db, 'liquidations'));
        const liquidation = { 
            orgId,
            providerId, 
            dateGenerated: new Date().toISOString(), 
            totalAmount: data.calculatedCost,
            previousBalance: 0,
            currency: data.costCurrency, 
            status: 'paid' as const, 
            amountPaid: data.calculatedCost, 
            balance: 0 
        };
        batch.set(liqRef, liquidation);
        data.liquidationId = liqRef.id;

        const expRef = doc(collection(db, 'expenses'));
        const expenseData: any = {
            orgId,
            assignment: { type, id: aid },
            date: data.date,
            amount: data.calculatedCost,
            currency: data.costCurrency,
            description: `[Actividad Pagada] ${data.description || 'Trabajo de colaborador'}`,
            categoryId: 'provider_payments',
            providerId,
            workLogId: logRef.id,
            liquidationId: liqRef.id,
            ownerLiquidationId: null
        };
        if (data.costCurrency === 'USD') {
            expenseData.originalUsdAmount = data.calculatedCost;
        }
        batch.set(expRef, expenseData);
    }
    
    batch.set(logRef, data);

    await batch.commit().catch(handleError('workLogs', 'create', data));
    return { success: true, message: 'Actividad registrada.' };
}

export async function updateWorkLog(ps: any, fd: FormData) {
    const id = fd.get('id') as string;
    const providerId = fd.get('providerId') as string;
    const assVal = fd.get('assignment') as string;
    const { type, id: aid } = parseAssignment(assVal);
    const quantity = parseFloat(fd.get('quantity') as string);
    const rate = parseFloat(fd.get('rate') as string);
    const isPaid = fd.get('paid') === 'true' || fd.get('paid') === 'on';

    const provSnap = await getDoc(doc(db, 'providers', providerId));
    const orgId = provSnap.exists() ? provSnap.data().orgId : 'global';
    const costCurrency = provSnap.exists() ? (provSnap.data().rateCurrency || 'ARS').toUpperCase() : 'ARS';

    const calculatedCost = quantity * rate;
    const data: any = {
        assignment: { type, id: aid },
        date: fd.get('date') as string,
        activityType: fd.get('activityType') as any,
        quantity,
        rateApplied: rate,
        calculatedCost,
        description: fd.get('description') as string || '',
    };

    const batch = writeBatch(db);
    const logRef = doc(db, 'workLogs', id);

    if (isPaid) {
        data.status = 'liquidated';
        
        const liqRef = doc(collection(db, 'liquidations'));
        const liquidation = { 
            orgId,
            providerId, 
            dateGenerated: new Date().toISOString(), 
            totalAmount: calculatedCost,
            previousBalance: 0,
            currency: costCurrency, 
            status: 'paid' as const, 
            amountPaid: calculatedCost, 
            balance: 0 
        };
        batch.set(liqRef, liquidation);
        data.liquidationId = liqRef.id;

        const expRef = doc(collection(db, 'expenses'));
        const expenseData: any = {
            orgId,
            assignment: { type, id: aid },
            date: data.date,
            amount: calculatedCost,
            currency: costCurrency,
            description: `[Actividad Pagada] ${data.description || 'Trabajo de colaborador'}`,
            categoryId: 'provider_payments',
            providerId,
            workLogId: id,
            liquidationId: liqRef.id,
            ownerLiquidationId: null
        };
        if (costCurrency === 'USD') {
            expenseData.originalUsdAmount = calculatedCost;
        }
        batch.set(expRef, expenseData);
    }

    batch.update(logRef, data);

    await batch.commit().catch(handleError(`workLogs/${id}`, 'update', data));
    return { success: true, message: 'Actividad actualizada.' };
}

export async function deleteWorkLog(ps: any, fd: FormData) {
    const id = fd.get('id') as string;
    await deleteDoc(doc(db, 'workLogs', id)).catch(handleError(`workLogs/${id}`, 'delete'));
    return { success: true, message: 'Actividad eliminada.' };
}

export async function addManualAdjustment(ps: any, fd: FormData) {
    const orgId = getRequiredOrgId(fd);
    const providerId = fd.get('providerId') as string;
    const assVal = fd.get('assignment') as string;
    const { type, id: aid } = parseAssignment(assVal);
    const amount = parseFloat(fd.get('amount') as string);
    const currency = (fd.get('currency') as string || 'ARS').toUpperCase();
    const catId = fd.get('categoryId') as string;
    const isPaid = fd.get('paid') === 'true' || fd.get('paid') === 'on';
    
    // Soporte para ambos nombres de colección en el lookup
    let catSnap = await getDoc(doc(db, 'adjustment_categories', catId));
    if (!catSnap.exists()) {
        catSnap = await getDoc(doc(db, 'adjustmentCategories', catId));
    }
    
    let finalAmount = amount;
    const catType = catSnap.exists() ? catSnap.data()?.type : 'addition';
    const catName = catSnap.exists() ? catSnap.data()?.name : 'Ajuste';
    if (catType === 'deduction') { 
        finalAmount = -Math.abs(amount); 
    }
    
    const batch = writeBatch(db);
    const adjRef = doc(collection(db, 'manualAdjustments'));

    const data: any = {
        orgId,
        providerId,
        assignment: { type, id: aid },
        date: fd.get('date') as string,
        amount: finalAmount,
        currency,
        categoryId: catId,
        notes: fd.get('notes') as string || '',
        status: (isPaid && catType === 'addition') ? 'liquidated' : 'pending_liquidation',
        liquidationId: null
    };
    
    if (isPaid && catType === 'addition') {
        const liqRef = doc(collection(db, 'liquidations'));
        const liquidation = { 
            orgId,
            providerId, 
            dateGenerated: new Date().toISOString(), 
            totalAmount: data.amount,
            previousBalance: 0,
            currency: data.currency, 
            status: 'paid' as const, 
            amountPaid: data.amount, 
            balance: 0 
        };
        batch.set(liqRef, liquidation);
        data.liquidationId = liqRef.id;

        const expRef = doc(collection(db, 'expenses'));
        const expenseData: any = {
            orgId,
            assignment: { type, id: aid },
            date: data.date,
            amount: data.amount,
            currency: data.currency,
            description: `[Ajuste Pagado] ${catName}${data.notes ? `: ${data.notes}` : ''}`,
            categoryId: 'provider_payments',
            providerId,
            manualAdjustmentId: adjRef.id,
            liquidationId: liqRef.id,
            ownerLiquidationId: null
        };
        if (data.currency === 'USD') {
            expenseData.originalUsdAmount = data.amount;
        }
        batch.set(expRef, expenseData);
    }
    
    batch.set(adjRef, data);

    await batch.commit().catch(handleError('manualAdjustments', 'create', data));
    return { success: true, message: 'Ajuste registrado.' };
}

export async function updateManualAdjustment(ps: any, fd: FormData) {
    const id = fd.get('id') as string;
    const providerId = fd.get('providerId') as string;
    const assVal = fd.get('assignment') as string;
    const { type, id: aid } = parseAssignment(assVal);
    const amount = parseFloat(fd.get('amount') as string);
    const currency = (fd.get('currency') as string || 'ARS').toUpperCase();
    const catId = fd.get('categoryId') as string;
    const isPaid = fd.get('paid') === 'true' || fd.get('paid') === 'on';
    
    // Soporte para ambos nombres de colección en el lookup
    let catSnap = await getDoc(doc(db, 'adjustment_categories', catId));
    if (!catSnap.exists()) {
        catSnap = await getDoc(doc(db, 'adjustmentCategories', catId));
    }
    
    let finalAmount = amount;
    const catType = catSnap.exists() ? catSnap.data()?.type : 'addition';
    const catName = catSnap.exists() ? catSnap.data()?.name : 'Ajuste';
    if (catType === 'deduction') { 
        finalAmount = -Math.abs(amount); 
    }

    const provSnap = await getDoc(doc(db, 'providers', providerId));
    const orgId = provSnap.exists() ? provSnap.data().orgId : 'global';

    const data: any = {
        assignment: { type, id: aid },
        date: fd.get('date') as string,
        amount: finalAmount,
        currency,
        categoryId: catId,
        notes: fd.get('notes') as string || '',
    };

    const batch = writeBatch(db);
    const adjRef = doc(db, 'manualAdjustments', id);

    if (isPaid && catType === 'addition') {
        data.status = 'liquidated';
        
        const liqRef = doc(collection(db, 'liquidations'));
        const liquidation = { 
            orgId,
            providerId, 
            dateGenerated: new Date().toISOString(), 
            totalAmount: data.amount,
            previousBalance: 0,
            currency: data.currency, 
            status: 'paid' as const, 
            amountPaid: data.amount, 
            balance: 0 
        };
        batch.set(liqRef, liquidation);
        data.liquidationId = liqRef.id;

        const expRef = doc(collection(db, 'expenses'));
        const expenseData: any = {
            orgId,
            assignment: { type, id: aid },
            date: data.date,
            amount: data.amount,
            currency: data.currency,
            description: `[Ajuste Pagado] ${catName}${data.notes ? `: ${data.notes}` : ''}`,
            categoryId: 'provider_payments',
            providerId,
            manualAdjustmentId: id,
            liquidationId: liqRef.id,
            ownerLiquidationId: null
        };
        if (data.currency === 'USD') {
            expenseData.originalUsdAmount = data.amount;
        }
        batch.set(expRef, expenseData);
    }

    batch.update(adjRef, data);

    await batch.commit().catch(handleError(`manualAdjustments/${id}`, 'update', data));
    return { success: true, message: 'Ajuste actualizado.' };
}

export async function deleteManualAdjustment(ps: any, fd: FormData) {
    const id = fd.get('id') as string;
    await deleteDoc(doc(db, 'manualAdjustments', id)).catch(handleError(`manualAdjustments/${id}`, 'delete'));
    return { success: true, message: 'Ajuste eliminado.' };
}

// --- LIQUIDACIONES ---
export async function generateLiquidation(ps: any, fd: FormData) {
  const orgId = getRequiredOrgId(fd);
  const providerId = fd.get('providerId') as string;
  const currency = (fd.get('currency') as string || 'ARS').toUpperCase() as 'ARS' | 'USD';
  const workLogIds = fd.getAll('workLogIds') as string[];
  const adjustmentIds = fd.getAll('adjustmentIds') as string[];
  
  let totalAmount = 0;
  const logsSnap = await Promise.all(workLogIds.map(id => getDoc(doc(db, 'workLogs', id))));
  const adjsSnap = await Promise.all(adjustmentIds.map(id => getDoc(doc(db, 'manualAdjustments', id))));
  
  logsSnap.forEach(d => { if (d.exists()) totalAmount += d.data().calculatedCost; });
  adjsSnap.forEach(d => { if (d.exists()) totalAmount += d.data().amount; });
  
  const qLast = query(collection(db, 'liquidations'), where('providerId', '==', providerId), where('currency', '==', currency));
  const lastLiqs = await getDocs(qLast);
  let previousBalance = 0;
  if (!lastLiqs.empty) {
      const sorted = lastLiqs.docs.sort((a,b) => b.data().dateGenerated.localeCompare(a.data().dateGenerated));
      previousBalance = sorted[0].data().balance || 0;
  }
  const finalTotal = totalAmount + previousBalance;
  
  const batch = writeBatch(db);
  const liqRef = doc(collection(db, 'liquidations'));
  
  const liquidation = { 
    orgId,
    providerId, 
    dateGenerated: new Date().toISOString(), 
    totalAmount: finalTotal,
    previousBalance,
    currency, 
    status: finalTotal <= 0.01 ? 'paid' : 'pending_payment', 
    amountPaid: 0, 
    balance: finalTotal 
  };
  
  batch.set(liqRef, liquidation);
  
  // 1. Create a Gasto for each workLog (activity)
  logsSnap.forEach(d => {
    if (d.exists()) {
      const log = d.data();
      const expRef = doc(collection(db, 'expenses'));
      const expenseData: any = {
        orgId,
        assignment: log.assignment,
        date: log.date,
        amount: log.calculatedCost,
        currency: log.costCurrency,
        description: `[Liquidado] ${log.description || 'Actividad de colaborador'}`,
        categoryId: 'provider_payments',
        providerId,
        workLogId: d.id,
        liquidationId: liqRef.id,
        ownerLiquidationId: null
      };
      if (log.costCurrency === 'USD') {
        expenseData.originalUsdAmount = log.calculatedCost;
      }
      batch.set(expRef, expenseData);
    }
  });

  // 2. Create a Gasto for each manualAdjustment (can be positive or negative)
  adjsSnap.forEach(d => {
    if (d.exists()) {
      const adj = d.data();
      const expRef = doc(collection(db, 'expenses'));
      const expenseData: any = {
        orgId,
        assignment: adj.assignment,
        date: adj.date,
        amount: adj.amount,
        currency: adj.currency,
        description: `[Liquidado - Ajuste] ${adj.notes || 'Ajuste de colaborador'}`,
        categoryId: 'provider_payments',
        providerId,
        manualAdjustmentId: d.id,
        liquidationId: liqRef.id,
        ownerLiquidationId: null
      };
      if (adj.currency === 'USD') {
        expenseData.originalUsdAmount = adj.amount;
      }
      batch.set(expRef, expenseData);
    }
  });

  workLogIds.forEach(id => batch.update(doc(db, 'workLogs', id), { status: 'liquidated', liquidationId: liqRef.id }));
  adjustmentIds.forEach(id => batch.update(doc(db, 'manualAdjustments', id), { status: 'liquidated', liquidationId: liqRef.id }));
  
  await batch.commit().catch(handleError('liquidations', 'write', liquidation));
  logEvent('liquidation_generated', { org_id: orgId });
  return { success: true, message: 'Liquidación generada con éxito.' };
}

export async function addLiquidationPayment(ps: any, fd: FormData) {
    const orgId = getRequiredOrgId(fd);
    const liqId = fd.get('liquidationId') as string;
    const amount = parseFloat(fd.get('paymentAmount') as string);
    const liqSnap = await getDoc(doc(db, 'liquidations', liqId));
    if (!liqSnap.exists()) return { success: false, message: 'Liquidación no encontrada.' };
    const liq = liqSnap.data();
    const batch = writeBatch(db);
    const newPaid = (liq.amountPaid || 0) + amount;
    const newBalance = (liq.totalAmount || 0) - newPaid;
    batch.update(doc(db, 'liquidations', liqId), {
        amountPaid: newPaid,
        balance: newBalance,
        status: newBalance <= 0.01 ? 'paid' : 'partially_paid'
    });
    
    // We removed generic expense creation here to avoid duplicate accounting,
    // since per-activity and per-adjustment expenses are created at liquidation time.
    
    await batch.commit().catch(handleError(`liquidations/${liqId}`, 'write'));
    return { success: true, message: 'Pago registrado correctamente.' };
}

export async function revertLiquidation(ps: any, liqId: string) {
    const liqSnap = await getDoc(doc(db, 'liquidations', liqId));
    if (!liqSnap.exists()) return { success: false, message: 'Liquidación no encontrada.' };
    const batch = writeBatch(db);
    const logsSnap = await getDocs(query(collection(db, 'workLogs'), where('liquidationId', '==', liqId)));
    logsSnap.docs.forEach(d => batch.update(d.ref, { status: 'pending_liquidation', liquidationId: null }));
    const adjsSnap = await getDocs(query(collection(db, 'manualAdjustments'), where('liquidationId', '==', liqId)));
    adjsSnap.docs.forEach(d => batch.update(d.ref, { status: 'pending_liquidation', liquidationId: null }));
    const adjsDocs = adjsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const expsSnap = await getDocs(query(collection(db, 'expenses'), where('liquidationId', '==', liqId)));
    expsSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, 'liquidations', liqId));
    await batch.commit().catch(handleError(`liquidations/${liqId}`, 'delete'));
    return { success: true, message: 'Liquidación revertida.' };
}

// --- LIQUIDACIONES DE DUEÑOS ---
export async function generateOwnerLiquidation(ps: any, fd: FormData) {
    const orgId = getRequiredOrgId(fd);
    const propertyId = fd.get('propertyId') as string;
    const currency = (fd.get('currency') as string || 'USD').toUpperCase();
    const paymentIds = fd.getAll('paymentIds') as string[];
    const expenseIds = fd.getAll('expenseIds') as string[];
    const data = {
        orgId,
        propertyId,
        dateGenerated: fd.get('dateGenerated') as string,
        periodFrom: fd.get('periodFrom') as string,
        periodTo: fd.get('periodTo') as string,
        totalIncome: parseFloat(fd.get('totalIncome') as string),
        totalExpenses: parseFloat(fd.get('totalExpenses') as string),
        commissionPercentage: parseFloat(fd.get('commissionPercentage') as string),
        commissionAmount: parseFloat(fd.get('commissionAmount') as string),
        netToOwner: parseFloat(fd.get('netToOwner') as string),
        currency,
        status: 'pending' as const,
        notes: fd.get('notes') as string || ''
    };
    const batch = writeBatch(db);
    const liqRef = doc(collection(db, 'owner_liquidations'));
    batch.set(liqRef, data);
    paymentIds.forEach(id => batch.update(doc(db, 'payments', id), { ownerLiquidationId: liqRef.id }));
    expenseIds.forEach(id => batch.update(doc(db, 'expenses', id), { ownerLiquidationId: liqRef.id }));
    await batch.commit().catch(handleError('owner_liquidations', 'create', data));
    logEvent('owner_liquidation_generated', { org_id: orgId });
    return { success: true, message: 'Rendición generada.' };
}

export async function revertOwnerLiquidation(ps: any, id: string) {
    const batch = writeBatch(db);
    const pSnap = await getDocs(query(collection(db, 'payments'), where('ownerLiquidationId', '==', id)));
    pSnap.docs.forEach(d => batch.update(d.ref, { ownerLiquidationId: null }));
    const eSnap = await getDocs(query(collection(db, 'expenses'), where('ownerLiquidationId', '==', id)));
    eSnap.docs.forEach(d => batch.update(d.ref, { ownerLiquidationId: null }));
    batch.delete(doc(db, 'owner_liquidations', id));
    await batch.commit().catch(handleError(`owner_liquidations/${id}`, 'delete'));
    return { success: true, message: 'Rendición revertida.' };
}

export async function updateOwnerLiquidationStatus(ps: any, fd: FormData) {
    const id = fd.get('id') as string;
    const status = fd.get('status') as string;
    await updateDoc(doc(db, 'owner_liquidations', id), { status }).catch(handleError(`owner_liquidations/${id}`, 'update'));
    return { success: true, message: 'Estado actualizado.' };
}

// --- FIRMAS ---
export async function saveTenantSignature(ps: any, fd: FormData) {
    const id = fd.get('id') as string;
    const signatureUrl = fd.get('signatureImage') as string;
    const bRef = doc(db, 'bookings', id);
    const cRef = doc(db, 'contratos', id);
    const [bSnap, cSnap] = await Promise.all([getDoc(bRef), getDoc(cRef)]);
    const targetRef = bSnap.exists() ? bRef : cSnap.exists() ? cRef : null;
    if (!targetRef) return { success: false, message: 'Documento no encontrado.' };
    await updateDoc(targetRef, {
        tenantSignatureUrl: signatureUrl,
        contractStatus: 'signed'
    }).catch(handleError(`${targetRef.path}`, 'update'));
    logEvent('contract_signed', { org_id: (bSnap.exists() ? bSnap.data()?.orgId : cSnap.data()?.orgId) });
    return { success: true, message: 'Firma guardada correctamente.' };
}

// --- TELEMETRY MAINTENANCE ---
export async function syncAllOrganizationsStats() {
    const batch = writeBatch(db);
    
    // Obtener todos los datos del sistema
    const [providers, properties, tenants, bookings, contratos] = await Promise.all([
        getDocs(collection(db, 'providers')),
        getDocs(collection(db, 'properties')),
        getDocs(collection(db, 'tenants')),
        getDocs(collection(db, 'bookings')),
        getDocs(collection(db, 'contratos'))
    ]);

    // Agrupar por OrgId
    const stats: Record<string, any> = {};

    const process = (snap: any, field: string) => {
        snap.docs.forEach((d: any) => {
            const orgId = d.data().orgId || 'global';
            if (orgId === 'global') return;
            if (!stats[orgId]) stats[orgId] = { propertiesCount: 0, tenantsCount: 0, bookingsCount: 0, contratosCount: 0, teamCount: 0 };
            stats[orgId][field] = (stats[orgId][field] || 0) + 1;
        });
    }

    process(properties, 'propertiesCount');
    process(tenants, 'tenantsCount');
    process(bookings, 'bookingsCount');
    process(contratos, 'contratosCount');
    
    // Contar equipo (miembros que no son el dueño)
    providers.docs.forEach(d => {
        const data = d.data();
        const orgId = data.orgId;
        if (!orgId || orgId === 'global') return;
        if (!stats[orgId]) stats[orgId] = { propertiesCount: 0, tenantsCount: 0, bookingsCount: 0, contratosCount: 0, teamCount: 0 };
        if (d.id !== orgId) stats[orgId].teamCount++;
    });

    // Guardar en Firestore
    Object.entries(stats).forEach(([orgId, data]) => {
        batch.set(doc(db, 'system_stats', orgId), {
            ...data,
            lastActivity: new Date().toISOString()
        });
    });

    await batch.commit();
    return { success: true, message: "Contadores sincronizados correctamente." };
}

/**
 * Elimina registros de Reservas y Contratos que apuntan a entidades inexistentes
 * dentro de la organización del usuario.
 */
export async function purgeOrphanedRecords(ps: any, orgId: string) {
    if (!orgId) return { success: false, message: "OrgId requerido." };

    try {
        const getQ = (c: string) => query(collection(db, c), where('orgId', '==', orgId));
        
        const [pSnap, tSnap, bSnap, cSnap] = await Promise.all([
            getDocs(getQ('properties')),
            getDocs(getQ('tenants')),
            getDocs(getQ('bookings')),
            getDocs(getQ('contratos'))
        ]);

        const validPropertyIds = new Set(pSnap.docs.map(d => d.id));
        const validTenantIds = new Set(tSnap.docs.map(d => d.id));
        
        const batch = writeBatch(db);
        let count = 0;

        // Limpiar Reservas
        bSnap.docs.forEach(doc => {
            const data = doc.data();
            if (!validPropertyIds.has(data.propertyId) || !validTenantIds.has(data.tenantId)) {
                batch.delete(doc.ref);
                count++;
            }
        });

        // Limpiar Contratos
        cSnap.docs.forEach(doc => {
            const data = doc.data();
            if (!validPropertyIds.has(data.propertyId) || !validTenantIds.has(data.tenantId)) {
                batch.delete(doc.ref);
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
            return { success: true, message: `Se eliminaron ${count} registros huérfanos.` };
        }

        return { success: true, message: "No se encontraron registros huérfanos para limpiar." };
    } catch (e: any) {
        console.error("[PURGE ERROR]", e.message);
        return { success: false, message: "Fallo durante la limpieza." };
    }
}

/**
 * Elimina TODOS los datos operacionales de una organización.
 * Solo mantiene el perfil del dueño (Provider).
 */
export async function clearOrganizationData(ps: any, orgId: string) {
    if (!orgId) return { success: false, message: "OrgId requerido." };

    try {
        const collectionsToClear = [
            'properties', 'tenants', 'bookings', 'contratos', 'periodosPago',
            'payments', 'expenses', 'tasks', 'date_blocks', 'workLogs', 
            'manualAdjustments', 'liquidations', 'owner_liquidations'
        ];

        let totalDeleted = 0;
        
        for (const colName of collectionsToClear) {
            const q = query(collection(db, colName), where('orgId', '==', orgId));
            const snap = await getDocs(q);
            
            if (!snap.empty) {
                const batch = writeBatch(db);
                snap.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
                totalDeleted += snap.size;
            }
        }

        return { success: true, message: `Se eliminaron ${totalDeleted} registros. El espacio está vacío.` };
    } catch (e: any) {
        return { success: false, message: "Error al vaciar el espacio." };
    }
}
