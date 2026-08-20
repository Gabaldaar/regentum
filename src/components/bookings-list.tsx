
'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookingWithDetails, Property, Tenant, Origin, Provider, TaskAssignment, BookingStatus } from "@/lib/data";
import { format, isWithinInterval, isPast, startOfToday, differenceInDays, isSameDay } from 'date-fns';
import { es, enUS, ptBR, fr } from 'date-fns/locale';
import { cn, parseDateSafely } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "./ui/tooltip";
import Link from "next/link";
import { Button } from "./ui/button";
import { BookingPaymentsManager } from './booking-payments-manager';
import { BookingEditForm } from './booking-edit-form';
import { BookingDeleteForm } from './booking-delete-form';
import { NotesViewer } from './notes-viewer';
import { GuaranteeManager } from './guarantee-manager';
import { BookingDetailDialog } from './booking-detail-dialog';
import { Pencil, Trash2, FileText, Calculator, Mail, PenLine, History, ShieldCheck, CalendarX } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { EmailSender } from "./email-sender";
import { PaymentAddForm, PaymentPreloadData } from "./payment-add-form";
import PaymentCalculator from "./payment-calculator";
import { Dialog, DialogContent } from "./ui/dialog";
import { TenantDetailsDialog } from "./tenant-details-dialog";
import { useToast } from "./ui/use-toast";
import { useTranslation } from "@/i18n/useTranslation";

interface BookingsListProps {
  bookings: BookingWithDetails[];
  properties: Property[];
  tenants: Tenant[];
  origins?: Origin[];
  providers?: Provider[];
  showProperty?: boolean;
  onDataChanged: () => void;
  isPersonalFlavor: boolean;
}

export default function BookingsList({ 
  bookings, 
  properties, 
  tenants, 
  origins, 
  providers, 
  showProperty = false, 
  onDataChanged, 
  isPersonalFlavor 
}: BookingsListProps) {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const [baseUrl, setBaseUrl] = useState('');
  const today = startOfToday();

  const [editingBooking, setEditingBooking] = useState<BookingWithDetails | null>(null);
  const [deletingBooking, setDeletingBooking] = useState<BookingWithDetails | null>(null);
  const [addingPaymentForBooking, setAddingPaymentForBooking] = useState<BookingWithDetails | null>(null);
  const [calculatorBooking, setCalculatorBooking] = useState<BookingWithDetails | null>(null);
  const [emailBooking, setEmailBooking] = useState<BookingWithDetails | null>(null);
  const [notesBooking, setNotesBooking] = useState<BookingWithDetails | null>(null);
  const [paymentsBooking, setPaymentsBooking] = useState<BookingWithDetails | null>(null);
  const [guaranteeBooking, setGuaranteeBooking] = useState<BookingWithDetails | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [detailBooking, setDetailBooking] = useState<BookingWithDetails | null>(null);

  const [paymentPreloadData, setPaymentPreloadData] = useState<PaymentPreloadData | undefined>(undefined);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
        setBaseUrl(window.location.origin);
    }
  }, []);

  const originsMap = useMemo(() => new Map(origins?.map((o: Origin) => [o.id, o]) || []), [origins]);

  const formatDate = (date: Date | undefined) => {
    if (!date || isNaN(date.getTime())) return "Fecha inv.";
    const localeMap: any = { es, en: enUS, pt: ptBR, fr };
    const currentLocale = localeMap[language] || es;
    return format(new Date(date.valueOf() + date.getTimezoneOffset() * 60 * 1000), "PP", { locale: currentLocale });
  };

  const formatCurrency = (amount: number, currency: string) => 
    new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

  const handleOpenWhatsAppSignature = (booking: BookingWithDetails) => {
    const tenantName = booking.tenant?.name || '';
    const signatureLink = `${baseUrl}/sign/${booking.id}`;
    const message = t('bookings.whatsapp.signature_message').replace('{{name}}', tenantName).replace('{{link}}', signatureLink);
    navigator.clipboard.writeText(message);
    toast({ title: t('common.success'), description: t('bookings.tooltips.signature_copy_success') });
    if (booking.tenant?.phone) {
        const countryCode = (booking.tenant.countryCode || '+54').replace('+', '');
        const sanitizedPhone = booking.tenant.phone.replace(/[^0-9]/g, '');
        window.open(`https://wa.me/${countryCode}${sanitizedPhone}?text=${encodeURIComponent(message)}`, '_blank');
    }
  };

  const getStatusStyles = (status: BookingStatus) => {
      switch(status) {
          case 'cancelled': return { header: "bg-red-500/10", border: "border-red-500/30", title: "text-red-700" };
          case 'pending': return { header: "bg-yellow-500/10", border: "border-yellow-500/30", title: "text-amber-700" };
          case 'closed': return { header: "bg-zinc-500/10", border: "border-zinc-500/30", title: "text-zinc-700" };
          default: return { header: "bg-blue-500/10", border: "border-blue-500/30", title: "text-blue-700" };
      }
  }

  const renderActions = (booking: BookingWithDetails) => {
    const isInactive = booking.status === 'cancelled' || booking.status === 'pending';
    return (
        <div className="flex flex-wrap items-center justify-end gap-1">
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setNotesBooking(booking)} disabled={!booking.notes}>
                            <FileText className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>{t('bookings.tooltips.notes')}</p></TooltipContent>
                </Tooltip>

                {isPersonalFlavor && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCalculatorBooking(booking)} disabled={isInactive}>
                                <Calculator className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>{t('bookings.tooltips.calculator')}</p></TooltipContent>
                    </Tooltip>
                )}

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEmailBooking(booking)} disabled={isInactive || !booking.tenant?.email}>
                            <Mail className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>{t('bookings.tooltips.email')}</p></TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500" onClick={() => handleOpenWhatsAppSignature(booking)} disabled={isInactive}>
                            <PenLine className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>{t('bookings.tooltips.signature')}</p></TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingBooking(booking)}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>{t('common.edit')}</p></TooltipContent>
                </Tooltip>
                
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingBooking(booking)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>{t('common.delete')}</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
  };

  if (bookings.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed rounded-3xl bg-muted/20">
            <CalendarX className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-bold text-muted-foreground">{t('bookings.no_bookings')}</h3>
            <p className="text-sm text-muted-foreground/60 max-w-xs">{t('common.empty_states.bookings_desc')}</p>
        </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-24">
        {bookings.map((b: BookingWithDetails) => {
            const startDate = parseDateSafely(b.startDate);
            const endDate = parseDateSafely(b.endDate);
            const isCancelled = b.status === 'cancelled';
            const isPending = b.status === 'pending';
            const isCurrent = startDate && endDate ? isWithinInterval(today, { start: startDate, end: endDate }) : false;
            const origin = originsMap.get(b.originId || '');
            const nights = startDate && endDate ? differenceInDays(endDate, startDate) : 0;
            
            let visualStatus: BookingStatus = (b.status as BookingStatus) || 'active';
            if (!isCancelled && !isPending && endDate && isPast(endDate) && !isSameDay(endDate, today)) {
                visualStatus = 'closed';
            }

            const styles = getStatusStyles(visualStatus);

            let countdownText = '';
            if (startDate && startDate > today && !isCancelled && !isPending) {
                const days = differenceInDays(startDate!, today);
                countdownText = days === 0 ? "¡Check-in Hoy!" : t('bookings.countdown.checkin').replace('{{count}}', days.toString()).replace('{{unit}}', days === 1 ? t('bookings.countdown.day') : t('bookings.countdown.days'));
            } else if (isCurrent && endDate) {
                const days = differenceInDays(endDate!, today);
                countdownText = days === 0 ? "¡Check-out Hoy!" : t('bookings.countdown.checkout').replace('{{count}}', days.toString()).replace('{{unit}}', days === 1 ? t('bookings.countdown.day') : t('bookings.countdown.days'));
            }

            return (
                <Card key={b.id} className={cn("overflow-hidden border-2 shadow-sm flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-xl", isCurrent ? "border-green-500" : styles.border)}>
                    <CardHeader
                        className={cn("p-4 py-3 cursor-pointer select-none", isCurrent ? "bg-green-500/10" : styles.header)}
                        onClick={() => setDetailBooking(b)}
                    >
                        <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0 flex-1">
                                <CardTitle className="text-base truncate font-bold">{b.property?.name}</CardTitle>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setSelectedTenant(tenants.find((t: Tenant) => t.id === b.tenantId) || null); }}
                                    className="font-bold text-primary hover:underline block text-left truncate"
                                >
                                    {b.tenant?.name}
                                </button>
                            </div>
                            <Badge variant={isCancelled ? "destructive" : isPending ? "secondary" : isCurrent ? "default" : "outline"} className="text-[10px] h-5 uppercase">
                                {t(`bookings.status.${visualStatus}`)}
                            </Badge>
                        </div>
                        {countdownText && (
                            <p className={cn("text-[10px] font-black uppercase mt-1 flex items-center gap-1", isCurrent ? "text-blue-600" : "text-orange-600")}>
                                <History className="h-3 w-3" />
                                {countdownText}
                            </p>
                        )}
                    </CardHeader>
                    <CardContent className="p-4 space-y-4 text-sm flex-grow cursor-pointer" onClick={() => setDetailBooking(b)}>
                        <div className="flex justify-between items-center border-b pb-2">
                            <div className="flex flex-col">
                                <span className="text-muted-foreground text-[10px] uppercase font-bold">{t('bookings.table.stay')}</span>
                                <span className="font-medium">{formatDate(startDate)} → {formatDate(endDate)}</span>
                            </div>
                            <Badge variant="outline" className="h-6">{nights} {t('bookings.table.nights')}</Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <p className="text-muted-foreground text-[10px] uppercase font-bold">{t('bookings.table.amount')}</p>
                                <p className="font-bold text-lg leading-none">{formatCurrency(b.amount, b.currency)}</p>
                            </div>
                            <div className="space-y-1 text-right">
                                <p className="text-muted-foreground text-[10px] uppercase font-bold">{t('bookings.table.balance')}</p>
                                <p className={cn("font-black text-lg leading-none", b.balance > 0.01 ? 'text-orange-600' : 'text-green-600')}>
                                    {formatCurrency(b.balance, b.currency)}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                            {origin && (
                                <Badge style={{ backgroundColor: origin.color, color: 'white' }} className="h-5 text-[10px]">
                                    {origin.name}
                                </Badge>
                            )}
                            <Link href={`/contract?id=${b.id}`} target="_blank">
                                <Badge variant="outline" className="h-5 text-[10px] border-primary text-primary">
                                    {t(`bookings.contract_status.${b.contractStatus || 'not_sent'}`)}
                                </Badge>
                            </Link>
                            <button onClick={() => !isCancelled && setGuaranteeBooking(b)}>
                                <Badge variant="outline" className="h-5 text-[10px] border-orange-500 text-orange-700">
                                    <ShieldCheck className="h-3 w-3 mr-1" />
                                    {t(`bookings.guarantee_status.${b.guaranteeStatus || 'not_solicited'}`)}
                                </Badge>
                            </button>
                        </div>
                    </CardContent>
                    <CardFooter className="p-2 px-4 justify-end border-t bg-muted/30">
                        {renderActions(b)}
                    </CardFooter>
                </Card>
            );
        })}

        {editingBooking && (
            <BookingEditForm 
                booking={editingBooking} 
                tenants={tenants} 
                properties={properties} 
                isOpen={!!editingBooking} 
                onOpenChange={(o) => !o && setEditingBooking(null)} 
                onBookingUpdated={onDataChanged} 
            />
        )}
        
        {addingPaymentForBooking && (
            <PaymentAddForm 
                bookingId={addingPaymentForBooking.id} 
                booking={addingPaymentForBooking} 
                onPaymentAdded={onDataChanged} 
                isOpen={isAddPaymentOpen} 
                onOpenChange={setIsAddPaymentOpen} 
                preloadData={paymentPreloadData} 
            />
        )}

        {calculatorBooking && (
            <Dialog open={!!calculatorBooking} onOpenChange={(o) => !o && setCalculatorBooking(null)}>
                <DialogContent>
                    <PaymentCalculator 
                        booking={calculatorBooking} 
                        onRegisterPayment={(d) => { 
                            setPaymentPreloadData(d); 
                            setAddingPaymentForBooking(calculatorBooking); 
                            setIsAddPaymentOpen(true); 
                            setCalculatorBooking(null); 
                        }} 
                    />
                </DialogContent>
            </Dialog>
        )}

        {emailBooking && (
            <EmailSender 
                booking={emailBooking} 
                isOpen={!!emailBooking} 
                onOpenChange={(o) => !o && setEmailBooking(null)} 
            />
        )}

        {notesBooking && (
            <NotesViewer 
                notes={notesBooking.notes} 
                title={`${t('bookings.tooltips.notes')} - ${notesBooking.tenant?.name}`} 
                isOpen={!!notesBooking} 
                onOpenChange={(o) => !o && setNotesBooking(null)} 
            />
        )}

        {paymentsBooking && (
            <BookingPaymentsManager 
                bookingId={paymentsBooking.id} 
                isOpen={!!paymentsBooking} 
                onOpenChange={(o) => !o && setPaymentsBooking(null)} 
                onAddPaymentClick={() => { 
                    setAddingPaymentForBooking(paymentsBooking); 
                    setIsAddPaymentOpen(true); 
                }} 
                onPaymentActionComplete={onDataChanged}
            />
        )}

        {deletingBooking && (
            <BookingDeleteForm 
                bookingId={deletingBooking.id} 
                propertyId={deletingBooking.propertyId} 
                isOpen={!!deletingBooking} 
                onOpenChange={(o) => !o && setDeletingBooking(null)} 
                onActionComplete={onDataChanged} 
            />
        )}

        {selectedTenant && (
            <TenantDetailsDialog 
                tenant={selectedTenant} 
                isOpen={!!selectedTenant} 
                onOpenChange={(o) => !o && setSelectedTenant(null)} 
            />
        )}

        {guaranteeBooking && (
            <GuaranteeManager 
                booking={guaranteeBooking} 
                isOpen={!!guaranteeBooking} 
                onOpenChange={(o) => !o && setGuaranteeBooking(null)} 
            />
        )}

        {detailBooking && (
            <BookingDetailDialog
                booking={detailBooking}
                isOpen={!!detailBooking}
                origins={origins}
                onOpenChange={(o) => !o && setDetailBooking(null)}
                onEdit={(b) => setEditingBooking(b)}
                onPayment={(b) => {
                    setPaymentsBooking(b);
                }}
                onSignature={(b) => handleOpenWhatsAppSignature(b)}
                onGuarantee={(b) => setGuaranteeBooking(b)}
                onEmail={(b) => setEmailBooking(b)}
            />
        )}
    </div>
  );
}
