'use client';

import { useEffect, useRef, useState, useTransition, useMemo, useCallback } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addPayment } from '@/lib/actions';
import { Calendar as CalendarIcon, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar } from './ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { useToast } from './ui/use-toast';
import { BookingWithDetails, getBookingWithDetails, CurrencySettings } from '@/lib/data';
import { useAuth } from './auth-provider';
import { currencies } from '@/lib/currencies';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useTranslation } from "@/i18n/useTranslation";

export interface Categoria { id: string; nombre: string; propertyIds?: string[]; }
export interface Cuenta { id: string; nombre: string; }
export interface Billetera { id: string; nombre: string; currency?: string; propertyIds?: string[]; }
export interface DatosImputacion {
    categorias: Categoria[];
    cuentas: Cuenta[];
    billeteras: Billetera[];
}

const initialState = {
  message: '',
  success: false,
};

export interface PaymentPreloadData {
  amount: number;
  currency: 'USD' | 'ARS';
  exchangeRate?: number;
}

function SubmitButton({ isPending, disabled, onClick }: { isPending: boolean; disabled?: boolean; onClick?: (e: React.MouseEvent) => void }) {
  const { t } = useTranslation();
  return (
    <Button type="submit" disabled={isPending || disabled} onClick={onClick} className="font-bold uppercase text-[10px] tracking-widest h-11 px-8 shadow-lg">
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t('common.loading')}
        </>
      ) : (
        t('bookings.payments_dialog.add_payment')
      )}
    </Button>
  );
}

interface PaymentAddFormProps {
  bookingId: string;
  booking?: BookingWithDetails; 
  onPaymentAdded: () => void;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  preloadData?: PaymentPreloadData;
}

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


export function PaymentAddForm({
  bookingId,
  booking: initialBooking,
  onPaymentAdded,
  isOpen,
  onOpenChange,
  preloadData,
}: PaymentAddFormProps) {
  const { appUser, orgId } = useAuth();
  const { t } = useTranslation();
  const isPersonalFlavor = appUser?.appFlavor === 'personal';

  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [currency, setCurrency] = useState<string>(initialBooking?.currency || 'USD');
  const [amount, setAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const { toast } = useToast();

  const [datosImputacion, setDatosImputacion] = useState<DatosImputacion | null>(null);
  const [isFetchingFinanceData, setIsFetchingFinanceData] = useState(false);
  const [financeApiError, setFinanceApiError] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [categoriaId, setCategoriaId] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [billeteraId, setBilleteraId] = useState('');

  const [booking, setBooking] = useState<BookingWithDetails | null>(initialBooking || null);
  const [dollarRateForBalance, setDollarRateForBalance] = useState<number | null>(null);
  const [currencySettings, setCurrencySettings] = useState<CurrencySettings | null>(null);

  // Filtrado en cascada según la Cuenta de Imputación seleccionada
  const filteredCategorias = useMemo(() => {
    if (!datosImputacion?.categorias) return [];
    if (!cuentaId) return [];
    return datosImputacion.categorias.filter(cat => 
      !cat.propertyIds || cat.propertyIds.length === 0 || cat.propertyIds.includes(cuentaId)
    );
  }, [datosImputacion, cuentaId]);

  const filteredBilleteras = useMemo(() => {
    if (!datosImputacion?.billeteras) return [];
    if (!cuentaId) return [];
    return datosImputacion.billeteras.filter(bill => {
      const matchesAccount = !bill.propertyIds || bill.propertyIds.length === 0 || bill.propertyIds.includes(cuentaId);
      const matchesCurrency = !bill.currency || !currency || bill.currency.toUpperCase() === currency.toUpperCase();
      return matchesAccount && matchesCurrency;
    });
  }, [datosImputacion, cuentaId, currency]);

  const handleCuentaChange = (newCuentaId: string) => {
    setCuentaId(newCuentaId);
    // Si la categoría actual ya no pertenece a la nueva cuenta, resetearla
    if (categoriaId) {
      const currentCat = datosImputacion?.categorias.find(c => c.id === categoriaId);
      if (currentCat && currentCat.propertyIds && currentCat.propertyIds.length > 0 && !currentCat.propertyIds.includes(newCuentaId)) {
        setCategoriaId('');
      }
    }
    // Si la billetera actual ya no pertenece a la nueva cuenta o moneda, resetearla
    if (billeteraId) {
      const currentBill = datosImputacion?.billeteras.find(b => b.id === billeteraId);
      if (currentBill && currentBill.propertyIds && currentBill.propertyIds.length > 0 && !currentBill.propertyIds.includes(newCuentaId)) {
        setBilleteraId('');
      }
    }
  };
  
  const executeFormAction = useCallback(() => {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    formData.append('appFlavor', isPersonalFlavor ? 'personal' : 'commercial');
    formData.append('orgId', orgId || 'global');
    // Inject finance select values manually (Shadcn Select does not serialize into native FormData)
    if (categoriaId) formData.append('categoria_id', categoriaId);
    if (cuentaId) formData.append('cuenta_id', cuentaId);
    if (billeteraId) formData.append('billetera_id', billeteraId);
    startTransition(async () => {
      const result = await addPayment(initialState, formData);
      setState(result);
    });
  }, [isPersonalFlavor, orgId, categoriaId, cuentaId, billeteraId]);

  const fetchRate = async () => {
    setIsFetchingRate(true);
    try {
      const response = await fetch('/api/dollar-rate');
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      setExchangeRate(data.venta.toString());
    } catch (error) {
      console.error('Failed to fetch dollar rate:', error);
      toast({
        title: t('common.error'),
        description: 'No se pudo obtener el valor del dólar.',
        variant: 'destructive',
      });
    } finally {
      setIsFetchingRate(false);
    }
  };

  useEffect(() => {
    if (state.message) {
      toast({
        title: state.success ? t('common.success') : t('common.error'),
        description: state.message,
        variant: state.success ? 'default' : 'destructive',
      });
      if (state.success) {
        onOpenChange(false);
        onPaymentAdded();
      }
    }
  }, [state, toast, onOpenChange, onPaymentAdded, t]);


  const resetForm = useCallback(() => {
    formRef.current?.reset();
    setDate(new Date());
    setCurrency(booking?.currency || 'USD');
    setAmount('');
    setExchangeRate('');
    setState(initialState);
    setIsFetchingRate(false);
    setFinanceApiError(null);
    setShowWarning(false);
    setCategoriaId('');
    setCuentaId('');
    setBilleteraId('');
  }, [booking]);
  
  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen, resetForm]);
  
  useEffect(() => {
    const fetchFinanceData = async () => {
      if (!isPersonalFlavor) return;
      setIsFetchingFinanceData(true);
      setFinanceApiError(null);
      try {
        const response = await fetch('/api/finance-proxy');
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Respuesta no válida del proxy de finanzas.');
        }
        
        setDatosImputacion(data);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido.';
        console.error('Error fetching finance data:', errorMessage);
        setFinanceApiError(`No se pudo conectar a la API de finanzas. Causa: ${errorMessage}`);
      } finally {
        setIsFetchingFinanceData(false);
      }
    };
    
    const fetchBookingAndRate = async () => {
        if (!bookingId) return;
        try {
            const [fetchedBooking, rateResponse] = await Promise.all([
                getBookingWithDetails(bookingId),
                fetch('/api/dollar-rate?type=oficial')
            ]);
            if (fetchedBooking) {
                setBooking(fetchedBooking);
                setCurrency(fetchedBooking.currency || 'USD');
                if (fetchedBooking.balance > 0) {
                    setAmount(fetchedBooking.balance.toFixed(2));
                }
            }
            if (rateResponse.ok) {
                const data = await rateResponse.json();
                setDollarRateForBalance(data.venta);
            }
        } catch (e) {
            console.error("Failed to fetch booking details or rate", e);
        }
    };

    if (isOpen && appUser) {
      if (isPersonalFlavor) {
        fetchFinanceData();
      } else {
        const currentOrgId = orgId || 'global';
        getDoc(doc(db, 'settings', `currencies_${currentOrgId}`)).then(snap => {
            if (snap.exists()) {
                const settings = snap.data() as CurrencySettings;
                setCurrencySettings(settings);
            }
        });
      }
      
      if (!booking || booking.id !== bookingId) {
          fetchBookingAndRate();
      } else {
          fetch('/api/dollar-rate?type=oficial').then(res => res.json()).then(data => setDollarRateForBalance(data.venta)).catch(() => {});
          setCurrency(booking.currency || 'USD');
          if (booking.balance > 0) {
              setAmount(booking.balance.toFixed(2));
          }
      }
    }
  }, [isOpen, bookingId, appUser, isPersonalFlavor, booking, orgId]);
  
  useEffect(() => {
    if (isOpen && preloadData) {
        setAmount(preloadData.amount.toFixed(2));
        setCurrency(preloadData.currency);
        if (preloadData.exchangeRate) {
            setExchangeRate(preloadData.exchangeRate.toString());
        }
    }
  }, [isOpen, preloadData]);


  const balanceInBookingCurrency = booking?.balance || 0;
  const bookingCurrency = booking?.currency?.toUpperCase() || 'USD';

  const isConversionNeeded = useMemo(() => {
    if (!booking) return false;
    const bCur = (booking.currency || 'USD').toUpperCase();
    const cCur = (currency || 'USD').toUpperCase();
    return cCur !== bCur;
  }, [currency, booking]);

  useEffect(() => {
    if (isConversionNeeded && !exchangeRate && !isFetchingRate && isPersonalFlavor && isOpen) {
      fetchRate();
    }
  }, [isConversionNeeded, exchangeRate, isFetchingRate, isPersonalFlavor, isOpen]);

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPersonalFlavor || !datosImputacion) {
        executeFormAction();
        return;
    }

    if (!categoriaId || !cuentaId || !billeteraId) {
        setShowWarning(true);
    } else {
        executeFormAction();
    }
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-md p-0 overflow-hidden rounded-3xl flex flex-col max-h-[90vh]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="p-6 bg-background border-b shrink-0">
          <DialogTitle>{t('bookings.payments_dialog.add_payment')}</DialogTitle>
           {booking ? (
                <>
                    <DialogDescription>
                        {t('bookings.payments_dialog.description')
                            .replace('{{tenant}}', booking.tenant?.name || 'N/A')
                            .replace('{{property}}', booking.property?.name || 'N/A')}
                    </DialogDescription>
                    <div className="border rounded-xl p-3 text-center mt-3 bg-background shadow-sm">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">{t('bookings.table.balance')} Pactado</Label>
                        <div className={cn("text-xl font-black", balanceInBookingCurrency > 0.01 ? 'text-orange-600' : 'text-green-600')}>
                             {formatCurrency(balanceInBookingCurrency, bookingCurrency)}
                        </div>
                    </div>
                </>
            ) : (
                 <DialogDescription>
                    {t('expenses.add_dialog.description')}
                 </DialogDescription>
            )}
        </DialogHeader>
        <form onSubmit={handlePreSubmit} ref={formRef} className="flex-1 flex flex-col overflow-hidden bg-muted/30">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="date" value={date?.toISOString() || ''} />

          <div className="flex-1 overflow-y-auto p-6 space-y-4 shadow-inner border-b">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="date-popover" className="text-right text-muted-foreground font-bold uppercase text-[10px] tracking-widest">
                {t('expenses.add_dialog.date')}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date-popover"
                    variant={'outline'}
                    className={cn(
                      'col-span-3 justify-start text-left font-normal h-11 bg-background shadow-sm',
                      !date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? (
                      format(date, 'PPP', { locale: es })
                    ) : (
                      <span>{t('expenses.add_dialog.date_placeholder')}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus locale={es} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="currency" className="text-right text-muted-foreground font-bold uppercase text-[10px] tracking-widest">
                {t('expenses.add_dialog.currency')}
              </Label>
              <Select
                name="currency"
                value={currency}
                onValueChange={(val) => {
                    if (!isPersonalFlavor && booking && val !== bookingCurrency) {
                        toast({ variant: 'destructive', title: 'Restricción Comercial', description: `En la versión comercial, el cobro debe ser en la moneda pactada (${bookingCurrency}).` });
                        return;
                    }
                    setCurrency(val);
                }}
                required
              >
                <SelectTrigger className="col-span-3 bg-background h-11 shadow-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {isPersonalFlavor ? (
                        <>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="ARS">ARS</SelectItem>
                        </>
                    ) : (
                        (currencySettings?.favoriteCurrencies?.length ?? 0) > 0 ? (
                            currencySettings!.favoriteCurrencies.map(code => {
                                const currencyInfo = currencies.find(c => c.code === code);
                                return (<SelectItem key={code} value={code}>{currencyInfo ? currencyInfo.name : code}</SelectItem>)
                            })
                        ) : (
                        <>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="ARS">ARS</SelectItem>
                        </>
                        )
                    )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="amount" className="text-right text-muted-foreground font-bold uppercase text-[10px] tracking-widest">
                {t('expenses.add_dialog.amount')}
              </Label>
              <Input id="amount" name="amount" type="number" step="0.01" className="col-span-3 h-11 bg-background shadow-sm font-bold" value={amount} onChange={e => setAmount(e.target.value)} required />
            </div>

            {isPersonalFlavor && isConversionNeeded && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="exchangeRate" className="text-right text-muted-foreground font-bold uppercase text-[10px] tracking-widest">
                  {t('expenses.add_dialog.exchange_rate')}
                </Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Input
                    id="exchangeRate"
                    name="exchangeRate"
                    type="number"
                    step="0.01"
                    placeholder={t('expenses.add_dialog.exchange_rate_placeholder')}
                    required
                    value={exchangeRate}
                    onChange={e => setExchangeRate(e.target.value)}
                    className="h-11 bg-background shadow-sm"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={fetchRate} disabled={isFetchingRate} className="h-11 w-11 shrink-0 shadow-sm">
                    {isFetchingRate ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="description" className="text-right pt-2 text-muted-foreground font-bold uppercase text-[10px] tracking-widest">
                {t('expenses.add_dialog.description')}
              </Label>
              <Textarea
                id="description"
                name="description"
                className="col-span-3 bg-background shadow-inner min-h-[80px]"
                placeholder="..."
              />
            </div>

            {isPersonalFlavor && (
              <div className="border-t pt-4 mt-2 space-y-4">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-primary text-center">
                  Vínculo con Finanzas (Opcional)
                </h4>
                {isFetchingFinanceData && (
                  <div className="text-center text-xs text-muted-foreground italic">
                    <Loader2 className="mr-2 h-3 w-3 animate-spin inline-block" />
                    Buscando datos de imputación...
                  </div>
                )}
                {financeApiError && !isFetchingFinanceData && (
                  <Alert variant="destructive" className="bg-background">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle className="text-xs uppercase font-bold">Sin sincronización</AlertTitle>
                      <AlertDescription className="text-[10px]">{financeApiError}</AlertDescription>
                  </Alert>
                )}
                {datosImputacion && (
                  <div className="grid gap-3 p-3 bg-background/50 rounded-xl border border-dashed">
                    {/* 1. Cuenta de Imputación */}
                    <div className="grid gap-1">
                      <Label htmlFor="cuenta_id" className="text-[9px] uppercase font-black text-muted-foreground">
                        1. Cuenta de Imputación
                      </Label>
                      <Select
                        value={cuentaId}
                        onValueChange={handleCuentaChange}
                      >
                        <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="Seleccionar cuenta..." /></SelectTrigger>
                        <SelectContent>
                          {datosImputacion.cuentas.map(cta => (<SelectItem key={cta.id} value={cta.id}>{cta.nombre}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 2. Categoría (filtrada por cuenta seleccionada) */}
                    <div className="grid gap-1">
                      <Label htmlFor="categoria_id" className="text-[9px] uppercase font-black text-muted-foreground">
                        2. Categoría
                      </Label>
                      <Select
                        value={categoriaId}
                        onValueChange={setCategoriaId}
                        disabled={!cuentaId}
                      >
                        <SelectTrigger className="h-9 bg-background">
                          <SelectValue placeholder={!cuentaId ? "Primero selecciona una cuenta..." : "Seleccionar categoría..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredCategorias.length === 0 ? (
                            <SelectItem value="__none__" disabled>No hay categorías disponibles para esta cuenta</SelectItem>
                          ) : (
                            filteredCategorias.map(cat => (<SelectItem key={cat.id} value={cat.id}>{cat.nombre}</SelectItem>))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 3. Billetera de Ingreso (filtrada por cuenta y moneda) */}
                    <div className="grid gap-1">
                      <Label htmlFor="billetera_id" className="text-[9px] uppercase font-black text-muted-foreground">
                        3. Billetera de Ingreso
                      </Label>
                      <Select
                        value={billeteraId}
                        onValueChange={setBilleteraId}
                        disabled={!cuentaId}
                      >
                        <SelectTrigger className="h-9 bg-background">
                          <SelectValue placeholder={!cuentaId ? "Primero selecciona una cuenta..." : "Seleccionar billetera..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredBilleteras.length === 0 ? (
                            <SelectItem value="__none__" disabled>No hay billeteras en {currency} para esta cuenta</SelectItem>
                          ) : (
                            filteredBilleteras.map(bill => (<SelectItem key={bill.id} value={bill.id}>{bill.nombre}</SelectItem>))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="p-6 bg-background border-t shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="font-bold uppercase text-[10px] tracking-widest h-11">
              {t('common.cancel')}
            </Button>
            <SubmitButton isPending={isPending} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Cobro no vinculado</AlertDialogTitle>
                <AlertDialogDescription>
                    No has seleccionado los datos de imputación para la App de Finanzas. El cobro se guardará en este sistema pero <strong>no se registrará automáticamente en tu contabilidad externa</strong>.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Volver y vincular</AlertDialogCancel>
                <AlertDialogAction onClick={() => { setShowWarning(false); executeFormAction(); }}>
                    Guardar de todas formas
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}