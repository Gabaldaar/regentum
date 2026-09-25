
'use client';

import { useEffect, useState, useTransition, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Property, Payment, Expense } from '@/lib/data';
import { generateOwnerLiquidation } from '@/lib/actions';
import { Loader2, PlusCircle, Calculator, Info, Calendar as CalendarIcon, Save, ScrollText } from 'lucide-react';
import { useToast } from './ui/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseDateSafely, cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from './ui/textarea';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useTranslation } from "@/i18n/useTranslation";
import { DatePicker } from './ui/date-picker';
import { useAuth } from './auth-provider';

const formatCurrency = (amount: number, currency: string) => {
    try {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
    } catch(e) {
        return `${currency} ${amount.toFixed(2)}`;
    }
};

export function OwnerLiquidationAddForm({ property, isOpen, onOpenChange, onActionComplete }: {
    property: Property;
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onActionComplete: () => void;
}) {
    const { orgId } = useAuth();
    const { t } = useTranslation();
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    
    const [currency, setCurrency] = useState<'ARS' | 'USD'>('USD');
    const [dateGenerated, setDateGenerated] = useState<Date | undefined>(new Date());
    const [pendingPayments, setPendingPayments] = useState<Payment[]>([]);
    const [pendingExpenses, setPendingExpenses] = useState<Expense[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(false);
    
    const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
    const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (isOpen && orgId) {
            setIsLoadingData(true);
            const fetchData = async () => {
                try {
                    // Consultas filtradas estrictamente por orgId para evitar fugas
                    const getQ = (c: string) => query(collection(db, c), where('orgId', '==', orgId));
                    
                    const [pSnap, eSnap, bSnap, cSnap] = await Promise.all([
                        getDocs(getQ('payments')),
                        getDocs(getQ('expenses')),
                        getDocs(getQ('bookings')),
                        getDocs(getQ('contratos'))
                    ]);

                    const bMap = new Map(bSnap.docs.map(d => [d.id, d.data()]));
                    const cMap = new Map(cSnap.docs.map(d => [d.id, d.data()]));

                    const targetCurrency = currency.toUpperCase();

                    const payments = pSnap.docs
                        .map(d => ({ id: d.id, ...d.data() } as any))
                        .filter(p => {
                            if (p.ownerLiquidationId) return false;
                            const b = p.bookingId ? bMap.get(p.bookingId) : null;
                            const c = p.contratoId ? cMap.get(p.contratoId) : null;
                            const finalPropertyId = p.propertyId || b?.propertyId || c?.propertyId;
                            if (finalPropertyId !== property.id) return false;
                            const agreementCurrency = (p.currency || b?.currency || c?.moneda || '').toUpperCase();
                            return agreementCurrency === targetCurrency;
                        })
                        .sort((a, b) => (parseDateSafely(a.date)?.getTime() || 0) - (parseDateSafely(b.date)?.getTime() || 0));

                    const expenses = eSnap.docs
                        .map(d => ({ id: d.id, ...d.data() } as any))
                        .filter(e => {
                            if (e.ownerLiquidationId) return false;
                            if (e.assignment?.type !== 'property' || e.assignment?.id !== property.id) return false;
                            const eCur = (e.originalUsdAmount ? 'USD' : (e.currency || 'ARS')).toUpperCase();
                            return eCur === targetCurrency;
                        })
                        .sort((a, b) => (parseDateSafely(a.date)?.getTime() || 0) - (parseDateSafely(b.date)?.getTime() || 0));

                    setPendingPayments(payments);
                    setPendingExpenses(expenses);
                    setSelectedPaymentIds(payments.map(p => p.id));
                    setSelectedExpenseIds(expenses.map(e => e.id));
                } catch (error) {
                    console.error("Error loading liquidation items:", error);
                } finally {
                    setIsLoadingData(false);
                }
            };
            fetchData();
        }
    }, [isOpen, property.id, currency, orgId]);

    const { totalIncome, totalExpenses, commissionAmount, netToOwner } = useMemo(() => {
        const income = pendingPayments
            .filter(p => selectedPaymentIds.includes(p.id))
            .reduce((sum, p) => sum + (p.amount || 0), 0);
        
        const expenses = pendingExpenses
            .filter(e => selectedExpenseIds.includes(e.id))
            .reduce((sum, e) => {
                const amount = e.originalUsdAmount || e.amount;
                return sum + amount;
            }, 0);
        
        const commission = income * ((property.managementCommission || 0) / 100);
        const net = income - expenses - commission;

        return { totalIncome: income, totalExpenses: expenses, commissionAmount: commission, netToOwner: net };
    }, [selectedPaymentIds, selectedExpenseIds, pendingPayments, pendingExpenses, property.managementCommission]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedPaymentIds.length === 0 && selectedExpenseIds.length === 0) {
            toast({ variant: 'destructive', title: t('common.error'), description: 'Selecciona al menos un ítem para liquidar.' });
            return;
        }

        const formData = new FormData();
        formData.append('orgId', orgId || '');
        formData.append('propertyId', property.id);
        formData.append('currency', currency);
        formData.append('dateGenerated', dateGenerated?.toISOString() || new Date().toISOString());
        selectedPaymentIds.forEach(id => formData.append('paymentIds', id));
        selectedExpenseIds.forEach(id => formData.append('expenseIds', id));
        formData.append('totalIncome', totalIncome.toString());
        formData.append('totalExpenses', totalExpenses.toString());
        formData.append('commissionPercentage', (property.managementCommission || 0).toString());
        formData.append('commissionAmount', commissionAmount.toString());
        formData.append('netToOwner', netToOwner.toString());
        formData.append('notes', notes);
        
        const allDates = [
            ...pendingPayments.filter(p => selectedPaymentIds.includes(p.id)).map(p => p.date),
            ...pendingExpenses.filter(e => selectedExpenseIds.includes(e.id)).map(e => e.date)
        ].sort();
        
        formData.append('periodFrom', allDates[0] || new Date().toISOString());
        formData.append('periodTo', allDates[allDates.length - 1] || new Date().toISOString());

        startTransition(async () => {
            const result = await generateOwnerLiquidation({ success: false, message: '' }, formData);
            if (result.success) {
                toast({ title: t('common.success'), description: result.message });
                onActionComplete();
                onOpenChange(false);
            } else {
                toast({ variant: 'destructive', title: t('common.error'), description: result.message });
            }
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent 
              className="sm:max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-[2rem]"
            >
                <DialogHeader className="p-6 bg-background border-b shrink-0 relative z-10">
                    <DialogTitle className="text-xl font-black uppercase italic tracking-tighter text-primary flex items-center gap-2">
                        <ScrollText className="h-5 w-5" />
                        {t('owner_liquidations.add_dialog.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('owner_liquidations.add_dialog.description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto min-h-0 px-6 py-8 shadow-inner bg-muted/30 border-y border-muted-foreground/10">
                    <div className="space-y-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 bg-background p-6 rounded-3xl border shadow-sm">
                            <div className="grid gap-1.5">
                                <Label className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest">{t('owner_liquidations.add_dialog.currency')}</Label>
                                <Select value={currency} onValueChange={(v: any) => setCurrency(v)}>
                                    <SelectTrigger className="bg-background h-11">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="USD">USD</SelectItem>
                                        <SelectItem value="ARS">ARS</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest">{t('owner_liquidations.issue_date')}</Label>
                                <DatePicker date={dateGenerated} onDateSelect={setDateGenerated} />
                            </div>
                            <div className="bg-primary/10 p-3 rounded-2xl flex items-center justify-center gap-3 text-sm text-primary border border-primary/20 h-11 mt-auto">
                                <Info className="h-5 w-5" />
                                <span className="text-xs font-black uppercase tracking-widest">{t('owner_liquidations.add_dialog.commission_info')}: <strong>{property.managementCommission || 0}%</strong></span>
                            </div>
                        </div>

                        {isLoadingData ? (
                            <div className="flex justify-center p-12"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <h4 className="font-black uppercase italic tracking-widest text-green-700 flex items-center gap-2 text-sm border-l-4 border-green-600 pl-3">
                                        {t('owner_liquidations.add_dialog.income')} ({currency})
                                    </h4>
                                    <div className="border rounded-2xl overflow-hidden bg-background shadow-sm">
                                        <Table>
                                            <TableHeader className="bg-muted/50">
                                                <TableRow>
                                                    <TableHead className="w-10"></TableHead>
                                                    <TableHead className="text-[10px] font-black uppercase tracking-widest">Fecha</TableHead>
                                                    <TableHead className="text-[10px] font-black uppercase tracking-widest">Descripción</TableHead>
                                                    <TableHead className="text-right text-[10px] font-black uppercase tracking-widest">Monto</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {pendingPayments.length > 0 ? pendingPayments.map(p => (
                                                    <TableRow key={p.id} className="hover:bg-muted/30">
                                                        <TableCell>
                                                            <Checkbox 
                                                                checked={selectedPaymentIds.includes(p.id)} 
                                                                onCheckedChange={(checked) => setSelectedPaymentIds(prev => checked ? [...prev, p.id] : prev.filter(id => id !== p.id))}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-xs font-medium">{format(parseDateSafely(p.date) || new Date(), 'dd/MM/yy')}</TableCell>
                                                        <TableCell className="text-xs truncate max-w-[120px]">{p.description}</TableCell>
                                                        <TableCell className="text-right font-black text-green-700">{formatCurrency(p.amount, currency)}</TableCell>
                                                    </TableRow>
                                                )) : (
                                                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-12 text-xs italic">{t('owner_liquidations.add_dialog.no_income')}</TableCell></TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="font-black uppercase italic tracking-widest text-red-700 flex items-center gap-2 text-sm border-l-4 border-red-600 pl-3">
                                        {t('owner_liquidations.add_dialog.expenses')} ({currency})
                                    </h4>
                                    <div className="border rounded-2xl overflow-hidden bg-background shadow-sm">
                                        <Table>
                                            <TableHeader className="bg-muted/50">
                                                <TableRow>
                                                    <TableHead className="w-10"></TableHead>
                                                    <TableHead className="text-[10px] font-black uppercase tracking-widest">Fecha</TableHead>
                                                    <TableHead className="text-[10px] font-black uppercase tracking-widest">Descripción</TableHead>
                                                    <TableHead className="text-right text-[10px] font-black uppercase tracking-widest">Monto</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {pendingExpenses.length > 0 ? pendingExpenses.map(e => (
                                                    <TableRow key={e.id} className="hover:bg-muted/30">
                                                        <TableCell>
                                                            <Checkbox 
                                                                checked={selectedExpenseIds.includes(e.id)} 
                                                                onCheckedChange={(checked) => setSelectedExpenseIds(prev => checked ? [...prev, e.id] : prev.filter(id => id !== e.id))}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-xs font-medium">{format(parseDateSafely(e.date) || new Date(), 'dd/MM/yy')}</TableCell>
                                                        <TableCell className="text-xs truncate max-w-[120px]">{e.description}</TableCell>
                                                        <TableCell className="text-right font-black text-red-700">-{formatCurrency(e.originalUsdAmount || e.amount, currency)}</TableCell>
                                                    </TableRow>
                                                )) : (
                                                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-12 text-xs italic">{t('owner_liquidations.add_dialog.no_expenses')}</TableCell></TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bg-background p-8 rounded-[2rem] border shadow-md space-y-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-5">
                                <Calculator className="h-32 w-32" />
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center relative z-10">
                                <div>
                                    <p className="text-[10px] uppercase font-black text-muted-foreground mb-1 tracking-widest">{t('owner_liquidations.add_dialog.total_income')}</p>
                                    <p className="text-2xl font-black text-green-700">{formatCurrency(totalIncome, currency)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase font-black text-muted-foreground mb-1 tracking-widest">{t('owner_liquidations.add_dialog.total_expenses')}</p>
                                    <p className="text-2xl font-black text-red-700">{formatCurrency(totalExpenses, currency)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase font-black text-muted-foreground mb-1 tracking-widest">{t('owner_liquidations.add_dialog.commission')} ({property.managementCommission}%)</p>
                                    <p className="text-2xl font-black text-orange-600">{formatCurrency(commissionAmount, currency)}</p>
                                </div>
                                <div className="bg-primary text-white rounded-2xl p-4 shadow-xl scale-110">
                                    <p className="text-[10px] uppercase font-black mb-1 tracking-widest opacity-80">{t('owner_liquidations.add_dialog.net')}</p>
                                    <p className="text-2xl font-black">{formatCurrency(netToOwner, currency)}</p>
                                </div>
                            </div>
                            
                            <div className="pt-6 border-t relative z-10">
                                <Label htmlFor="notes" className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest">{t('owner_liquidations.add_dialog.notes')}</Label>
                                <Textarea 
                                    id="notes" 
                                    placeholder={t('owner_liquidations.add_dialog.notes_placeholder')} 
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="mt-2 min-h-[100px] bg-muted/20 border-dashed"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="p-6 bg-background border-t shrink-0">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending} className="font-bold uppercase text-[10px] tracking-widest h-11">{t('common.cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={isPending || (selectedPaymentIds.length === 0 && selectedExpenseIds.length === 0)} className="font-bold uppercase text-[10px] tracking-widest h-11 px-10 shadow-lg">
                        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {t('owner_liquidations.add_dialog.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
