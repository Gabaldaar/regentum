
'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  Pencil,
  Landmark,
  PenLine,
  ShieldCheck,
  Mail,
  Loader2,
  Calendar,
  Moon,
  DollarSign,
  MapPin,
  History,
  FileDown,
  FileText,
} from 'lucide-react';
import {
  BookingWithDetails,
  PaymentWithDetails,
  Origin,
  BookingStatus,
  ContractStatus,
} from '@/lib/data';
import { format, differenceInDays, isWithinInterval, isPast, startOfToday, isSameDay } from 'date-fns';
import { Locale } from 'date-fns';
import { es, enUS, ptBR, fr } from 'date-fns/locale';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cn, parseDateSafely } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

interface BookingDetailDialogProps {
  booking: BookingWithDetails | null;
  isOpen: boolean;
  origins?: Origin[];
  onOpenChange: (open: boolean) => void;
  onEdit: (booking: BookingWithDetails) => void;
  onPayment: (booking: BookingWithDetails) => void;
  onSignature: (booking: BookingWithDetails) => void;
  onGuarantee: (booking: BookingWithDetails) => void;
  onEmail: (booking: BookingWithDetails) => void;
  onUpdateContractStatus?: (bookingId: string, status: ContractStatus) => void;
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-shrink-0">
        {label}
      </span>
      <div className="text-sm font-medium text-right">{children}</div>
    </div>
  );
}

export function BookingDetailDialog({
  booking,
  isOpen,
  origins,
  onOpenChange,
  onEdit,
  onPayment,
  onSignature,
  onGuarantee,
  onEmail,
  onUpdateContractStatus,
}: BookingDetailDialogProps) {
  const { t, language } = useTranslation();
  const [payments, setPayments] = useState<PaymentWithDetails[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const today = startOfToday();

  const originsMap = new Map(origins?.map((o: Origin) => [o.id, o]) || []);

  const localeMap: Record<string, Locale> = { es, en: enUS, pt: ptBR, fr };
  const currentLocale = localeMap[language] || es;

  const formatDate = (date: Date | undefined) => {
    if (!date || isNaN(date.getTime())) return '—';
    return format(new Date(date.valueOf() + date.getTimezoneOffset() * 60 * 1000), 'PP', {
      locale: currentLocale,
    });
  };

  const formatDateShort = (dateString: string) => {
    const date = parseDateSafely(dateString);
    if (!date) return '—';
    return format(date, "dd 'de' LLL, yyyy", { locale: es });
  };

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);

  const fetchPayments = useCallback(async () => {
    if (!booking) return;
    setIsLoadingPayments(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'payments'), where('bookingId', '==', booking.id))
      );
      const list = snap.docs
        .map((d) => {
          const p = { id: d.id, ...d.data() } as any;
          return {
            ...p,
            propertyId: booking.propertyId,
            propertyName: booking.property?.name || '',
            tenantName: booking.tenant?.name || '',
            amountUSD: p.currency === 'USD' ? p.amount : 0,
            amountARS: p.currency === 'ARS' ? p.amount : 0,
          } as PaymentWithDetails;
        })
        .sort(
          (a, b) =>
            (parseDateSafely(b.date)?.getTime() || 0) -
            (parseDateSafely(a.date)?.getTime() || 0)
        );
      setPayments(list);
    } catch (e) {
      console.error('Error fetching payments:', e);
    } finally {
      setIsLoadingPayments(false);
    }
  }, [booking]);

  useEffect(() => {
    if (isOpen && booking) {
      fetchPayments();
    } else {
      setPayments([]);
    }
  }, [isOpen, booking, fetchPayments]);

  if (!booking) return null;

  const startDate = parseDateSafely(booking.startDate);
  const endDate = parseDateSafely(booking.endDate);
  const nights = startDate && endDate ? differenceInDays(endDate, startDate) : 0;
  const isCancelled = booking.status === 'cancelled';
  const isPending = booking.status === 'pending';
  const isCurrent =
    startDate && endDate
      ? isWithinInterval(today, { start: startDate, end: endDate })
      : false;

  let visualStatus: BookingStatus = (booking.status as BookingStatus) || 'active';
  if (!isCancelled && !isPending && endDate && isPast(endDate) && !isSameDay(endDate, today)) {
    visualStatus = 'closed';
  }

  const isInactive = isCancelled || isPending;
  const origin = originsMap.get(booking.originId || '');
  const bookingCurrency = booking.currency || 'USD';
  const totalPaid = payments.reduce((acc, p) => acc + (p.amount || 0), 0);

  let countdownText = '';
  if (startDate && startDate > today && !isCancelled && !isPending) {
    const days = differenceInDays(startDate, today);
    countdownText =
      days === 0
        ? '¡Check-in Hoy!'
        : t('bookings.countdown.checkin')
            .replace('{{count}}', days.toString())
            .replace('{{unit}}', days === 1 ? t('bookings.countdown.day') : t('bookings.countdown.days'));
  } else if (isCurrent && endDate) {
    const days = differenceInDays(endDate, today);
    countdownText =
      days === 0
        ? '¡Check-out Hoy!'
        : t('bookings.countdown.checkout')
            .replace('{{count}}', days.toString())
            .replace('{{unit}}', days === 1 ? t('bookings.countdown.day') : t('bookings.countdown.days'));
  }

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    pending: 'secondary',
    cancelled: 'destructive',
    closed: 'outline',
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {/* ── HEADER ── */}
        <DialogHeader
          className={cn(
            'p-6 pb-4 rounded-t-lg',
            isCurrent
              ? 'bg-green-500/10'
              : isCancelled
              ? 'bg-red-500/10'
              : isPending
              ? 'bg-yellow-500/10'
              : visualStatus === 'closed'
              ? 'bg-zinc-500/10'
              : 'bg-blue-500/10'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-bold truncate">
                {booking.property?.name}
              </DialogTitle>
              <p className="text-base font-semibold text-primary mt-0.5 truncate">
                {booking.tenant?.name}
              </p>
            </div>
            <Badge
              variant={statusVariant[visualStatus] ?? 'outline'}
              className="text-[10px] uppercase h-5 flex-shrink-0 mt-1"
            >
              {t(`bookings.status.${visualStatus}`)}
            </Badge>
          </div>

          {countdownText && (
            <p
              className={cn(
                'text-xs font-black uppercase mt-2 flex items-center gap-1.5',
                isCurrent ? 'text-blue-600' : 'text-orange-600'
              )}
            >
              <History className="h-3.5 w-3.5" />
              {countdownText}
            </p>
          )}
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5">
          {/* ── DETALLE DE LA ESTADÍA ── */}
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {t('bookings.detail_dialog.section_stay')}
            </h3>
            <div className="rounded-lg border bg-muted/30 divide-y">
              <InfoRow label={t('bookings.table.stay')}>
                <span>
                  {formatDate(startDate)} → {formatDate(endDate)}
                </span>
              </InfoRow>
              <InfoRow label={t('bookings.table.nights')}>
                <Badge variant="outline">{nights} {t('bookings.table.nights')}</Badge>
              </InfoRow>
              <InfoRow label={t('bookings.table.amount')}>
                <span className="text-base font-bold">
                  {formatCurrency(booking.amount, bookingCurrency)}
                </span>
              </InfoRow>
              <InfoRow label={t('bookings.table.balance')}>
                <span
                  className={cn(
                    'text-base font-black',
                    booking.balance > 0.01 ? 'text-orange-600' : 'text-green-600'
                  )}
                >
                  {formatCurrency(booking.balance, bookingCurrency)}
                </span>
              </InfoRow>
            </div>
          </section>

          {/* ── ESTADO Y ORIGEN ── */}
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {t('bookings.detail_dialog.section_info')}
            </h3>
            <div className="rounded-lg border bg-muted/30 divide-y">
              {origin && (
                <InfoRow label={t('bookings.filters.origin')}>
                  <Badge style={{ backgroundColor: origin.color, color: 'white' }} className="text-[10px]">
                    {origin.name}
                  </Badge>
                </InfoRow>
              )}
              <InfoRow label={t('bookings.filters.contract')}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] cursor-pointer hover:opacity-80 transition-all select-none flex items-center gap-1",
                        booking.contractStatus === 'signed'
                            ? "border-green-500 text-green-700 bg-green-50/50"
                            : booking.contractStatus === 'sent'
                            ? "border-blue-500 text-blue-700 bg-blue-50/50"
                            : booking.contractStatus === 'not_required'
                            ? "border-zinc-400 text-zinc-500 bg-zinc-50/50"
                            : "border-primary text-primary"
                      )}
                    >
                      <FileText className="h-3 w-3" />
                      {t(`bookings.contract_status.${booking.contractStatus || 'not_sent'}`)}
                    </Badge>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {t('bookings.filters.contract')}
                    </DropdownMenuLabel>
                    
                    <DropdownMenuItem 
                      onClick={() => window.open(`/contract?id=${booking.id}`, '_blank')}
                      className="cursor-pointer"
                    >
                      <FileDown className="h-4 w-4 mr-2 text-primary" />
                      <span>Enviar PDF</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem 
                      onClick={() => {
                        onOpenChange(false);
                        onSignature(booking);
                      }}
                      className="cursor-pointer"
                      disabled={isInactive}
                    >
                      <PenLine className="h-4 w-4 mr-2 text-blue-600" />
                      <span>Firma Digital</span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Cambiar Estado
                    </DropdownMenuLabel>
                    
                    <DropdownMenuRadioGroup 
                      value={booking.contractStatus || 'not_sent'} 
                      onValueChange={(val) => onUpdateContractStatus?.(booking.id, val as ContractStatus)}
                    >
                      <DropdownMenuRadioItem value="not_sent" className="text-xs cursor-pointer">
                        {t('bookings.contract_status.not_sent')}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="sent" className="text-xs cursor-pointer">
                        {t('bookings.contract_status.sent')}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="signed" className="text-xs cursor-pointer">
                        {t('bookings.contract_status.signed')}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="not_required" className="text-xs cursor-pointer">
                        {t('bookings.contract_status.not_required')}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </InfoRow>
              <InfoRow label={t('bookings.filters.guarantee')}>
                <Badge variant="outline" className="border-orange-500 text-orange-700 text-[10px]">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  {t(`bookings.guarantee_status.${booking.guaranteeStatus || 'not_solicited'}`)}
                </Badge>
              </InfoRow>
              {booking.notes && (
                <InfoRow label={t('bookings.tooltips.notes')}>
                  <span className="text-muted-foreground italic max-w-xs text-right text-xs leading-snug">
                    {booking.notes}
                  </span>
                </InfoRow>
              )}
            </div>
          </section>

          {/* ── PAGOS ── */}
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              {t('bookings.detail_dialog.section_payments')}
            </h3>

            {isLoadingPayments ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : payments.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/20 flex flex-col items-center justify-center py-6 text-center">
                <Moon className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {t('bookings.detail_dialog.no_payments')}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-[10px] uppercase font-bold py-2">{t('common.date')}</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold py-2">{t('tasks.table.description')}</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold py-2 text-right">
                        {t('bookings.detail_dialog.credited')} ({bookingCurrency})
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs py-2 whitespace-nowrap">
                          {formatDateShort(p.date)}
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          <p className="font-medium">{p.description || '—'}</p>
                          {p.receivedCurrency !== p.currency && (
                            <p className="text-[10px] text-muted-foreground italic">
                              {p.receivedCurrency} {p.receivedAmount?.toFixed(2)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-2 text-right font-bold">
                          {formatCurrency(p.amount, bookingCurrency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="text-right text-xs font-bold py-2">
                        {t('bookings.detail_dialog.total_paid')}
                      </TableCell>
                      <TableCell className="text-right font-bold text-xs py-2">
                        {formatCurrency(totalPaid, bookingCurrency)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={2} className="text-right text-xs font-bold py-2">
                        {t('bookings.detail_dialog.balance')}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-black text-xs py-2',
                          booking.balance > 0.01 ? 'text-orange-600' : 'text-green-600'
                        )}
                      >
                        {formatCurrency(booking.balance, bookingCurrency)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </section>

          <hr className="border-border" />

          {/* ── BOTONES DE ACCIÓN ── */}
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
              {t('common.actions')}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button
                variant="outline"
                className="flex flex-col h-auto py-3 gap-1.5 items-center"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(booking);
                }}
              >
                <Pencil className="h-4 w-4" />
                <span className="text-[11px] font-semibold">{t('common.edit')}</span>
              </Button>

              <Button
                variant="outline"
                className="flex flex-col h-auto py-3 gap-1.5 items-center text-green-700 border-green-300 hover:bg-green-50 hover:text-green-800"
                disabled={isInactive}
                onClick={() => {
                  onOpenChange(false);
                  onPayment(booking);
                }}
              >
                <Landmark className="h-4 w-4" />
                <span className="text-[11px] font-semibold">{t('bookings.detail_dialog.action_payment')}</span>
              </Button>

              <Button
                variant="outline"
                className="flex flex-col h-auto py-3 gap-1.5 items-center text-blue-700 border-blue-300 hover:bg-blue-50 hover:text-blue-800"
                disabled={isInactive}
                onClick={() => {
                  onOpenChange(false);
                  onSignature(booking);
                }}
              >
                <PenLine className="h-4 w-4" />
                <span className="text-[11px] font-semibold">{t('bookings.detail_dialog.action_signature')}</span>
              </Button>

              <Button
                variant="outline"
                className="flex flex-col h-auto py-3 gap-1.5 items-center text-orange-700 border-orange-300 hover:bg-orange-50 hover:text-orange-800"
                disabled={isCancelled}
                onClick={() => {
                  onOpenChange(false);
                  onGuarantee(booking);
                }}
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="text-[11px] font-semibold">{t('bookings.detail_dialog.action_guarantee')}</span>
              </Button>
            </div>

            {/* Email: fila separada si el inquilino tiene email */}
            {booking.tenant?.email && (
              <Button
                variant="ghost"
                className="w-full mt-2 text-muted-foreground hover:text-foreground"
                disabled={isInactive}
                onClick={() => {
                  onOpenChange(false);
                  onEmail(booking);
                }}
              >
                <Mail className="h-4 w-4 mr-2" />
                {t('bookings.tooltips.email')} — {booking.tenant.email}
              </Button>
            )}
          </section>

          {/* ── CERRAR ── */}
          <div className="pt-2">
            <Button
              variant="secondary"
              className="w-full h-10 font-semibold"
              onClick={() => onOpenChange(false)}
            >
              {t('common.close')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
