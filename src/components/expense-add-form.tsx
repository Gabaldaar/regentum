'use client';

import { useEffect, useRef, useState, useTransition, useCallback, useMemo } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addExpense } from '@/lib/actions';
import { Calendar as CalendarIcon, Loader2, RefreshCw, PlusCircle, Building2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar } from './ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup } from '@/components/ui/select';
import { Textarea } from './ui/textarea';
import { ExpenseCategory, Provider, TaskAssignment, CurrencySettings, Property, TaskScope } from '@/lib/data';
import { useAuth } from './auth-provider';
import { currencies } from '@/lib/currencies';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useTranslation } from '@/i18n/useTranslation';

const initialState = {
  message: '',
  success: false,
};

export interface ExpensePreloadData {
  amount: number;
  description: string;
  currency?: string;
  taskId?: string;
  providerId?: string | null;
  propertyName?: string;
  providerName?: string;
  amountPaidSoFar?: number;
}


function SubmitButton() {
    const { t } = useTranslation();
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.loading')}
                </>
            ) : (
                t('expenses.add_dialog.submit')
            )}
        </Button>
    )
}

const formatCurrency = (amount: number, currency: string = 'ARS') => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency, minimumFractionDigits: 0 }).format(amount);
}

export function ExpenseAddForm({
    assignment,
    categories,
    providers,
    properties,
    scopes,
    children,
    isOpen: propIsOpen,
    onOpenChange: propOnOpenChange,
    onExpenseAdded,
    preloadData,
    currencySettings: initialCurrencySettings,
    lockAssignment = false
}: {
    assignment?: TaskAssignment | null,
    categories: ExpenseCategory[],
    providers?: Provider[],
    properties?: Property[],
    scopes?: TaskScope[],
    children?: React.ReactNode,
    isOpen?: boolean,
    onOpenChange?: (open: boolean) => void;
    onExpenseAdded: () => void;
    preloadData?: ExpensePreloadData;
    currencySettings: CurrencySettings | null;
    lockAssignment?: boolean;
}) {
  const { appUser, orgId } = useAuth();
  const { t } = useTranslation();
  const isPersonalFlavor = appUser?.appFlavor !== 'commercial';

  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [currency, setCurrency] = useState<string>('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('none');
  const [currencySettings, setCurrencySettings] = useState<CurrencySettings | null>(initialCurrencySettings);
  const [selectedAssignment, setSelectedAssignment] = useState<string>(assignment?.id ? `${assignment.type}-${assignment.id}` : '');

  const isOpen = propIsOpen !== undefined ? propIsOpen : internalIsOpen;
  const setIsOpen = propOnOpenChange !== undefined ? propOnOpenChange : setInternalIsOpen;

  const formAction = (formData: FormData) => {
    startTransition(async () => {
        const result = await addExpense(initialState, formData);
        setState(result);
    });
  };

  const fetchRate = async () => {
    setIsFetchingRate(true);
    try {
        const response = await fetch('/api/dollar-rate');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        setExchangeRate(data.venta.toString());
    } catch (error) {
        console.error("Failed to fetch dollar rate:", error);
    } finally {
        setIsFetchingRate(false);
    }
  };
  
  const resetForm = useCallback(() => {
    formRef.current?.reset();
    setDate(new Date());
    setExchangeRate('');
    setAmount('');
    setDescription('');
    setSelectedProviderId('none');
    setSelectedAssignment(assignment?.id ? `${assignment.type}-${assignment.id}` : '');
    setState(initialState);
    setIsFetchingRate(false);
  }, [assignment?.id, assignment?.type]);

  useEffect(() => {
    if (state.success) {
      onExpenseAdded();
      resetForm();
      setIsOpen(false);
    }
  }, [state.success, onExpenseAdded, resetForm, setIsOpen]);
  
  useEffect(() => {
    if (assignment?.id) {
        setSelectedAssignment(`${assignment.type}-${assignment.id}`);
    }
  }, [assignment?.type, assignment?.id]);

  useEffect(() => {
    if (isOpen) {
        if (appUser) {
            const isCommercial = appUser.appFlavor === 'commercial';
            if (isCommercial) {
                const currentOrgId = orgId || 'global';
                getDoc(doc(db, 'settings', `currencies_${currentOrgId}`)).then(snap => {
                    if (snap.exists()) {
                        const settings = snap.data() as CurrencySettings;
                        setCurrencySettings(settings);
                        setCurrency(preloadData?.currency || settings.baseCurrency || 'ARS');
                    } else {
                        setCurrency(preloadData?.currency || 'ARS');
                    }
                });
            } else {
                setCurrency(preloadData?.currency || 'ARS');
            }

            if (preloadData) {
                setAmount(preloadData.amount !== undefined && preloadData.amount !== null ? preloadData.amount.toString() : '');
                setDescription(preloadData.description || '');
                if (preloadData.providerId) {
                    setSelectedProviderId(preloadData.providerId);
                } else {
                    setSelectedProviderId('none');
                }
            }
        }
    }
  }, [isOpen, preloadData, appUser, orgId]);

  useEffect(() => {
    if (currency === 'USD' && isPersonalFlavor && !exchangeRate && !isFetchingRate && isOpen) {
      fetchRate();
    }
  }, [currency, exchangeRate, isFetchingRate, isPersonalFlavor, isOpen]);

  const selectedAssignmentName = useMemo(() => {
      if (selectedAssignment.startsWith('property-')) {
          const id = selectedAssignment.replace('property-', '');
          return properties?.find(p => p.id === id)?.name || 'Propiedad';
      }
      if (selectedAssignment.startsWith('scope-')) {
          const id = selectedAssignment.replace('scope-', '');
          return scopes?.find(s => s.id === id)?.name || 'Ámbito';
      }
      return 'Sin Asignación';
  }, [selectedAssignment, properties, scopes]);


  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent 
        className="sm:max-w-[425px] p-0 overflow-hidden rounded-3xl flex flex-col max-h-[90vh]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="p-6 bg-background border-b shrink-0">
          <DialogTitle>{t('expenses.add_dialog.title')}</DialogTitle>
           <DialogDescription>
                {t('expenses.add_dialog.description')}
            </DialogDescription>
            {(isPersonalFlavor && (preloadData?.providerName || (preloadData?.amountPaidSoFar && preloadData.amountPaidSoFar > 0))) && (
                <div className="text-sm text-muted-foreground border-t pt-2 mt-2 space-y-1">
                    {preloadData?.providerName && <p>{t('expenses.add_dialog.provider')}: <span className="font-medium text-foreground">{preloadData.providerName}</span></p>}
                    {(preloadData?.amountPaidSoFar && preloadData.amountPaidSoFar > 0) && <p>Pagado hasta ahora: <span className="font-medium text-foreground">{formatCurrency(preloadData.amountPaidSoFar, preloadData.currency)}</span></p>}
                </div>
            )}
        </DialogHeader>
        <form action={formAction} ref={formRef} className="flex-1 flex flex-col overflow-hidden bg-muted/30">
            <input type="hidden" name="date" value={date?.toISOString() || ''} />
            <input type="hidden" name="orgId" value={orgId || ''} />
            {preloadData?.taskId && <input type="hidden" name="taskId" value={preloadData.taskId} />}
            <input type="hidden" name="providerId" value={isPersonalFlavor ? selectedProviderId : 'none'} />
            
            {lockAssignment && <input type="hidden" name="assignment" value={selectedAssignment} />}

            <div className="flex-1 overflow-y-auto p-6 space-y-4 shadow-inner">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="assignment" className="text-right text-muted-foreground font-bold uppercase text-[10px] tracking-widest">{t('expenses.add_dialog.impute_to')}</Label>
                    <div className="col-span-3">
                        {lockAssignment ? (
                            <div className="p-2 border-2 border-primary/20 rounded-md bg-background font-black text-primary shadow-sm flex items-center gap-2">
                                <Building2 className="h-4 w-4 opacity-70" />
                                {selectedAssignmentName}
                            </div>
                        ) : (
                            <Select 
                                name="assignment" 
                                value={selectedAssignment} 
                                onValueChange={setSelectedAssignment} 
                                required 
                            >
                                <SelectTrigger className="bg-background h-11 shadow-sm">
                                    <SelectValue placeholder={t('expenses.add_dialog.impute_placeholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {properties && properties.length > 0 && (
                                        <SelectGroup>
                                            <Label>{t('navigation.properties')}</Label>
                                            {properties.map(p => <SelectItem key={p.id} value={`property-${p.id}`}>{p.name}</SelectItem>)}
                                        </SelectGroup>
                                    )}
                                    {isPersonalFlavor && scopes && scopes.length > 0 && (
                                        <SelectGroup>
                                            <Label>{t('tasks.assignment_types.scope')}</Label>
                                            {scopes.map(s => <SelectItem key={s.id} value={`scope-${s.id}`}>{s.name}</SelectItem>)}
                                        </SelectGroup>
                                    )}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="date" className="text-right text-muted-foreground font-bold uppercase text-[10px] tracking-widest">{t('expenses.add_dialog.date')}</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button variant={"outline"} className={cn("col-span-3 justify-start text-left font-normal h-11 bg-background shadow-sm", !date && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? format(date, "PPP", { locale: es }) : <span>{t('expenses.add_dialog.date_placeholder')}</span>}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus locale={es} /></PopoverContent>
                    </Popover>
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="categoryId" className="text-right text-muted-foreground font-bold uppercase text-[10px] tracking-widest">{t('expenses.add_dialog.category')}</Label>
                    <Select name="categoryId">
                        <SelectTrigger className="col-span-3 bg-background h-11 shadow-sm"><SelectValue placeholder={t('expenses.add_dialog.category_placeholder')} /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">{t('common.none')}</SelectItem>
                            {categories.map(category => (<SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>))}
                        </SelectContent>
                    </Select>
                </div>
                {isPersonalFlavor && providers && (
                     <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="providerId-select" className="text-right text-muted-foreground font-bold uppercase text-[10px] tracking-widest">{t('expenses.add_dialog.provider')}</Label>
                        <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                            <SelectTrigger id="providerId-select" className="col-span-3 bg-background h-11 shadow-sm"><SelectValue placeholder={t('expenses.add_dialog.provider_placeholder')} /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">{t('common.none')}</SelectItem>
                                {providers.map(provider => (<SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="currency" className="text-right text-muted-foreground font-bold uppercase text-[10px] tracking-widest">{t('expenses.add_dialog.currency')}</Label>
                    <Select name="currency" value={currency} onValueChange={(value) => setCurrency(value)} required>
                        <SelectTrigger className="col-span-3 bg-background h-11 shadow-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {isPersonalFlavor ? (
                                <><SelectItem value="ARS">ARS</SelectItem><SelectItem value="USD">USD</SelectItem></>
                            ) : (
                                (currencySettings?.favoriteCurrencies?.length ?? 0) > 0 ? (
                                    currencySettings!.favoriteCurrencies.map(code => {
                                        const currencyInfo = currencies.find(c => c.code === code);
                                        return (<SelectItem key={code} value={code}>{currencyInfo ? currencyInfo.name : code}</SelectItem>)
                                    })
                                ) : (
                                    <><SelectItem value="ARS">ARS</SelectItem><SelectItem value="USD">USD</SelectItem></>
                                )
                            )}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="amount" className="text-right text-muted-foreground font-bold uppercase text-[10px] tracking-widest">{t('expenses.add_dialog.amount')}</Label>
                    <Input id="amount" name="amount" type="number" step="0.01" className="col-span-3 h-11 bg-background shadow-sm font-bold" required value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
                 {currency === 'USD' && isPersonalFlavor && (
                     <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="exchangeRate" className="text-right text-muted-foreground font-bold uppercase text-[10px] tracking-widest">{t('expenses.add_dialog.exchange_rate')}</Label>
                        <div className="col-span-3 flex items-center gap-2">
                           <Input id="exchangeRate" name="exchangeRate" type="number" step="0.01" placeholder={t('expenses.add_dialog.exchange_rate_placeholder')} required value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} className="h-11 bg-background shadow-sm" />
                            <Button type="button" variant="outline" size="icon" onClick={fetchRate} disabled={isFetchingRate} className="h-11 w-11 shrink-0 shadow-sm">
                                {isFetchingRate ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-4 items-start gap-4">
                    <Label htmlFor="description" className="text-right pt-2 text-muted-foreground font-bold uppercase text-[10px] tracking-widest">{t('expenses.add_dialog.description')}</Label>
                    <Textarea id="description" name="description" className="col-span-3 bg-background shadow-inner min-h-[100px]" value={description} onChange={e => setDescription(e.target.value)} />
                </div>
            </div>
            
            <DialogFooter className="p-6 bg-background border-t shrink-0 flex flex-row items-center justify-end gap-2">
                <DialogClose asChild><Button type="button" variant="outline" onClick={() => setIsOpen(false)}>{t('common.cancel')}</Button></DialogClose>
                <SubmitButton />
            </DialogFooter>
        </form>
         {state.message && !state.success && <p className="text-red-500 text-sm mt-2 px-6 pb-6">{state.message}</p>}
      </DialogContent>
    </Dialog>
  );
}
