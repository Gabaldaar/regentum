import { NextRequest } from 'next/server';
import { format, addDays } from 'date-fns';
import { getDb } from '@/lib/firebase/admin';

function formatICalDate(date: Date): string {
    return date.toISOString().split('T')[0].replace(/-/g, '');
}

function escapeICalText(text: string): string {
    if (!text) return '';
    return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n').replace(/\r/g, '');
}

export async function GET(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  let propertyId = params.propertyId;

  // Permitir extensión .ics al final para pasar las validaciones estrictas de Booking.com
  if (propertyId.endsWith('.ics')) {
      propertyId = propertyId.slice(0, -4);
  }

  if (!propertyId) {
    return new Response('Property ID is required', { status: 400 });
  }

  try {
    const db = getDb();
    const propertySnap = await db.collection('properties').doc(propertyId).get();

    if (!propertySnap.exists) {
      return new Response('Property not found', { status: 404 });
    }

    const property = propertySnap.data() as any;
    const orgId = property.orgId;

    const [bookingsSnap, blocksSnap, contratosSnap] = await Promise.all([
      db.collection('bookings').where('propertyId', '==', propertyId).where('orgId', '==', orgId).get(),
      db.collection('dateBlocks').where('propertyId', '==', propertyId).where('orgId', '==', orgId).get(),
      db.collection('contratos').where('propertyId', '==', propertyId).where('orgId', '==', orgId).get()
    ]);

    const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    const blocks = blocksSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    const contratos = contratosSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    const tenantIds = [...new Set([...bookings.map(b => b.tenantId), ...contratos.map(c => c.tenantId)])];
    const tenantsMap = new Map();
    
    if (tenantIds.length > 0) {
        await Promise.all(tenantIds.map(async (tid) => {
            if (!tid) return;
            const tSnap = await db.collection('tenants').doc(tid).get();
            if (tSnap.exists) {
                tenantsMap.set(tid, { id: tSnap.id, ...tSnap.data() });
            }
        }));
    }

    const events: string[] = [];

    // Process short-term Bookings
    bookings.forEach(booking => {
        if (booking.status && booking.status !== 'active') {
            return; // Skip cancelled or pending bookings
        }

        const tenant = tenantsMap.get(booking.tenantId);
        const tenantName = tenant ? tenant.name : 'Inquilino Desconocido';
        
        // El usuario solicitó mantener la lógica original de sumar 1 día al check-in
        const startBlockingDate = addDays(new Date(booking.startDate), 1);
        const endBlockingDate = new Date(booking.endDate);
        const eventUID = `${booking.id}@adm.com`;

        events.push(
        `BEGIN:VEVENT`,
        `UID:${eventUID}`,
        `DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss'Z'")}`,
        `DTSTART;VALUE=DATE:${formatICalDate(startBlockingDate)}`,
        `DTEND;VALUE=DATE:${formatICalDate(endBlockingDate)}`,
        `SUMMARY:${escapeICalText(`Reserva - ${tenantName}`)}`,
        `DESCRIPTION:${escapeICalText(`Reserva para ${tenantName}. Check-in el ${format(new Date(booking.startDate), 'yyyy-MM-dd')}, Check-out el ${format(new Date(booking.endDate), 'yyyy-MM-dd')}.`)}`,
        `END:VEVENT`
        );
    });
    
    // Process long-term Contratos
    contratos.forEach(contrato => {
        if (contrato.status !== 'active') {
            return; // Only sync active contracts
        }

        const tenant = tenantsMap.get(contrato.tenantId);
        const tenantName = tenant ? tenant.name : 'Inquilino Desconocido';
        
        const startDate = new Date(contrato.fechaInicio);
        const endDate = new Date(contrato.fechaFin);
        const eventUID = `contrato-${contrato.id}@adm.com`;

        events.push(
        `BEGIN:VEVENT`,
        `UID:${eventUID}`,
        `DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss'Z'")}`,
        `DTSTART;VALUE=DATE:${formatICalDate(startDate)}`,
        `DTEND;VALUE=DATE:${formatICalDate(addDays(endDate, 1))}`,
        `SUMMARY:${escapeICalText(`Contrato de Locación - ${tenantName}`)}`,
        `DESCRIPTION:${escapeICalText(`Alquiler a largo plazo para ${tenantName}.`)}`,
        `END:VEVENT`
        );
    });
    
    // Process Date Blocks
    blocks.forEach(block => {
        const startDate = new Date(block.startDate);
        const endDate = addDays(new Date(block.endDate), 1);
        const eventUID = `block-${block.id}@adm.com`;
        const summary = `Bloqueado - ${block.reason || 'No Disponible'}`;
        
        events.push(
        `BEGIN:VEVENT`,
        `UID:${eventUID}`,
        `DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss'Z'")}`,
        `DTSTART;VALUE=DATE:${formatICalDate(startDate)}`,
        `DTEND;VALUE=DATE:${formatICalDate(endDate)}`,
        `SUMMARY:${escapeICalText(summary)}`,
        `DESCRIPTION:${escapeICalText(`Período no disponible. Razón: ${block.reason || 'No especificada'}.`)}`,
        `END:VEVENT`
        );
    });

    const safeFilename = property.name ? property.name.replace(/[^a-zA-Z0-9]/g, '_') : 'propiedad';

    const iCalContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//AiresDeMiramar//GestorDeAlquileres//EN`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeICalText(property.name || 'Propiedad')}`,
      ...events,
      'END:VCALENDAR',
    ].join('\r\n');

    return new Response(iCalContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="calendar_${safeFilename}.ics"`,
      },
    });
  } catch (error) {
    console.error('Error generating iCal feed:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
