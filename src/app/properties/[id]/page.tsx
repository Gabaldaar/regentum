
'use client';

import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { 
    Property, Tenant, BookingWithDetails, ExpenseWithDetails, ExpenseCategory, 
    Origin, TaskWithDetails, TaskCategory, Provider, TaskScope, DateBlock, 
    PaymentWithDetails, CurrencySettings, Booking, TaskAssignment, Contrato, PeriodoPago, TaskStatus, OwnerLiquidation, Expense,
    getProperties, getTenants, getBookings, getOrigins, getExpenseCategories, getTasks, getContratos, getPeriodosPago, getExpenses, getPayments, getOwnerLiquidationsByPropertyId, getTaskCategories, getTaskScopes, getCurrencySettings, BrandingSettings,
    getDateBlocks, getProviders
} from "@/lib/data";
import { calculateFinancialSummaryByProperty, calculateMonthlyNetIncomeTrends } from "@/lib/reports";
import { BookingAddForm } from '@/components/booking-add-form';
import BookingsList from '@/components/bookings-list';
import ExpensesList from '@/components/expenses-list';
import TasksList from '@/components/tasks-list';
import { ExpenseAddForm, ExpensePreloadData } from '@/components/expense-add-form';
import { PropertyNotesForm } from '@/components/property-notes-form';
import { PropertyEditForm } from '@/components/property-edit-form';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Loader2, Copy, Calendar as CalendarIcon, Search, X, Pencil, MapPin, PlusCircle, Home, ScrollText, ListFilter, ChevronDown, ChevronUp, TrendingUp, Wrench, Banknote, Upload, AlertTriangle, ChevronLeft } from 'lucide-react';
import { Calendar } from "@/components/ui/calendar";
import { es, enUS, ptBR } from 'date-fns/locale';
import { cn, parseDateSafely, parseAssignment } from '@/lib/utils';
import { TaskAddForm } from '@/components/task-add-form';
import { DateBlockAddForm } from '@/components/date-block-add-form';
import DateBlocksList from '@/components/date-blocks-list';
import PaymentsList from '@/components/payments-list';
import FinancialSummaryChart from '@/components/financial-summary-chart';
import FinancialSummaryTable from '@/components/financial-summary-table';
import MonthlyNetIncomeChart from '@/components/monthly-net-income-chart';
import { ContratoAddForm } from '@/components/contrato-add-form';
import { collection, getDocs, doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
} from "@/components/ui/select";
import { useToast } from '@/components/ui/use-toast';
import { startOfToday } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription
} from "@/components/ui/dialog";
import { OwnerLiquidationClient } from '@/components/owner-liquidation-client';
import { useTranslation } from "@/i18n/useTranslation";
import useWindowSize from '@/hooks/use-window-size';
import { TooltipProvider } from '@/components/ui/tooltip';
import ContratosList from '@/components/contratos-list';

const locales: Record<string, any> = { es, en: enUS, pt: ptBR };

const FilterBar = ({ search, onSearchChange, from, onFromChange, to, onToChange, onClear, extra, count, total }: any) => {
    const { t } = useTranslation();
    const { width } = useWindowSize();
    const isMobile = typeof width === 'number' ? width < 768 : false;
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        if (width !== undefined) {
            setIsExpanded(!isMobile);
        }
    }, [isMobile, width]);

    return (
        <div className="flex flex-col gap-4 p-3 sm:p-4 border rounded-lg bg-muted/70 mb-6 shadow-sm w-full transition-all">
            <div className="flex items-center justify-between mb-1">
                <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary hover:opacity-80 transition-opacity"
                >
                    <ListFilter className="h-4 w-4" /> 
                    {t('common.filters')}
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {total !== undefined && (
                    <span className="text-[10px] font-bold bg-background/50 px-2 py-0.5 rounded-full text-primary border border-primary/20">
                        {count} / {total}
                    </span>
                )}
            </div>
            
            {isExpanded && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="grid gap-1.5 w-full">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">{t('common.search')}</Label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder={t('common.search') + "..."} 
                                value={search} 
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="pl-9 h-9 bg-background w-full"
                            />
                        </div>
                    </div>
                    <div className="grid gap-1.5 w-full">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">{t('common.from')}</Label>
                        <div className="w-full">
                            <DatePicker date={from} onDateSelect={onFromChange} placeholder={t('common.from')} />
                        </div>
                    </div>
                    <div className="grid gap-1.5 w-full">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">{t('common.to')}</Label>
                        <div className="w-full">
                            <DatePicker date={to} onDateSelect={onToChange} placeholder={t('common.to')} />
                        </div>
                    </div>
                    {extra}
                    <div className="flex justify-start sm:justify-end">
                        <Button variant="ghost" size="sm" onClick={onClear} className="h-9 px-2 text-muted-foreground hover:bg-background/50">
                            <X className="h-4 w-4 mr-1" /> {t('common.clean')}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

interface PropertyDetailData {
    property: Property;
    properties: Property[];
    tenants: Tenant[];
    bookings: BookingWithDetails[];
    contratos: any[];
    rawContratos: Contrato[];
    periodos: PeriodoPago[];
    blocks: DateBlock[];
    expenses: ExpenseWithDetails[];
    allExpenses: ExpenseWithDetails[];
    payments: PaymentWithDetails[];
    expenseCategories: ExpenseCategory[];
    tasks: TaskWithDetails[];
    taskCategories: TaskCategory[];
    providers: Provider[];
    origins: Origin[];
    taskScopes: TaskScope[];
    currencySettings: CurrencySettings | null;
    ownerLiquidations: OwnerLiquidation[];
}

export default function PropertyDetailPage() {
  const router = useRouter();
  const { user, appUser, orgId } = useAuth();
  const { t, language } = useTranslation();
  const currentLocale = locales[language] || es;
  const today = useMemo(() => startOfToday(), []);

  const params = useParams();
  const propertyId = params.id as string;
  const [data, setData] = useState<PropertyDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowSize();
  const isMobile = typeof width === 'number' ? width < 768 : false;
  const [key, setKey] = useState(0); 
  const { toast } = useToast();

  const [isTaskAddOpen, setIsTaskAddOpen] = useState(false);
  const [isExpenseAddOpen, setIsExpenseAddOpen] = useState(false);
  const [isEditPropertyOpen, setIsEditPropertyOpen] = useState(false);
  const [expensePreloadData, setExpensePreloadData] = useState<ExpensePreloadData | undefined>(undefined);
  const [expenseAssignment, setExpenseAssignment] = useState<TaskAssignment | null>(null);
  const [isBlockFormOpen, setIsBlockFormOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  
  const [isHeroUploading, setIsHeroUploading] = useState(false);
  const [branding, setBranding] = useState<BrandingSettings | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
        setBaseUrl(window.location.origin);
    }
  }, []);

  // Suscripción al branding independiente para evitar bloqueos
  useEffect(() => {
      if (!orgId) return;
      const unsub = onSnapshot(doc(db, 'settings', `branding_${orgId}`), (snap) => {
          if (snap.exists()) setBranding(snap.data() as BrandingSettings);
      });
      return () => unsub();
  }, [orgId]);

  const fetchDataOnServer = useCallback(async () => {
    if (!user || !propertyId || !orgId) return;
    
    setLoading(true);
    setError(null);
    try {
        const propertySnap = await getDoc(doc(db, 'properties', propertyId));
        if (!propertySnap.exists()) {
            setError("Propiedad no encontrada.");
            setLoading(false);
            return;
        }

        const propertyData = { id: propertySnap.id, ...propertySnap.data() } as Property;
        const propertyOrgId = propertyData.orgId || 'global';
        
        // Verificación de seguridad estricta: AISLAMIENTO TOTAL
        if (propertyOrgId !== orgId) {
            setError("No tienes permisos para ver esta propiedad.");
            setLoading(false);
            return;
        }

        const [
            propertiesList, 
            tenantsList, 
            allBookingsRaw, 
            allContratosRaw, 
            allBlocksRaw, 
            allExpensesRaw, 
            expenseCategoriesList, 
            allTasksRaw, 
            taskCategoriesList, 
            providersList, 
            originsList, 
            allPaymentsRaw, 
            currencySettings, 
            taskScopesList,
            periodosRaw, 
            ownerLiqRaw
        ] = await Promise.all([
            getProperties(orgId),
            getTenants(orgId),
            getBookings(orgId),
            getContratos(orgId),
            getDateBlocks(orgId),
            getExpenses(orgId),
            getExpenseCategories(orgId),
            getTasks(orgId),
            getTaskCategories(orgId),
            getProviders(orgId),
            getOrigins(orgId),
            getPayments(orgId),
            getCurrencySettings(orgId),
            getTaskScopes(orgId),
            getPeriodosPago(orgId),
            getOwnerLiquidationsByPropertyId(propertyId, orgId)
        ]);

        const tenantsMap = new Map(tenantsList.map((t: any) => [t.id, t]));
        const propsMap = new Map(propertiesList.map((p: any) => [p.id, p]));
        const scopesMap = new Map(taskScopesList.map((s: any) => [s.id, s]));
        const expenseCatsMap = new Map(expenseCategoriesList.map((c: any) => [c.id, c.name]));
        const provsMap = new Map(providersList.map((p: any) => [p.id, p.name]));
        const taskCatsMap = new Map(taskCategoriesList.map((c: any) => [c.id, c.name]));
        
        const globalBookingsMap = new Map(allBookingsRaw.map((b: any) => [b.id, b]));
        const globalContratosMap = new Map(allContratosRaw.map((c: any) => [c.id, c]));

        const enrichedBookings: BookingWithDetails[] = allBookingsRaw
            .filter((b: any) => b.propertyId === propertyId)
            .map((b: any) => ({
                ...b,
                property: propertyData,
                tenant: tenantsMap.get(b.tenantId) || ({ id: b.tenantId, name: 'Desconocido' } as Tenant)
            }));

        const uniqueContratosMap = new Map<string, any>();
        allContratosRaw
            .filter((c: any) => c.propertyId === propertyId)
            .forEach((c: any) => {
                const fIn = String(c.fechaInicio).split('T')[0].trim();
                const fingerprint = `${c.propertyId}_${c.tenantId}_${fIn}`.toLowerCase();
                if (!uniqueContratosMap.has(fingerprint)) {
                    uniqueContratosMap.set(fingerprint, {
                        ...c,
                        tenantName: tenantsMap.get(c.tenantId)?.name || 'Inquilino Desconocido',
                        tenant: tenantsMap.get(c.tenantId)
                    });
                }
            });

        const enrichedContratos = Array.from(uniqueContratosMap.values());

        const allExpensesEnriched: ExpenseWithDetails[] = allExpensesRaw.map((e: any) => {
            const parsed = parseAssignment(e.assignment);
            const p = propsMap.get(parsed.id);
            const s = scopesMap.get(parsed.id) || (parsed.id === 'administracion' ? { name: 'Administración', color: '#8b5cf6' } : null);
            return {
                ...e,
                assignment: parsed,
                assignmentName: parsed.type === 'property' ? (p?.name || 'N/A') : (s?.name || 'N/A'),
                assignmentColor: parsed.type === 'scope' ? s?.color : undefined,
                categoryName: expenseCatsMap.get(e.categoryId),
                providerName: provsMap.get(e.providerId),
                amountUSD: e.originalUsdAmount || (e.currency === 'USD' ? e.amount : 0),
                amountARS: e.currency === 'ARS' ? e.amount : (e.exchangeRate ? e.amount * e.exchangeRate : e.amount)
            };
        }).sort((a: ExpenseWithDetails, b: ExpenseWithDetails) => (parseDateSafely(b.date)?.getTime() || 0) - (parseDateSafely(a.date)?.getTime() || 0));

        const propertyExpenses = allExpensesEnriched.filter((e: ExpenseWithDetails) => e.assignment?.id === propertyId);
        const blocks = allBlocksRaw.filter((b: any) => b.propertyId === propertyId) as DateBlock[];
        
        const paymentsList: PaymentWithDetails[] = allPaymentsRaw
            .map((p: any) => {
                const b = p.bookingId ? globalBookingsMap.get(p.bookingId) : undefined;
                const c = p.contratoId ? globalContratosMap.get(p.contratoId) : undefined;
                
                const tId = b?.tenantId || c?.tenantId || '';
                const tName = tenantsMap.get(tId)?.name || 'Desconocido';
                
                let sourceCurrency = p.currency || 'USD';
                if (b) sourceCurrency = b.currency;
                if (c) sourceCurrency = c.moneda;

                const realReceivedAmount = p.receivedAmount ?? p.originalArsAmount ?? p.amount ?? 0;
                const realReceivedCurrency = (p.receivedCurrency || (p.originalArsAmount ? 'ARS' : (p.currency || 'USD'))) as string;

                return {
                    ...p,
                    propertyId: b?.propertyId || c?.propertyId || p.propertyId || propertyId,
                    propertyName: propertyData.name,
                    tenantName: tName,
                    sourceCurrency,
                    realReceivedAmount,
                    realReceivedCurrency,
                    amountUSD: sourceCurrency === 'USD' ? (p.amount || 0) : 0,
                    amountARS: sourceCurrency === 'ARS' ? (p.amount || 0) : 0,
                };
            })
            .filter((p: PaymentWithDetails) => p.propertyId === propertyId)
            .sort((a: PaymentWithDetails, b: PaymentWithDetails) => (parseDateSafely(b.date)?.getTime() || 0) - (parseDateSafely(a.date)?.getTime() || 0));

        const tasks: TaskWithDetails[] = allTasksRaw
            .filter((t: any) => t.assignment?.id === propertyId)
            .map((t: any) => {
                const relatedExpenses = allExpensesEnriched.filter((e: ExpenseWithDetails) => e.taskId === t.id);
                const actualCost = relatedExpenses.reduce((sum: number, e: ExpenseWithDetails) => {
                    if (t.costCurrency === 'USD') {
                        return sum + (e.originalUsdAmount || 0);
                    } else {
                        return sum + (e.amount || 0);
                    }
                }, 0);
                return {
                    ...t,
                    actualCost,
                    assignmentName: propertyData.name,
                    categoryName: t.categoryId ? taskCatsMap.get(t.categoryId) : undefined,
                    providerName: t.providerId ? provsMap.get(t.providerId) : undefined
                };
            });

        setData({ 
            property: propertyData, 
            properties: propertiesList as Property[], 
            tenants: tenantsList as Tenant[], 
            bookings: enrichedBookings, 
            contratos: enrichedContratos, 
            rawContratos: allContratosRaw as Contrato[], 
            periodos: periodosRaw as PeriodoPago[], 
            blocks, 
            expenses: propertyExpenses, 
            allExpenses: allExpensesEnriched, 
            payments: paymentsList, 
            expenseCategories: expenseCategoriesList as ExpenseCategory[], 
            tasks, 
            taskCategories: taskCategoriesList as TaskCategory[], 
            providers: providersList as Provider[], 
            origins: originsList as Origin[], 
            taskScopes: taskScopesList as TaskScope[], 
            currencySettings: currencySettings as any, 
            ownerLiquidations: ownerLiqRaw as OwnerLiquidation[]
        });
    } catch (error) {
        console.error("Error fetching property details:", error);
        setError("Error de servidor al cargar los detalles.");
    } finally {
        setLoading(false);
    }
  }, [user, propertyId, orgId, t]);

  useEffect(() => {
    fetchDataOnServer();
  }, [fetchDataOnServer, key]);

  // Estados de filtrado internos
  const [contratosSearch, setContratosSearch] = useState('');
  const [contratosFrom, setContratosFrom] = useState<Date | undefined>();
  const [contratosTo, setContratosTo] = useState<Date | undefined>();

  const [temporariosSearch, setTemporariosSearch] = useState('');
  const [temporariosFrom, setTemporariosFrom] = useState<Date | undefined>();
  const [temporariosTo, setTemporariosTo] = useState<Date | undefined>();
  const [temporariosStatus, setTemporariosStatus] = useState('all');
  const [temporariosOrigin, setTemporariosOrigin] = useState('all');
  const [temporariosSortOrder, setTemporariosSortOrder] = useState<'upcoming' | 'distant'>('distant');

  const [tasksSearch, setTasksSearch] = useState('');
  const [tasksFrom, setTasksFrom] = useState<Date | undefined>();
  const [tasksTo, setTasksTo] = useState<Date | undefined>();
  const [tasksStatus, setTasksStatus] = useState<TaskStatus | 'all'>('all');

  const [expensesSearch, setExpensesSearch] = useState('');
  const [expensesFrom, setExpensesFrom] = useState<Date | undefined>();
  const [expensesTo, setExpensesTo] = useState<Date | undefined>();

  const [paymentsSearch, setPaymentsSearch] = useState('');
  const [paymentsFrom, setPaymentsFrom] = useState<Date | undefined>();
  const [paymentsTo, setPaymentsTo] = useState<Date | undefined>();

  const [reportFrom, setReportFrom] = useState<Date | undefined>();
  const [reportTo, setReportTo] = useState<Date | undefined>(new Date());

  const handleDataChanged = () => {
    setKey(prevKey => prevKey + 1);
  };

  const handleHeroUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !propertyId) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: t('common.error'), description: "La imagen no debe superar 2MB.", variant: "destructive" });
      return;
    }

    setIsHeroUploading(true);
    const storageRef = ref(storage, `property_images/${propertyId}/main_image.jpg`);

    try {
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'properties', propertyId), { imageUrl: url });
      toast({ title: t('common.success'), description: "Imagen de portada actualizada." });
      handleDataChanged();
    } catch (error) {
      console.error(error);
      toast({ title: t('common.error'), description: "No se pudo subir la imagen.", variant: "destructive" });
    } finally {
      setIsHeroUploading(false);
    }
  };

  const handleOpenExpenseFormWithData = useCallback((d: ExpensePreloadData, a: TaskAssignment) => {
    setExpensePreloadData(d);
    setExpenseAssignment(a);
    setIsExpenseAddOpen(true);
  }, []);

  const handleCopyICal = () => {
    const url = `${baseUrl}/api/ical/${propertyId}`;
    navigator.clipboard.writeText(url);
    toast({ title: t('common.success'), description: t('common.copy_link_success') });
  };

  const handlePropertyDeleted = () => {
      router.push('/properties');
  };

  const filteredContratos = useMemo(() => {
    if (!data?.contratos) return [];
    return data.contratos.filter((c: any) => {
        if (contratosSearch && !c.tenantName.toLowerCase().includes(contratosSearch.toLowerCase())) return false;
        const start = parseDateSafely(c.fechaInicio);
        if (contratosFrom && start && start < contratosFrom) return false;
        if (contratosTo && start && start > contratosTo) return false;
        return true;
    });
  }, [data?.contratos, contratosSearch, contratosFrom, contratosTo]);

  const filteredTemporarios = useMemo(() => {
    if (!data?.bookings) return [];
    const filtered = data.bookings.filter((b: BookingWithDetails) => {
        if (temporariosSearch) {
            const term = temporariosSearch.toLowerCase();
            const match = b.tenant?.name.toLowerCase().includes(term) || b.notes?.toLowerCase().includes(term);
            if (!match) return false;
        }

        if (temporariosOrigin !== 'all' && (b.originId || 'none') !== temporariosOrigin) return false;

        const start = parseDateSafely(b.startDate);
        const end = parseDateSafely(b.endDate);
        if (temporariosFrom && start && start < temporariosFrom) return false;
        if (temporariosTo && start && start > temporariosTo) return false;
        
        if (temporariosStatus !== 'all') {
            const isActiveStatus = !b.status || b.status === 'active';
            const isCurrent = start && end && today >= start && today <= end;
            const isUpcoming = start && start > today;
            const isPast = end && end < today;

            if (temporariosStatus === 'active') {
                if (!isCurrent || !isActiveStatus) return false;
            } else if (temporariosStatus === 'upcoming') {
                if (!isUpcoming || !isActiveStatus) return false;
            } else if (temporariosStatus === 'closed') {
                if (!isPast || !isActiveStatus) return false;
            } else if (temporariosStatus === 'pending') {
                if (b.status !== 'pending') return false;
            } else if (temporariosStatus === 'cancelled') {
                if (b.status !== 'cancelled') return false;
            } else if (temporariosStatus === 'with-debt') {
                if ((b.balance || 0) < 1 || b.status === 'cancelled') return false;
            }
        }
        return true;
    });

    return filtered.sort((a: BookingWithDetails, b: BookingWithDetails) => {
        const dateA = parseDateSafely(a.startDate)?.getTime() || 0;
        const dateB = parseDateSafely(b.startDate)?.getTime() || 0;
        return temporariosSortOrder === 'upcoming' ? dateA - dateB : dateB - dateA;
    });
  }, [data?.bookings, temporariosSearch, temporariosOrigin, temporariosFrom, temporariosTo, temporariosStatus, temporariosSortOrder, today]);

  const filteredTasks = useMemo(() => {
    if (!data?.tasks) return [];
    return data.tasks.filter((t: TaskWithDetails) => {
        if (tasksSearch && !t.description.toLowerCase().includes(tasksSearch.toLowerCase())) return false;
        const date = parseDateSafely(t.dueDate);
        if (tasksFrom && date && date < tasksFrom) return false;
        if (tasksTo && date && date > tasksTo) return false;
        if (tasksStatus !== 'all' && t.status !== tasksStatus) return false;
        return true;
    });
  }, [data?.tasks, tasksSearch, tasksFrom, tasksTo, tasksStatus]);

  const filteredExpenses = useMemo(() => {
    if (!data?.expenses) return [];
    return data.expenses.filter((e: ExpenseWithDetails) => {
        if (expensesSearch) {
            const term = expensesSearch.toLowerCase();
            const match = e.description?.toLowerCase().includes(term) || e.categoryName?.toLowerCase().includes(term);
            if (!match) return false;
        }
        const date = parseDateSafely(e.date);
        if (expensesFrom && date && date < expensesFrom) return false;
        if (expensesTo && date && date > expensesTo) return false;
        return true;
    });
  }, [data?.expenses, expensesSearch, expensesFrom, expensesTo]);

  const filteredPayments = useMemo(() => {
    if (!data?.payments) return [];
    return data.payments.filter((p: PaymentWithDetails) => {
        if (paymentsSearch) {
            const term = paymentsSearch.toLowerCase();
            const match = p.tenantName?.toLowerCase().includes(term) || p.description?.toLowerCase().includes(term);
            if (!match) return false;
        }
        const date = parseDateSafely(p.date);
        if (paymentsFrom && date && date < paymentsFrom) return false;
        if (paymentsTo && date && date > paymentsTo) return false;
        return true;
    });
  }, [data?.payments, paymentsSearch, paymentsFrom, paymentsTo]);

  const dayModifiers = useMemo(() => {
    const modifiers: Record<string, any> = {};
    if (!data) return modifiers;

    const activeBookings = data.bookings.filter((b: BookingWithDetails) => !b.status || b.status === 'active');
    const activeContratos = data.contratos.filter((c: any) => c.status === 'active');
    
    const bookedDays = activeBookings.map((booking: BookingWithDetails) => {
        const from = parseDateSafely(booking.startDate);
        const to = parseDateSafely(booking.endDate);
        if (!from || !to) return null;
        return { from, to };
    }).filter((d: any): d is { from: Date; to: Date } => d !== null);

    const contractDays = activeContratos.map((contrato: any) => {
        const from = parseDateSafely(contrato.fechaInicio);
        const to = parseDateSafely(contrato.fechaFin);
        if (!from || !to) return null;
        return { from, to };
    }).filter((d: any): d is { from: Date; to: Date } => d !== null);
    
    if (bookedDays.length > 0 || contractDays.length > 0) {
        modifiers.booked = [...bookedDays, ...contractDays];
    }
    
    const blockedDays = data.blocks.map((block: DateBlock) => {
        const from = parseDateSafely(block.startDate);
        const to = parseDateSafely(block.endDate);
        if (!from || !to) return null;
        return { from, to };
    }).filter((d: any): d is { from: Date; to: Date } => d !== null);
    
    if (blockedDays.length > 0) modifiers.blocked = blockedDays;

    modifiers.checkin = [
        ...activeBookings.map((b: BookingWithDetails) => parseDateSafely(b.startDate)).filter((d: Date | undefined): d is Date => !!d),
        ...activeContratos.map((c: any) => parseDateSafely(c.fechaInicio)).filter((d: Date | undefined): d is Date => !!d)
    ];
    modifiers.checkout = [
        ...activeBookings.map((b: BookingWithDetails) => parseDateSafely(b.endDate)).filter((d: Date | undefined): d is Date => !!d),
        ...activeContratos.map((c: any) => parseDateSafely(c.fechaFin)).filter((d: Date | undefined): d is Date => !!d)
    ];
    
    return modifiers;
  }, [data, today]);

  const dayModifiersClassNames = {
    checkin: 'day-checkin',
    checkout: 'day-checkout',
    blocked: 'bg-zinc-400 text-white rounded-md',
    booked: 'day-booked-middle',
    disabled: 'day-disabled',
  };

  const financialSummary = useMemo(() => {
    if (!user || !propertyId || !data) return null;
    return calculateFinancialSummaryByProperty(
        data.properties,
        data.bookings,
        data.allExpenses,
        data.payments,
        data.rawContratos,
        data.periodos,
        {
            startDate: reportFrom ? reportFrom.toISOString().split('T')[0] : undefined,
            endDate: reportTo ? reportTo.toISOString().split('T')[0] : undefined
        }
    );
  }, [user, propertyId, data, reportFrom, reportTo]);

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (error || !data || !data.property) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
              <div className="p-4 bg-destructive/10 rounded-full">
                <AlertTriangle className="h-12 w-12 text-destructive" />
              </div>
              <div>
                  <h2 className="text-2xl font-black text-primary uppercase italic">{t('common.error')}</h2>
                  <p className="text-muted-foreground">{error || "No se pudo cargar la información de la propiedad."}</p>
              </div>
              <Button onClick={() => router.push('/properties')}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  {t('navigation.properties')}
              </Button>
          </div>
      );
  }

  const { property } = data;
  const icalUrl = `${baseUrl}/api/ical/${propertyId}`;
  const isPersonalFlavor = appUser?.appFlavor !== 'commercial';

  return (
    <div className="flex-1 space-y-6 w-full max-w-[100vw] overflow-x-hidden px-2 sm:px-4">
        <div className="relative w-full h-[280px] sm:h-[350px] rounded-3xl overflow-hidden shadow-2xl group bg-muted">
            {property.imageUrl && property.imageUrl.trim() !== "" ? (
                <Image 
                    src={property.imageUrl} 
                    alt={property.name} 
                    fill 
                    className="object-cover transition-transform duration-700 group-hover:scale-105" 
                    priority
                />
            ) : (
                <div className="w-full h-full bg-primary/10 flex flex-col items-center justify-center gap-4">
                    <Home className="h-24 w-20 text-primary opacity-20" />
                </div>
            )}
            
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none z-20" />
            <div className="absolute bottom-0 left-0 w-full p-6 sm:p-10 space-y-4 z-30 pointer-events-auto">
                <div className="space-y-1">
                    <h2 className="text-3xl sm:text-5xl font-black tracking-tighter text-white drop-shadow-lg uppercase italic">{property.name}</h2>
                    <p className="text-zinc-200 text-sm sm:text-lg font-medium flex items-center gap-2 drop-shadow-md">
                        <MapPin className="h-4 w-4 text-primary-foreground" />
                        {property.address}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                    {property.propertyUrl && (
                        <Button variant="outline" size="sm" asChild className="bg-white/10 border-white/20 text-white hover:bg-white/20 backdrop-blur-md">
                            <a href={property.propertyUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Web
                            </a>
                        </Button>
                    )}
                    <Dialog open={isEditPropertyOpen} onOpenChange={setIsEditPropertyOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="bg-primary text-white shadow-xl hover:scale-105 transition-transform font-bold">
                                <Pencil className="mr-2 h-4 w-4" />
                                {t('common.edit')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent 
                            className="sm:max-w-4xl max-h-[90vh] p-0 overflow-hidden flex flex-col"
                            onPointerDownOutside={(e) => e.preventDefault()}
                            onEscapeKeyDown={(e) => e.preventDefault()}
                        >
                            <PropertyEditForm 
                                property={property} 
                                providers={data.providers || []} 
                                isPersonalFlavor={isPersonalFlavor}
                                onPropertyDeleted={handlePropertyDeleted}
                                onPropertyUpdated={handleDataChanged}
                                onClose={() => setIsEditPropertyOpen(false)}
                            />
                        </DialogContent>
                    </Dialog>
                    <PropertyNotesForm property={property} onPropertyUpdated={handleDataChanged} />
                </div>
            </div>
        </div>

        <Card className="bg-primary/5 border-primary/20 border-dashed w-full shadow-sm rounded-2xl">
            <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-full">
                        <CalendarIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase font-black text-primary tracking-widest">{t('properties.ical_sync')}</p>
                        <Input readOnly value={icalUrl} className="h-7 text-[10px] bg-white/50 border-none font-mono min-w-[200px]" />
                    </div>
                </div>
                <Button variant="secondary" size="sm" onClick={handleCopyICal} className="h-8 shadow-sm shrink-0">
                    <Copy className="mr-2 h-3 w-3" /> {t('common.copy_link')}
                </Button>
            </CardContent>
        </Card>

        <Tabs defaultValue="temporarios" className="space-y-4 w-full">
            <div className="w-full pb-2">
                <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 bg-zinc-100/80 border border-zinc-200 p-1.5 gap-1.5 rounded-xl shadow-inner text-muted-foreground">
                    <TabsTrigger id="tab-temporarios" value="temporarios" className="py-2 text-xs font-bold rounded-lg">{t('bookings.tabs.temporary')}</TabsTrigger>
                    <TabsTrigger id="tab-contratos" value="contratos" className="py-2 text-xs font-bold rounded-lg">{t('bookings.tabs.contracts')}</TabsTrigger>
                    <TabsTrigger id="tab-blocks" value="blocks" className="py-2 text-xs font-bold rounded-lg">{t('bookings.tabs.blocks')}</TabsTrigger>
                    <TabsTrigger id="tab-calendar" value="calendar" className="py-2 text-xs font-bold rounded-lg">{t('bookings.tabs.calendar')}</TabsTrigger>
                    <TabsTrigger value="report" className="py-2 text-xs font-bold rounded-lg">{t('bookings.tabs.report')}</TabsTrigger>
                    <TabsTrigger id="tab-tasks" value="tasks" className="py-2 text-xs font-bold rounded-lg">{t('bookings.tabs.tasks')}</TabsTrigger>
                    {isPersonalFlavor && <TabsTrigger id="tab-expenses" value="expenses" className="py-2 text-xs font-bold rounded-lg">{t('bookings.tabs.expenses')}</TabsTrigger>}
                    <TabsTrigger value="payments" className="py-2 text-xs font-bold rounded-lg">{t('bookings.tabs.payments')}</TabsTrigger>
                    <TabsTrigger id="tab-liquidations" value="liquidations" className="py-2 text-xs font-bold rounded-lg">{t('bookings.tabs.liquidations')}</TabsTrigger>
                </TabsList>
            </div>
            
            <TabsContent value="temporarios" className="w-full">
                <Card className="border-none sm:border shadow-none sm:shadow-sm w-full">
                    <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4">
                        <div className="flex-1">
                            <CardTitle className="text-lg">{t('bookings.title')}</CardTitle>
                            <CardDescription>{t('bookings.tabs_desc.temporary')}</CardDescription>
                        </div>
                        <BookingAddForm propertyId={property.id} properties={data.properties} tenants={data.tenants || []} allBookings={data.bookings || []} allBlocks={data.blocks || []} onDataChanged={handleDataChanged}>
                            <Button>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                {t('bookings.new_booking')}
                            </Button>
                        </BookingAddForm>
                    </CardHeader>
                    <CardContent className="p-0 sm:p-6 w-full">
                         <FilterBar 
                            search={temporariosSearch} onSearchChange={setTemporariosSearch}
                            from={temporariosFrom} onFromChange={setTemporariosFrom}
                            to={temporariosTo} onToChange={setTemporariosTo}
                            onClear={() => { setTemporariosSearch(''); setTemporariosFrom(undefined); setTemporariosTo(undefined); setTemporariosStatus('all'); setTemporariosOrigin('all'); setTemporariosSortOrder('distant'); }}
                            count={filteredTemporarios.length}
                            total={data.bookings?.length || 0}
                            extra={(
                                <>
                                    <div className="grid gap-1.5 w-full">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">{t('bookings.filters.status')}</Label>
                                        <Select value={temporariosStatus} onValueChange={setTemporariosStatus}>
                                            <SelectTrigger className="h-9 bg-background w-full"><SelectValue placeholder={t('bookings.filters.status')}/></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">{t('common.all')}</SelectItem>
                                                <SelectItem value="active">{t('bookings.status.active')}</SelectItem>
                                                <SelectItem value="upcoming">{t('bookings.status.upcoming')}</SelectItem>
                                                <SelectItem value="closed">{t('bookings.status.closed')}</SelectItem>
                                                <SelectItem value="with-debt">{t('bookings.status.with_debt')}</SelectItem>
                                                <SelectItem value="pending">{t('bookings.status.pending')}</SelectItem>
                                                <SelectItem value="cancelled">{t('bookings.status.cancelled')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </>
                            )}
                        />
                        <div className="w-full overflow-x-hidden">
                            <BookingsList bookings={filteredTemporarios} properties={data.properties || []} tenants={data.tenants || []} origins={data.origins || []} providers={data.providers || []} onDataChanged={handleDataChanged} isPersonalFlavor={isPersonalFlavor} />
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="contratos" className="w-full">
                <Card className="border-none sm:border shadow-none sm:shadow-sm w-full">
                    <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4">
                        <div className="flex-1">
                            <CardTitle className="text-lg">{t('contratos.title')}</CardTitle>
                            <CardDescription>{t('bookings.tabs_desc.contracts')}</CardDescription>
                        </div>
                        <ContratoAddForm propertyId={property.id} properties={data.properties} tenants={data.tenants || []} onDataChanged={handleDataChanged} />
                    </CardHeader>
                    <CardContent className="p-0 sm:p-6 w-full">
                        <FilterBar 
                            search={contratosSearch} onSearchChange={setContratosSearch}
                            from={contratosFrom} onFromChange={setContratosFrom}
                            to={contratosTo} onToChange={setContratosTo}
                            onClear={() => { setContratosSearch(''); setContratosFrom(undefined); setContratosTo(undefined); }}
                            count={filteredContratos.length}
                            total={data.contratos?.length || 0}
                        />
                        <ContratosList contratos={filteredContratos} properties={data.properties || []} tenants={data.tenants || []} onDataChanged={handleDataChanged} />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="blocks">
                <Card className="border-none sm:border shadow-none sm:shadow-sm w-full">
                    <CardHeader className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4">
                        <div className="flex-1">
                            <CardTitle className="text-lg">{t('bookings.tabs.blocks')}</CardTitle>
                            <CardDescription>{t('bookings.tabs_desc.blocks')}</CardDescription>
                        </div>
                        <DateBlockAddForm propertyId={property.id} properties={data.properties} allBookings={data.bookings || []} allBlocks={data.blocks || []} isOpen={isBlockFormOpen} onOpenChange={setIsBlockFormOpen} onDataChanged={handleDataChanged} />
                    </CardHeader>
                    <CardContent className="p-0 sm:p-6 overflow-x-auto w-full">
                        <DateBlocksList blocks={data.blocks || []} allBookings={data.bookings || []} allBlocks={data.blocks || []} onDataChanged={handleDataChanged} />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="calendar">
                <Card className="w-full overflow-hidden">
                    <CardHeader className="p-4 border-b">
                        <CardTitle className="text-lg">{t('bookings.tabs.calendar')}</CardTitle>
                        <CardDescription>{t('bookings.tabs_desc.calendar')}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center p-2 sm:p-6 overflow-x-auto">
                        <Calendar mode="multiple" selected={[]} onSelect={() => {}} numberOfMonths={isMobile ? 1 : 2} locale={currentLocale} modifiers={dayModifiers} modifiersClassNames={dayModifiersClassNames} />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="report">
                <div className="space-y-6 w-full">
                    {financialSummary ? (
                        <div className="space-y-6 w-full">
                            {Object.entries(financialSummary).map(([currency, summary]) => {
                                const filtered = (summary as any[]).filter((s: any) => s.propertyId === property.id);
                                if (filtered.length === 0 || (filtered[0].totalIncome === 0 && filtered[0].totalExpenses === 0 && filtered[0].totalPayments === 0)) return null;
                                const trendData = calculateMonthlyNetIncomeTrends(property.id, data.payments, data.allExpenses, currency);

                                return (
                                    <div key={currency} className="space-y-6 w-full">
                                        <h3 className="text-xl font-bold uppercase border-b pb-2 flex items-center gap-2">
                                            <div className={cn("w-3 h-3 rounded-full", currency.toUpperCase() === 'USD' ? 'bg-green-600' : 'bg-blue-600')} />
                                            {currency}
                                        </h3>
                                        
                                        <Card className="shadow-sm border-2">
                                            <CardHeader className="p-4 pb-2">
                                                <CardTitle className="text-base flex items-center gap-2">
                                                    <TrendingUp className="h-4 w-4 text-primary" />
                                                    {t('reports.monthly_trend_title')}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-4 sm:p-6">
                                                <MonthlyNetIncomeChart data={trendData} currency={currency} />
                                            </CardContent>
                                        </Card>

                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                                            <Card className="lg:col-span-1 shadow-sm w-full">
                                                <CardHeader className="p-4"><CardTitle className="text-base">{t('reports.performance')}</CardTitle></CardHeader>
                                                <CardContent className="p-4"><FinancialSummaryChart summaryItem={filtered[0]} currency={currency} /></CardContent>
                                            </Card>
                                            <Card className="lg:col-span-2 shadow-sm w-full">
                                                <CardHeader className="p-4"><CardTitle className="text-base">{t('reports.financial_detail')}</CardTitle></CardHeader>
                                                <CardContent className="p-2 sm:p-6 w-full overflow-x-auto">
                                                <FinancialSummaryTable summary={filtered} currency={currency} />
                                                </CardContent>
                                            </Card>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin mr-2" /> {t('common.loading')}</div>
                    )}
                </div>
            </TabsContent>

            <TabsContent value="tasks">
                <Card className="border-none sm:border shadow-none sm:shadow-sm w-full">
                    <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4">
                        <div className="flex-1">
                            <CardTitle className="text-lg">{t('tasks.title')}</CardTitle>
                            <CardDescription>{t('tasks.description')}</CardDescription>
                        </div>
                        <TaskAddForm 
                            propertyId={property.id} 
                            properties={data.properties} 
                            providers={data.providers} 
                            categories={data.taskCategories} 
                            scopes={data.taskScopes} 
                            onTaskAdded={handleDataChanged}
                            currencySettings={data.currencySettings}
                        >
                            <Button>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                {t('tasks.new_task')}
                            </Button>
                        </TaskAddForm>
                    </CardHeader>
                    <CardContent className="p-0 sm:p-6 w-full">
                        <TasksList tasks={filteredTasks} allExpenses={data.allExpenses} properties={data.properties} providers={data.providers} categories={data.taskCategories} scopes={data.taskScopes} onDataChanged={handleDataChanged} onRegisterExpense={handleOpenExpenseFormWithData} propertyId={propertyId} />
                    </CardContent>
                </Card>
            </TabsContent>
            
            {isPersonalFlavor && (
                <TabsContent value="expenses">
                    <Card className="border-none sm:border shadow-none sm:shadow-sm w-full">
                        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4">
                            <div className="flex-1">
                                <CardTitle className="text-lg">{t('expenses.title')}</CardTitle>
                                <CardDescription>{t('expenses.description')}</CardDescription>
                            </div>
                            <ExpenseAddForm 
                                assignment={{ type: 'property', id: property.id }} 
                                categories={data.expenseCategories} 
                                providers={data.providers} 
                                properties={data.properties}
                                scopes={data.taskScopes}
                                onExpenseAdded={handleDataChanged} 
                                currencySettings={data.currencySettings}
                                lockAssignment={true}
                            >
                                <Button>
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    {t('expenses.add_button')}
                                </Button>
                            </ExpenseAddForm>
                        </CardHeader>
                        <CardContent className="p-0 sm:p-6 w-full">
                            <ExpensesList expenses={filteredExpenses} categories={data.expenseCategories} providers={data.providers} properties={data.properties} scopes={data.taskScopes} onDataChanged={handleDataChanged} />
                        </CardContent>
                    </Card>
                </TabsContent>
            )}
            
            <TabsContent value="payments">
                <PaymentsList payments={filteredPayments} />
            </TabsContent>

            <TabsContent value="liquidations">
                <OwnerLiquidationClient property={property} liquidations={data.ownerLiquidations || []} onDataChanged={handleDataChanged} />
            </TabsContent>
        </Tabs>

        {expenseAssignment && (
            <ExpenseAddForm
                key={expenseAssignment ? `exp-form-${expenseAssignment.id}-${expensePreloadData?.taskId || 'new'}` : 'exp-form-empty'}
                assignment={expenseAssignment}
                categories={data.expenseCategories}
                providers={data.providers}
                properties={data.properties}
                scopes={data.taskScopes}
                onExpenseAdded={handleDataChanged}
                isOpen={isExpenseAddOpen}
                onOpenChange={(open) => {
                    setIsExpenseAddOpen(open);
                    if (!open) setExpenseAssignment(null);
                }}
                preloadData={expensePreloadData}
                currencySettings={data.currencySettings}
                lockAssignment={true}
            >
                <div className="hidden" />
            </ExpenseAddForm>
        )}
    </div>
  );
}
