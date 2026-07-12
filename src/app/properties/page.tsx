'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Property, Booking, Contrato, PeriodoPago, Provider, getProperties, getBookings, getContratos, getPeriodosPago, getProviders } from "@/lib/data";
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Loader2, Banknote, History, AlertTriangle, Home, Upload } from "lucide-react";
import { parseDateSafely, cn } from "@/lib/utils";
import { startOfToday, endOfMonth, isBefore, isSameDay, addMonths, format } from 'date-fns';
import { es, enUS, ptBR } from 'date-fns/locale';
import { PropertyAddForm } from '@/components/property-add-form';
import { useTranslation } from "@/i18n/useTranslation";
import { useToast } from "@/components/ui/use-toast";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { Label } from '@/components/ui/label';
import { buttonVariants } from '@/components/ui/button';

const locales: Record<string, any> = { es, en: enUS, pt: ptBR };

interface PropertyWithFinancials extends Property {
    pendingBalances: Record<string, number>;
    nextAdjustmentDate?: Date | null;
}

export default function PropertiesPage() {
  const { user, appUser, orgId } = useAuth();
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const [properties, setProperties] = useState<PropertyWithFinancials[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const isPersonalFlavor = appUser?.appFlavor !== 'commercial';
  const currentLocale = locales[language] || es;

  const fetchData = useCallback(async () => {
    if (!user || !orgId) return;
    
    setLoading(true);
    try {
        const [allProperties, allBookings, allContratos, allPeriodos, allProviders] = await Promise.all([
            getProperties(orgId),
            getBookings(orgId),
            getContratos(orgId),
            getPeriodosPago(orgId),
            getProviders(orgId),
        ]);

        setProviders(allProviders);

        const today = startOfToday();
        const currentMonthEnd = endOfMonth(today);
        const nextMonthEnd = endOfMonth(addMonths(today, 1));

        const enrichedProperties = allProperties.map(property => {
            const balances: Record<string, number> = {};
            let nextAdj: Date | null = null;

            // 1. Calcular saldos de Reservas Temporarias
            allBookings.filter(b => b.propertyId === property.id).forEach(b => {
                const endDate = parseDateSafely(b.endDate);
                const isCancelled = b.status === 'cancelled';
                const isPast = endDate && isBefore(endDate, today) && !isSameDay(endDate, today);

                if (!isCancelled && !isPast && (b.balance || 0) > 0.01) {
                    const currency = b.currency || 'USD';
                    balances[currency] = (balances[currency] || 0) + b.balance;
                }
            });

            // 2. Calcular saldos de Contratos y buscar próximo ajuste
            allPeriodos.filter(pp => pp.propertyId === property.id).forEach(pp => {
                const dueDate = parseDateSafely(pp.fechaVencimiento);
                if (dueDate && (isBefore(dueDate, currentMonthEnd) || isSameDay(dueDate, currentMonthEnd))) {
                    const contrato = allContratos.find(c => c.id === pp.contratoId);
                    if (contrato && (contrato.status === 'active' || contrato.status === 'ended')) {
                        const currency = contrato.moneda || 'ARS';
                        const balance = (pp.montoAjustado || 0) - (pp.montoPagado || 0);
                        if (balance > 0.01) {
                            balances[currency] = (balances[currency] || 0) + balance;
                        }
                    }
                }

                if (pp.estado === 'pendiente_ajuste') {
                    const contrato = allContratos.find(c => c.id === pp.contratoId);
                    if (contrato && contrato.status === 'active') {
                        const startDate = parseDateSafely(pp.fechaDesde);
                        if (startDate && isBefore(startDate, nextMonthEnd)) {
                            if (!nextAdj || isBefore(startDate, nextAdj)) {
                                nextAdj = startDate;
                            }
                        }
                    }
                }
            });

            return {
                ...property,
                pendingBalances: balances,
                nextAdjustmentDate: nextAdj
            };
        }).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

        setProperties(enrichedProperties);
    } catch (err) {
        console.error("Error fetching properties data:", err);
    } finally {
        setLoading(false);
    }
  }, [user, orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCardHeroUpload = async (event: React.ChangeEvent<HTMLInputElement>, propertyId: string) => {
    const file = event.target.files?.[0];
    if (!file || !propertyId) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: t('common.error'), description: "La imagen no debe superar 2MB.", variant: "destructive" });
      return;
    }

    setUploadingId(propertyId);
    const storageRef = ref(storage, `property_images/${propertyId}/main_image.jpg`);

    try {
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'properties', propertyId), { imageUrl: url });
      toast({ title: t('common.success'), description: "Imagen actualizada correctamente." });
      fetchData();
    } catch (error) {
      console.error(error);
      toast({ title: t('common.error'), description: "No se pudo subir la imagen.", variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    try {
        return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'es-AR', {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 0
        }).format(amount);
    } catch (e) {
        return `${currency} ${Math.round(amount)}`;
    }
  };

  const renderSkeletons = () => (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(8)].map((_, i) => (
            <Card key={i} className="h-full overflow-hidden border-2 border-zinc-100">
                <Skeleton className="aspect-video w-full rounded-none" />
                <CardHeader className="p-4 space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardFooter className="p-3 border-t bg-muted/30">
                    <Skeleton className="h-5 w-full" />
                </CardFooter>
            </Card>
        ))}
    </div>
  );

  return (
    <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between space-y-2">
            <div>
                <h2 className="text-3xl font-bold tracking-tight text-primary">{t('navigation.properties')}</h2>
                <p className="text-muted-foreground">{t('properties.description')}</p>
            </div>
            <PropertyAddForm 
                providers={providers} 
                isPersonalFlavor={isPersonalFlavor} 
                onPropertyAdded={fetchData} 
            />
        </div>
        
        {loading && properties.length === 0 ? renderSkeletons() : properties.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {properties.map((property) => {
                    const hasPending = Object.keys(property.pendingBalances).length > 0;
                    const isCurrentlyUploading = uploadingId === property.id;
                    
                    return (
                        <Link href={`/properties/${property.id}`} key={property.id} className="group">
                            <Card className={cn(
                                "h-full overflow-hidden transition-all group-hover:shadow-lg hover:-translate-y-1 group-hover:border-primary/30 flex flex-col border-2",
                                hasPending ? "border-orange-200" : "border-zinc-200"
                            )}>
                                <CardHeader className="p-0 relative">
                                    <div className="relative aspect-video w-full overflow-hidden">
                                        {property.imageUrl ? (
                                            <Image
                                                src={property.imageUrl}
                                                alt={`Foto de ${property.name}`}
                                                fill
                                                className="rounded-t-lg object-cover transition-transform group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-muted flex flex-col items-center justify-center gap-2 rounded-t-lg relative">
                                                <Home className="h-10 w-10 text-muted-foreground opacity-20" />
                                                <div 
                                                    className="flex flex-col items-center gap-2 z-30" 
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Label 
                                                        htmlFor={`upload-card-${property.id}`} 
                                                        className={cn(
                                                            buttonVariants({ variant: 'outline', size: 'sm' }), 
                                                            "cursor-pointer font-bold uppercase text-[9px] tracking-widest h-8 bg-background shadow-sm hover:bg-primary hover:text-white transition-colors",
                                                            isCurrentlyUploading && "opacity-50 pointer-events-none"
                                                        )}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {isCurrentlyUploading ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Upload className="h-3 w-3 mr-1.5" />}
                                                        {t('properties.form.labels.upload_image')}
                                                    </Label>
                                                    <input 
                                                        id={`upload-card-${property.id}`} 
                                                        type="file" 
                                                        className="hidden" 
                                                        onChange={(e) => handleCardHeroUpload(e, property.id)} 
                                                        accept="image/png, image/jpeg, image/webp" 
                                                        disabled={isCurrentlyUploading} 
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {property.nextAdjustmentDate && (
                                        <div className="absolute top-2 right-2 bg-amber-500 text-white p-1.5 rounded-full shadow-md animate-pulse z-20">
                                            <History className="h-4 w-4" />
                                        </div>
                                    )}
                                </CardHeader>
                                <CardContent className="p-4 flex-grow">
                                    <CardTitle className="text-xl text-primary transition-colors group-hover:text-primary/80 font-bold">{property.name}</CardTitle>
                                    <CardDescription className="line-clamp-1 text-xs font-medium">{property.address}</CardDescription>
                                    
                                    {property.nextAdjustmentDate && (
                                        <p className="text-[10px] uppercase font-bold text-amber-600 mt-2 flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" />
                                            {t('properties.next_adjustment')} {format(property.nextAdjustmentDate, 'MMMM', { locale: currentLocale })}
                                        </p>
                                    )}
                                </CardContent>
                                <CardFooter className={cn(
                                    "p-3 border-t text-sm transition-colors",
                                    hasPending ? "bg-orange-50/10 group-hover:bg-orange-50/20" : "bg-muted/30 group-hover:bg-muted/50"
                                )}>
                                    {hasPending ? (
                                        <div className="w-full space-y-1">
                                            <div className="flex items-center gap-1.5 text-orange-600 font-bold text-[10px] uppercase mb-1">
                                                <Banknote className="h-3 w-3" />
                                                {t('properties.to_collect')}
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {Object.entries(property.pendingBalances).map(([curr, amount]) => (
                                                    <Badge key={curr} variant="default" className="bg-orange-600 h-5 text-[10px]">
                                                        {formatCurrency(amount, curr)}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-tight">{t('properties.up_to_date')}</span>
                                    )}
                                </CardFooter>
                            </Card>
                        </Link>
                    )
                })}
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed rounded-3xl bg-muted/20">
                <Home className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-bold text-muted-foreground">{t('properties.no_properties')}</h3>
                <p className="text-sm text-muted-foreground/60 max-w-xs">{t('common.empty_states.properties_desc')}</p>
            </div>
        )}
    </div>
  );
}
