
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, ChevronLeft, User, Building2, Calendar, Wallet, FileText, Info, Notebook, ShieldCheck, ClipboardList, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, parseDateSafely } from '@/lib/utils';
import { format } from 'date-fns';
import { es, enUS, ptBR } from 'date-fns/locale';
import { ContratoPaymentForm } from '@/components/contrato-payment-form';
import { ContratoAdjustmentForm } from '@/components/contrato-adjustment-form';
import { NotesViewer } from '@/components/notes-viewer';
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Contrato, PeriodoPago, Property, Tenant, ContratoStatus, GuaranteeStatus } from "@/lib/data";
import useWindowSize from "@/hooks/use-window-size";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from "@/i18n/useTranslation";

const locales: Record<string, any> = { es, en: enUS, pt: ptBR };

interface ContratoWithDetails extends Contrato {
    property?: Property;
    tenant?: Tenant;
    tenantName: string;
}

const formatCurrency = (amount: number, currency: string) => {
    try {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
    } catch (e) {
        return `${currency} ${amount.toFixed(2)}`;
    }
};

export default function ContratoDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { t, language } = useTranslation();
    const currentLocale = locales[language] || es;

    const id = params.id as string;
    const [contrato, setContrato] = useState<ContratoWithDetails | null>(null);
    const [periodos, setPeriodos] = useState<PeriodoPago[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPeriodo, setSelectedPeriodo] = useState<PeriodoPago | null>(null);
    const [baseValueForAdjustment, setBaseValueForAdjustment] = useState<number>(0);
    const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);
    const [isAdjustmentFormOpen, setIsAdjustmentFormOpen] = useState(false);
    const [isNotesOpen, setIsNotesOpen] = useState(false);

    const { width } = useWindowSize();
    const isMobile = width !== undefined && width < 768;

    const formatDate = (dateString: string | null | undefined, dateFormat: string = "dd 'de' LLLL, yyyy") => {
        if (!dateString) return 'N/A';
        const date = parseDateSafely(dateString);
        if (!date) return 'Fecha inválida';
        return format(date, dateFormat, { locale: currentLocale });
    };

    const getPeriodoStatusBadge = (estado: PeriodoPago['estado']) => {
        switch (estado) {
            case 'pagado':
                return <Badge variant="default" className="bg-green-600">{t('contratos.period_status.paid')}</Badge>;
            case 'pendiente':
                return <Badge variant="secondary">{t('contratos.period_status.pending')}</Badge>;
            case 'vencido':
                return <Badge variant="destructive">{t('contratos.period_status.overdue')}</Badge>;
            case 'pago_parcial':
                return <Badge variant="default" className="bg-yellow-500 text-black">{t('contratos.period_status.partial')}</Badge>;
            case 'pendiente_ajuste':
                 return <Badge variant="outline" className="border-orange-500 text-orange-600 animate-pulse">{t('contratos.period_status.pending_adj')}</Badge>;
            default:
                return <Badge variant="outline">Desconocido</Badge>;
        }
    }

    const contratoStatusMap: Record<ContratoStatus, { text: string, className: string }> = {
        draft: { text: t('contratos.status.draft'), className: 'bg-gray-300 text-black hover:bg-gray-400' },
        active: { text: t('contratos.status.active'), className: 'bg-green-600 hover:bg-green-700' },
        ended: { text: t('contratos.status.ended'), className: 'bg-orange-500 hover:bg-orange-600' },
        cancelled: { text: t('contratos.status.cancelled'), className: 'bg-destructive hover:bg-destructive/90' }
    };

    const guaranteeStatusMap: Record<GuaranteeStatus, { text: string, className: string }> = {
        not_solicited: { text: t('bookings.guarantee_status.not_solicited'), className: 'bg-gray-400 hover:bg-gray-500' },
        solicited: { text: t('bookings.guarantee_status.solicited'), className: 'bg-blue-400 hover:bg-blue-500' },
        received: { text: t('bookings.guarantee_status.received'), className: 'bg-green-500 hover:bg-green-600' },
        returned: { text: t('bookings.guarantee_status.returned'), className: 'bg-purple-500 hover:bg-purple-600' },
        not_applicable: { text: t('bookings.guarantee_status.not_applicable'), className: 'bg-yellow-500 text-black hover:bg-yellow-700' }
    };

    const fetchData = useCallback(async () => {
         if (!id) return;
         setIsLoading(true);
         try {
            const contratoDoc = await getDoc(doc(db, 'contratos', id));
            if (!contratoDoc.exists()) {
                setContrato(null);
                setIsLoading(false);
                return;
            }

            const contratoData = { id: contratoDoc.id, ...contratoDoc.data() } as Contrato;
            
            const [propDoc, tenantDoc, periodosSnap] = await Promise.all([
                getDoc(doc(db, 'properties', contratoData.propertyId)),
                getDoc(doc(db, 'tenants', contratoData.tenantId)),
                getDocs(query(collection(db, 'periodosPago'), where('contratoId', '==', id)))
            ]);

            const tenant = tenantDoc.exists() ? { id: tenantDoc.id, ...tenantDoc.data() } as Tenant : undefined;

            const enrichedContrato: ContratoWithDetails = {
                ...contratoData,
                tenantName: tenant?.name || 'Inquilino Desconocido',
                property: propDoc.exists() ? { id: propDoc.id, ...propDoc.data() } as Property : undefined,
                tenant: tenant
            };

            const periodosList = periodosSnap.docs.map(d => ({ id: d.id, ...d.data() } as PeriodoPago))
                .sort((a, b) => (parseDateSafely(a.fechaDesde)?.getTime() || 0) - (parseDateSafely(b.fechaDesde)?.getTime() || 0));

            setContrato(enrichedContrato);
            setPeriodos(periodosList);
         } catch (error) {
            console.error("Error fetching contract details:", error);
         } finally {
            setIsLoading(false);
         }
    }, [id]);

    useEffect(() => {
       fetchData();
    }, [fetchData]);

    const handlePayClick = (periodo: PeriodoPago) => {
        setSelectedPeriodo(periodo);
        setIsPaymentFormOpen(true);
    };

    const handleAdjustClick = (periodo: PeriodoPago) => {
        setSelectedPeriodo(periodo);
        // Encontrar el monto del periodo anterior para usarlo como base real del ajuste
        const idx = periodos.findIndex(p => p.id === periodo.id);
        const prevMonto = idx > 0 ? periodos[idx - 1].montoAjustado : contrato?.montoInicial;
        setBaseValueForAdjustment(prevMonto || periodo.montoAjustado);
        setIsAdjustmentFormOpen(true);
    };

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin mr-3 text-primary" />
                <span>{t('common.loading')}</span>
            </div>
        );
    }
    
    if (!contrato) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-4">
                <p className="text-xl font-semibold">Contrato no encontrado</p>
                <Button onClick={() => router.back()}>{t('common.back')}</Button>
            </div>
        );
    }

    const contratoStatus = contratoStatusMap[contrato.status || 'active'];
    const guaranteeStatus = guaranteeStatusMap[contrato.guaranteeStatus || 'not_solicited'];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <Button variant="outline" onClick={() => router.back()} className="w-fit">
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    {t('common.back')}
                </Button>
                <Badge variant="default" className={cn("text-sm py-1 px-4 w-fit", contratoStatus.className)}>
                    {contratoStatus.text}
                </Badge>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>{t('contratos.title')}</CardTitle>
                    <CardDescription>Detalles del acuerdo a largo plazo.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
                    <div className="flex items-start gap-3">
                        <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                            <p className="text-muted-foreground">{t('bookings.table.property')}</p>
                            <p className="font-semibold">{contrato.property?.name || 'N/A'}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                            <p className="text-muted-foreground">{t('bookings.table.tenant')}</p>
                            <p className="font-semibold">{contrato.tenant?.name || 'N/A'}</p>
                        </div>
                    </div>
                     <div className="flex items-start gap-3">
                        <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                            <p className="text-muted-foreground">Duración</p>
                            <p className="font-semibold">{formatDate(contrato.fechaInicio)} al {formatDate(contrato.fechaFin)}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Wallet className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                            <p className="text-muted-foreground">{t('contratos.initial_fee')}</p>
                            <p className="font-semibold">{formatCurrency(contrato.montoInicial, contrato.moneda)}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <ShieldCheck className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                            <p className="text-muted-foreground">{t('bookings.table.guarantee')}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge className={cn("text-[10px] h-5", guaranteeStatus.className)}>
                                    {guaranteeStatus.text}
                                </Badge>
                                {contrato.montoGarantia ? (
                                    <p className="font-semibold">{formatCurrency(contrato.montoGarantia, contrato.monedaGarantia || 'USD')}</p>
                                ) : null}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                            <p className="text-muted-foreground">{t('contratos.adjustment')}</p>
                            <p className="font-semibold">Cada {contrato.frecuenciaAjuste} meses</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Notebook className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                            <p className="text-muted-foreground">{t('tenants.card.notes')}</p>
                            {contrato.notes ? (
                                <Button variant="link" className="p-0 h-auto font-semibold" onClick={() => setIsNotesOpen(true)}>{t('common.details')}</Button>
                            ) : (
                                <p className="font-semibold text-sm">Sin notas</p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <ClipboardList className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                            <p className="text-muted-foreground">Firma del Documento</p>
                            <Badge variant="outline" className="mt-1">
                                {contrato.contractStatus === 'signed' ? 'Documento Firmado' : 'Pendiente de Firma'}
                            </Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t('contratos.payment_plan')}</CardTitle>
                    <CardDescription>{t('contratos.payment_plan_desc')}</CardDescription>
                </CardHeader>
                <CardContent>
                    {isMobile ? (
                        <div className="space-y-4">
                            {periodos.map(periodo => {
                                const saldo = (periodo.montoAjustado || 0) - (periodo.montoPagado || 0);
                                const isPaid = periodo.estado === 'pagado';
                                const needsAdjustment = periodo.estado === 'pendiente_ajuste';
                                
                                return (
                                    <Card key={periodo.id} className={cn(
                                        "overflow-hidden border shadow-sm",
                                        isPaid ? "border-green-200" : (needsAdjustment ? "border-orange-200" : "border-blue-200")
                                    )}>
                                        <CardHeader className={cn(
                                            "p-4 py-3 flex flex-row items-center justify-between space-y-0",
                                            isPaid ? "bg-green-500/10" : (needsAdjustment ? "bg-orange-500/10" : "bg-blue-500/10")
                                        )}>
                                            <div className="flex flex-col">
                                                <p className={cn(
                                                    "font-bold text-base capitalize",
                                                    isPaid ? "text-green-700" : (needsAdjustment ? "text-orange-700" : "text-blue-700")
                                                )}>{formatDate(periodo.fechaDesde, "MMMM yyyy")}</p>
                                                {periodo.indiceAplicado && <p className="text-[10px] opacity-70 font-bold uppercase">Ajuste: {periodo.indiceAplicado}</p>}
                                            </div>
                                            {getPeriodoStatusBadge(periodo.estado)}
                                        </CardHeader>
                                        <CardContent className="p-4 space-y-3 text-sm">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <p className="text-muted-foreground text-xs uppercase font-bold">{t('contratos.due_date')}</p>
                                                    <p className="font-medium">{formatDate(periodo.fechaVencimiento, 'dd/MM/yyyy')}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-muted-foreground text-xs uppercase font-bold">{t('contratos.fee_amount')}</p>
                                                    <p className="font-bold text-base">{formatCurrency(periodo.montoAjustado, contrato.moneda)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-muted-foreground text-xs uppercase font-bold">{t('contratos.paid')}</p>
                                                    <p className="font-medium text-green-600">{formatCurrency(periodo.montoPagado, contrato.moneda)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-muted-foreground text-xs uppercase font-bold">{t('contratos.balance')}</p>
                                                    <p className={cn("font-bold text-base", saldo > 0 ? "text-orange-600" : "text-green-600")}>
                                                        {formatCurrency(saldo, contrato.moneda)}
                                                    </p>
                                                </div>
                                            </div>
                                            {(!isPaid || needsAdjustment || periodo.indiceAplicado) && (
                                                <div className="space-y-2 pt-2 border-t">
                                                    {needsAdjustment ? (
                                                        <Button 
                                                            className="w-full bg-orange-600 hover:bg-orange-700 shadow-sm" 
                                                            size="sm" 
                                                            onClick={() => handleAdjustClick(periodo)}
                                                        >
                                                            <TrendingUp className="mr-2 h-4 w-4" />
                                                            {t('contratos.apply_adjustment')}
                                                        </Button>
                                                    ) : (
                                                        <>
                                                            {!isPaid && (
                                                                <Button 
                                                                    className="w-full shadow-sm" 
                                                                    size="sm" 
                                                                    onClick={() => handlePayClick(periodo)}
                                                                >
                                                                    {t('contratos.register_payment')}
                                                                </Button>
                                                            )}
                                                            <Button 
                                                                variant="outline" 
                                                                className="w-full border-orange-200 text-orange-700 hover:bg-orange-50 shadow-sm" 
                                                                size="sm" 
                                                                onClick={() => handleAdjustClick(periodo)}
                                                            >
                                                                <TrendingUp className="mr-2 h-4 w-4" />
                                                                {periodo.indiceAplicado ? t('common.edit') : t('contratos.modify_amount')}
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('contratos.period')}</TableHead>
                                    <TableHead>{t('contratos.due_date')}</TableHead>
                                    <TableHead className="text-right">{t('contratos.fee_amount')}</TableHead>
                                    <TableHead className="text-right">{t('contratos.paid')}</TableHead>
                                    <TableHead className="text-right">{t('contratos.balance')}</TableHead>
                                    <TableHead className="text-center">Estado</TableHead>
                                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {periodos.map(periodo => {
                                    const saldo = (periodo.montoAjustado || 0) - (periodo.montoPagado || 0);
                                    const isPaid = periodo.estado === 'pagado';
                                    const needsAdjustment = periodo.estado === 'pendiente_ajuste';

                                    return (
                                        <TableRow key={periodo.id} className={cn(needsAdjustment && "bg-orange-50/30")}>
                                            <TableCell className="font-medium capitalize">
                                                <div className="flex flex-col">
                                                    <span>{formatDate(periodo.fechaDesde, "MMMM yyyy")}</span>
                                                    {periodo.indiceAplicado && <span className="text-[10px] text-muted-foreground font-normal">Ajuste: {periodo.indiceAplicado}</span>}
                                                </div>
                                            </TableCell>
                                            <TableCell>{formatDate(periodo.fechaVencimiento, 'dd/MM/yyyy')}</TableCell>
                                            <TableCell className="text-right font-bold">{formatCurrency(periodo.montoAjustado, contrato.moneda)}</TableCell>
                                            <TableCell className="text-right text-green-600">{formatCurrency(periodo.montoPagado, contrato.moneda)}</TableCell>
                                            <TableCell className={cn("text-right font-bold", saldo > 0 && "text-orange-600")}>
                                                {formatCurrency(saldo, contrato.moneda)}
                                            </TableCell>
                                            <TableCell className="text-center">{getPeriodoStatusBadge(periodo.estado)}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {needsAdjustment ? (
                                                        <Button variant="default" className="bg-orange-600 hover:bg-orange-700 h-8 px-3 text-xs shadow-sm" onClick={() => handleAdjustClick(periodo)}>
                                                            <TrendingUp className="mr-2 h-3 w-3" />
                                                            {t('contratos.apply_adjustment')}
                                                        </Button>
                                                    ) : (
                                                        <>
                                                            {periodo.indiceAplicado ? (
                                                                <Button variant="default" className="bg-orange-600 hover:bg-orange-700 h-8 px-3 text-xs shadow-sm" onClick={() => handleAdjustClick(periodo)}>
                                                                    <TrendingUp className="mr-2 h-3 w-3" />
                                                                    {t('common.edit')}
                                                                </Button>
                                                            ) : (
                                                                !isPaid && (
                                                                    <TooltipProvider>
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-600" onClick={() => handleAdjustClick(periodo)}>
                                                                                    <TrendingUp className="h-4 w-4" />
                                                                                </Button>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent><p>{t('contratos.modify_amount')}</p></TooltipContent>
                                                                        </Tooltip>
                                                                    </TooltipProvider>
                                                                )
                                                            )}
                                                            {!isPaid && (
                                                                <Button variant="outline" size="sm" onClick={() => handlePayClick(periodo)} className="shadow-sm">{t('contratos.register_payment')}</Button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {selectedPeriodo && isPaymentFormOpen && (
                <ContratoPaymentForm
                    contrato={contrato}
                    periodo={selectedPeriodo}
                    isOpen={isPaymentFormOpen}
                    onOpenChange={setIsPaymentFormOpen}
                    onActionComplete={fetchData}
                />
            )}

            {selectedPeriodo && isAdjustmentFormOpen && (
                <ContratoAdjustmentForm
                    contrato={contrato}
                    periodo={selectedPeriodo}
                    baseAmount={baseValueForAdjustment}
                    isOpen={isAdjustmentFormOpen}
                    onOpenChange={setIsAdjustmentFormOpen}
                    onActionComplete={fetchData}
                />
            )}

             {contrato && (
                <NotesViewer
                    isOpen={isNotesOpen}
                    onOpenChange={setIsNotesOpen}
                    notes={contrato.notes}
                    title={`${t('tenants.tooltips.view_notes')} - ${contrato.tenant?.name || 'Inquilino'}`}
                />
            )}
        </div>
    );
}
