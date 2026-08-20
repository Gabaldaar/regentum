
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mail, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Payment, BookingWithDetails, PaymentWithDetails } from '@/lib/data';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { PaymentEditForm } from './payment-edit-form';
import { PaymentDeleteForm } from './payment-delete-form';
import { useToast } from '@/components/ui/use-toast';
import { EmailSender } from './email-sender';
import { cn, parseDateSafely } from '@/lib/utils';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useTranslation } from '@/i18n/useTranslation';
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface BookingPaymentsManagerProps {
    bookingId: string;
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onAddPaymentClick: () => void;
    onPaymentActionComplete?: () => void;
}

export function BookingPaymentsManager({ bookingId, isOpen, onOpenChange, onAddPaymentClick, onPaymentActionComplete }: BookingPaymentsManagerProps) {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<PaymentWithDetails[]>([]);
  const [booking, setBooking] = useState<BookingWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [isEmailSenderOpen, setIsEmailSenderOpen] = useState(false);
  const [selectedPaymentForEmail, setSelectedPaymentForEmail] = useState<Payment | undefined>(undefined);
  
  const [editingPayment, setEditingPayment] = useState<PaymentWithDetails | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<PaymentWithDetails | null>(null);

  const fetchPaymentsAndBooking = useCallback(async () => {
    setIsLoading(true);
    try {
        const [paymentsSnap, bookingSnap] = await Promise.all([
            getDocs(query(collection(db, 'payments'), where('bookingId', '==', bookingId))),
            getDoc(doc(db, 'bookings', bookingId))
        ]);

        if (!bookingSnap.exists()) {
            setBooking(null);
            setPayments([]);
            return;
        }

        const bookingData = { id: bookingSnap.id, ...bookingSnap.data() } as BookingWithDetails;
        
        const [propSnap, tenantSnap] = await Promise.all([
            getDoc(doc(db, 'properties', bookingData.propertyId)),
            getDoc(doc(db, 'tenants', bookingData.tenantId))
        ]);
        
        const enrichedBooking = {
            ...bookingData,
            property: propSnap.exists() ? { id: propSnap.id, ...propSnap.data() } as any : null,
            tenant: tenantSnap.exists() ? { id: tenantSnap.id, ...tenantSnap.data() } as any : null
        };
        setBooking(enrichedBooking);

        const paymentsList = paymentsSnap.docs.map(d => {
            const p = { id: d.id, ...d.data() } as any;
            return {
                ...p,
                propertyId: bookingData.propertyId,
                propertyName: enrichedBooking.property?.name || 'Desconocida',
                tenantName: enrichedBooking.tenant?.name || 'Desconocido',
                // El campo "amount" ya contiene el valor convertido a la moneda de la deuda en Personal,
                // o el valor original en Comercial.
                amountUSD: p.currency === 'USD' ? p.amount : 0,
                amountARS: p.currency === 'ARS' ? p.amount : 0
            };
        }).sort((a, b) => (parseDateSafely(b.date)?.getTime() || 0) - (parseDateSafely(a.date)?.getTime() || 0));
        
        setPayments(paymentsList);

    } catch (error) {
        console.error("Error fetching payments or booking:", error);
    } finally {
        setIsLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    if (isOpen) {
      fetchPaymentsAndBooking();
    }
  }, [isOpen, fetchPaymentsAndBooking]);

  const handlePaymentAction = () => {
    fetchPaymentsAndBooking();
    onPaymentActionComplete?.();
  };

  const openEmailSender = (payment: Payment) => {
    setSelectedPaymentForEmail(payment);
    setIsEmailSenderOpen(true);
  };
  
  const handleAddNewPayment = () => {
      onOpenChange(false);
      onAddPaymentClick();
  }

  const formatDate = (dateString: string) => {
    const date = parseDateSafely(dateString);
    if (!date) return "Fecha Inválida";
    return format(date, "dd 'de' LLL, yyyy", { locale: es });
  };

  const formatCurrency = (amount: number, currency: string) => {
    try {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch (e) {
        return `${currency} ${amount.toFixed(2)}`;
    }
  };

  const bookingCurrency = booking?.currency || 'USD';
  const totalAmountCredited = payments.reduce((acc, p) => acc + (p.amount || 0), 0);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('bookings.payments_dialog.title')}</DialogTitle>
            {booking && (
              <DialogDescription>
                {t('bookings.payments_dialog.description')
                  .replace('{{tenant}}', booking.tenant?.name || 'N/A')
                  .replace('{{property}}', booking.property?.name || 'N/A')}
              </DialogDescription>
            )}
          </DialogHeader>
          
           <div className="flex justify-end">
                <Button onClick={handleAddNewPayment}>{t('bookings.payments_dialog.add_payment')}</Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.from')}</TableHead>
                  <TableHead>{t('tasks.table.description')}</TableHead>
                  <TableHead className="text-right">Monto Acreditado ({bookingCurrency})</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length > 0 ? (
                    payments.map((payment) => (
                    <TableRow key={payment.id}>
                        <TableCell>{formatDate(payment.date)}</TableCell>
                        <TableCell>
                            <p className="font-medium">{payment.description}</p>
                            {payment.receivedCurrency !== payment.currency && (
                                <p className="text-[10px] text-muted-foreground italic">
                                    Original: {payment.receivedCurrency} {payment.receivedAmount?.toFixed(2)}
                                </p>
                            )}
                        </TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(payment.amount, bookingCurrency)}</TableCell>
                        <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEmailSender(payment)} disabled={!booking?.tenant?.email}>
                                        <Mail className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('bookings.tooltips.email')}</p></TooltipContent>
                            </Tooltip>
                            
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingPayment(payment)}>
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('common.edit')}</p></TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingPayment(payment)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('common.delete')}</p></TooltipContent>
                            </Tooltip>
                        </div>
                        </TableCell>
                    </TableRow>
                    ))
                ) : (
                    <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                            {t('bookings.no_bookings')}
                        </TableCell>
                    </TableRow>
                )}
              </TableBody>
              <TableFooter>
                  <TableRow>
                      <TableCell colSpan={2} className="font-bold text-right">Total Pagado ({bookingCurrency})</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(totalAmountCredited, bookingCurrency)}</TableCell>
                      <TableCell></TableCell>
                  </TableRow>
                  {booking && (
                    <TableRow>
                        <TableCell colSpan={2} className="font-bold text-right">Saldo Pendiente</TableCell>
                        <TableCell className={cn("text-right font-bold", booking.balance > 0.01 ? 'text-orange-600' : 'text-green-600')}>
                             {formatCurrency(booking.balance, bookingCurrency)}
                        </TableCell>
                        <TableCell></TableCell>
                    </TableRow>
                  )}
              </TableFooter>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      {booking && (
          <EmailSender 
            booking={booking} 
            payment={selectedPaymentForEmail}
            isOpen={isEmailSenderOpen}
            onOpenChange={setIsEmailSenderOpen}
          />
      )}

      {editingPayment && (
          <PaymentEditForm 
            payment={editingPayment} 
            isOpen={!!editingPayment}
            onOpenChange={(open) => !open && setEditingPayment(null)}
            onPaymentUpdated={handlePaymentAction} 
          />
      )}

      {deletingPayment && (
          <PaymentDeleteForm 
            paymentId={deletingPayment.id} 
            isOpen={!!deletingPayment}
            onOpenChange={(open) => !open && setDeletingPayment(null)}
            onPaymentDeleted={handlePaymentAction} 
          />
      )}
    </>
  );
}
