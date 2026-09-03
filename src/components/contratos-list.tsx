
'use client';

import { ContratoWithDetails, Tenant, Origin, Property, Contrato, GuaranteeStatus, ContractStatus } from "@/lib/data";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, addMonths, startOfToday } from 'date-fns';
import { es, enUS, ptBR, fr } from 'date-fns/locale';
import { cn, parseDateSafely } from '@/lib/utils';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Notebook, Pencil, Trash2, PenLine, ShieldCheck, ClipboardList, Clock, FileText } from 'lucide-react';
import { ContratoEditForm } from './contrato-edit-form';
import { ContratoDeleteForm } from './contrato-delete-form';
import { NotesViewer } from "./notes-viewer";
import { TenantDetailsDialog } from "./tenant-details-dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "./ui/tooltip";
import { useToast } from "./ui/use-toast";
import { ContratoGuaranteeManager } from "./contrato-guarantee-manager";
import { ContratoContractManager } from "./contrato-contract-manager";
import { useTranslation } from "@/i18n/useTranslation";

interface ContratosListProps {
  contratos: ContratoWithDetails[];
  properties: Property[];
  tenants: Tenant[];
  origins?: Origin[];
  onDataChanged: () => void;
}

export default function ContratosList({ contratos, properties, tenants, onDataChanged }: ContratosListProps) {
  const { t, language } = useTranslation();
  
  const getLocale = () => {
      switch(language) {
          case 'en': return enUS;
          case 'pt': return ptBR;
          case 'fr': return fr;
          default: return es;
      }
  };
  const { toast } = useToast();
  const [baseUrl, setBaseUrl] = useState('');
  const today = startOfToday();

  const [editingContrato, setEditingContrato] = useState<ContratoWithDetails | null>(null);
  const [deletingContrato, setDeletingContrato] = useState<ContratoWithDetails | null>(null);
  const [notesContrato, setNotesContrato] = useState<ContratoWithDetails | null>(null);
  const [guaranteeContrato, setGuaranteeContrato] = useState<ContratoWithDetails | null>(null);
  const [contractContrato, setContractContrato] = useState<ContratoWithDetails | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') setBaseUrl(window.location.origin);
  }, []);

  const handleOpenWhatsAppSignature = (contrato: ContratoWithDetails) => {
    const tenantName = contrato.tenantName || '';
    const signatureLink = `${baseUrl}/sign/${contrato.id}`;
    const message = t('bookings.whatsapp.signature_message').replace('{{name}}', tenantName).replace('{{link}}', signatureLink);
    navigator.clipboard.writeText(message);
    toast({ title: t('common.success'), description: t('bookings.tooltips.signature_copy_success') });
    if (contrato.tenant?.phone) {
        const countryCode = (contrato.tenant.countryCode || '+54').replace(/[^0-9]/g, '');
        const sanitizedPhone = contrato.tenant.phone.replace(/[^0-9]/g, '');
        window.open(`https://wa.me/${countryCode}${sanitizedPhone}?text=${encodeURIComponent(message)}`, '_blank');
    }
  };

  if (!contratos || contratos.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed rounded-3xl bg-muted/20">
            <FileText className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-bold text-muted-foreground">{t('contratos.no_contracts')}</h3>
            <p className="text-sm text-muted-foreground/60 max-w-xs">{t('common.empty_states.contracts_desc')}</p>
        </div>
    );
  }

  const formatCurrency = (amount: number, currency: string) => 
    new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

  const calculateNextUpdate = (startDateStr: string, frequencyMonths: number) => {
      const start = parseDateSafely(startDateStr);
      if (!start || !frequencyMonths) return null;
      let nextDate = addMonths(start, frequencyMonths);
      let it = 0;
      while (nextDate <= today && it < 120) { nextDate = addMonths(nextDate, frequencyMonths); it++; }
      return nextDate;
  };

  const getStatusStyles = (status: string | undefined) => {
    const s = (status || '').toLowerCase().trim();
    switch (s) {
        case 'active':
            return { header: "bg-green-500/10", badge: "bg-green-600", title: "text-green-700" };
        case 'draft':
            return { header: "bg-blue-500/10", badge: "bg-blue-600", title: "text-blue-700" };
        case 'cancelled':
            return { header: "bg-red-500/10", badge: "bg-destructive", title: "text-red-700" };
        case 'ended':
            return { header: "bg-zinc-500/10", badge: "bg-zinc-500", title: "text-zinc-700" };
        default:
            return { header: "bg-muted/10", badge: "bg-muted-foreground", title: "text-foreground" };
    }
  };

  const renderActions = (c: ContratoWithDetails) => (
    <div className="flex flex-wrap items-center justify-end gap-1">
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-500" onClick={() => setGuaranteeContrato(c)}>
                        <ShieldCheck className="h-4 w-4"/>
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>{t('bookings.table.guarantee')}</p></TooltipContent>
            </Tooltip>

            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setNotesContrato(c)} disabled={!c.notes}>
                        <Notebook className="h-4 w-4"/>
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>{t('tenants.tooltips.view_notes')}</p></TooltipContent>
            </Tooltip>

            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingContrato(c)}>
                        <Pencil className="h-4 w-4"/>
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>{t('common.edit')}</p></TooltipContent>
            </Tooltip>

            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingContrato(c)}>
                        <Trash2 className="h-4 w-4"/>
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>{t('common.delete')}</p></TooltipContent>
            </Tooltip>
        </TooltipProvider>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-24">
        {contratos.map((c) => {
            const status = c.status || 'active';
            const styles = getStatusStyles(status);
            const proximoAjuste = calculateNextUpdate(c.fechaInicio, c.frecuenciaAjuste);
            
            return (
                <Card key={c.id} className={cn("overflow-hidden border shadow-sm flex flex-col transition-all")}>
                    <CardHeader className={cn("flex flex-row justify-between items-start pb-3 py-3 px-4 border-b", styles.header)}>
                        <div className="flex-1 min-w-0">
                            <CardTitle className="text-lg">
                                <button onClick={() => setSelectedTenant(tenants.find(t => t.id === c.tenantId) || null)} className={cn("text-left hover:underline font-bold truncate block w-full", styles.title)}>
                                    {c.tenantName}
                                </button>
                            </CardTitle>
                            <CardDescription className="font-medium text-[10px] flex items-center gap-1 mt-1">
                                <Clock className="h-3 w-3" />
                                {format(parseDateSafely(c.fechaInicio) || new Date(), "dd MMM yyyy", { locale: getLocale() })} - {format(parseDateSafely(c.fechaFin) || new Date(), "dd MMM yyyy", { locale: getLocale() })}
                            </CardDescription>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <Badge className={cn("text-[10px] font-bold uppercase h-5", styles.badge)}>
                                {t(`contratos.status.${status || 'active'}`)}
                            </Badge>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setContractContrato(c);
                                }}
                            >
                                <Badge variant="outline" className={cn(
                                    "text-[9px] uppercase border-primary text-primary flex items-center gap-1 cursor-pointer hover:opacity-80 transition-all",
                                    c.contractStatus === 'signed' ? 'bg-blue-50 border-blue-200 text-blue-700' : ''
                                )}>
                                    <ClipboardList className="h-3 w-3" />
                                    {t(`bookings.contract_status.${c.contractStatus || 'not_sent'}`)}
                                </Badge>
                            </button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4 flex-grow">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('contratos.initial_fee')}</p>
                                <p className="text-xl font-black text-primary leading-none">{formatCurrency(c.montoInicial, c.moneda)}</p>
                            </div>
                            {status === 'active' && proximoAjuste && (
                                <div className="text-right space-y-1">
                                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('contratos.adjustment')}</p>
                                    <p className="text-xl font-black text-amber-600 leading-none">{format(proximoAjuste, "MMM yyyy", { locale: getLocale() })}</p>
                                </div>
                            )}
                        </div>

                        <div className="bg-muted/30 p-3 rounded-lg border border-dashed grid grid-cols-2 gap-2 text-[11px]">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-muted-foreground uppercase font-bold">{t('bookings.table.guarantee')}</span>
                                <div className="flex items-center gap-1 font-bold text-orange-700">
                                    <ShieldCheck className="h-3 w-3" />
                                    {c.montoGarantia ? formatCurrency(c.montoGarantia, c.monedaGarantia || 'USD') : 'S/D'}
                                </div>
                            </div>
                            <div className="text-right flex flex-col gap-0.5">
                                <span className="text-muted-foreground uppercase font-bold">{t('bookings.filters.guarantee_status')}</span>
                                <span className="font-medium text-primary uppercase">{t(`bookings.guarantee_status.${c.guaranteeStatus || 'not_solicited'}`)}</span>
                            </div>
                        </div>

                        <div className="pt-1 flex justify-between items-center text-[10px]">
                            <span className="text-muted-foreground font-bold uppercase">{t('contratos.frequency')}: <span className="text-foreground">{c.frecuenciaAjuste === 1 ? t('contratos.monthly') : t('contratos.every_x_months', { count: c.frecuenciaAjuste })}</span></span>
                            <span className="text-muted-foreground font-bold uppercase">{t('contratos.payment_day')}: <span className="text-foreground">{t('contratos.day_x', { day: c.diaVencimiento })}</span></span>
                        </div>
                    </CardContent>
                    <CardFooter className="p-2 px-4 justify-between border-t bg-muted/30">
                        <Button variant="default" size="sm" asChild className="h-8 font-bold text-xs shadow-sm">
                            <Link href={`/contratos/${c.id}`}>{t('contratos.detail_payments')}</Link>
                        </Button>
                        {renderActions(c)}
                    </CardFooter>
                </Card>
            );
        })}

        {editingContrato && <ContratoEditForm contrato={editingContrato} properties={properties} tenants={tenants} isOpen={!!editingContrato} onOpenChange={(o: boolean) => !o && setEditingContrato(null)} onDataChanged={onDataChanged} />}
        {deletingContrato && <ContratoDeleteForm contrato={deletingContrato} isOpen={!!deletingContrato} onOpenChange={(o: boolean) => !o && setDeletingContrato(null)} onActionComplete={onDataChanged} />}
        {notesContrato && <NotesViewer notes={notesContrato.notes} title={`${t('tenants.tooltips.view_notes')} - ${notesContrato.tenantName}`} isOpen={!!notesContrato} onOpenChange={(o: boolean) => !o && setNotesContrato(null)} />}
        {guaranteeContrato && <ContratoGuaranteeManager contrato={guaranteeContrato} isOpen={!!guaranteeContrato} onOpenChange={(o: boolean) => !o && setGuaranteeContrato(null)} onActionComplete={onDataChanged} />}
        {contractContrato && (
            <ContratoContractManager
                contrato={contractContrato}
                isOpen={!!contractContrato}
                onOpenChange={(o: boolean) => !o && setContractContrato(null)}
                onContractUpdated={onDataChanged}
                onSignatureClick={(c) => handleOpenWhatsAppSignature(c)}
            />
        )}
        {selectedTenant && <TenantDetailsDialog tenant={selectedTenant} isOpen={!!selectedTenant} onOpenChange={(o: boolean) => !o && setSelectedTenant(null)} />}
    </div>
  );
}
