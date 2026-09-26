
'use client';

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
    CircleHelp, 
    Rocket, 
    Settings, 
    Building2, 
    Calendar, 
    Wrench, 
    BarChart3, 
    Share2,
    FileDown,
    ScrollText,
    ClipboardList,
    Copy,
    Notebook,
    Menu,
    Printer,
    ChevronRight,
    ChevronLeft,
    FileText,
    ShieldCheck,
    CheckCircle2,
    Smartphone,
    Check,
    Info,
    History,
    PenLine,
    Sun,
    Moon,
    Languages,
    ListFilter,
    CheckCircle,
    PlusCircle,
    Banknote,
    Activity,
    ShieldAlert,
    Clock,
    Tag,
    Calculator,
    RefreshCw,
    TrendingUp,
    CalendarX,
    Landmark,
    Search,
    AlertTriangle,
    Users
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useTranslation } from "@/i18n/useTranslation";
import { APP_CONFIG } from "@/lib/app-config";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { BrandingSettings } from "@/lib/data";
import Image from "next/image";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ChapterContent {
    id: string;
    title: string;
    icon: any;
    color: string;
}

export default function HelpPage() {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { orgId } = useAuth();
    const [branding, setBranding] = useState<BrandingSettings | null>(null);
    const [activeChapter, setActiveChapter] = useState('c1');
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    useEffect(() => {
        if (!orgId) return;
        const unsub = onSnapshot(doc(db, 'settings', `branding_${orgId}`), (snap) => {
            if (snap.exists()) setBranding(snap.data() as BrandingSettings);
        });
        return () => unsub();
    }, [orgId]);

    const appName = branding?.appName || APP_CONFIG.name;
    const logoSrc = branding?.logoDocUrl || APP_CONFIG.logo.contract;

    const adminContact = {
        phone: '', 
        email: APP_CONFIG.contact.email // Usamos el correo genérico para evitar conflictos con el escáner de Netlify
    };

    const handleShare = async () => {
        const url = window.location.origin;
        try {
            await navigator.clipboard.writeText(url);
            toast({ title: t('common.success'), description: t('common.copy_link_success') });
            if (navigator.share) {
                await navigator.share({ title: appName, url });
            }
        } catch (err) {}
    };

    const handleStartTour = () => {
        window.dispatchEvent(new CustomEvent('start-product-tour'));
    };

    const markers = [
        { code: "{{inquilino.nombre}}", desc: t('common.placeholders_labels.tenant_name') },
        { code: "{{inquilino.dni}}", desc: t('common.placeholders_labels.tenant_id') },
        { code: "{{inquilino.direccion}}", desc: t('common.placeholders_labels.tenant_address') },
        { code: "{{propiedad.nombre}}", desc: t('common.placeholders_labels.property_name') },
        { code: "{{propiedad.direccion}}", desc: t('common.placeholders_labels.property_address') },
        { code: "{{fechaCheckIn}}", desc: t('common.placeholders_labels.checkin_date') },
        { code: "{{fechaCheckOut}}", desc: t('common.placeholders_labels.checkout_date') },
        { code: "{{monto}}", desc: t('common.placeholders_labels.booking_amount') },
        { code: "{{monedaNombre}}", desc: t('common.placeholders_labels.currency_name') },
        { code: "{{montoEnLetras}}", desc: t('common.placeholders_labels.amount_words') },
        { code: "{{montoGarantia}}", desc: t('common.placeholders_labels.guarantee_amount') },
        { code: "{{propietario.nombre}}", desc: t('common.placeholders_labels.owner_name') },
        { code: "{{propietario.dni}}", desc: t('common.placeholders_labels.owner_id') },
        { code: "{{fechaActual}}", desc: t('common.placeholders_labels.current_date') },
    ];

    const chapters: ChapterContent[] = [
        { id: 'c1', title: t('help.manual_chapters.c1.title'), icon: Rocket, color: "text-blue-600" },
        { id: 'c2', title: t('help.manual_chapters.c2.title'), icon: Settings, color: "text-zinc-800" },
        { id: 'c3', title: t('help.manual_chapters.c3.title'), icon: Building2, color: "text-green-600" },
        { id: 'c4', title: t('help.manual_chapters.c4.title'), icon: Calendar, color: "text-indigo-600" },
        { id: 'c5', title: t('help.manual_chapters.c5.title'), icon: FileText, color: "text-orange-600" },
        { id: 'c6', title: t('help.manual_chapters.c6.title'), icon: RefreshCw, color: "text-purple-600" },
        { id: 'c7', title: t('help.manual_chapters.c7.title'), icon: Banknote, color: "text-teal-600" },
        { id: 'c8', title: t('help.manual_chapters.c8.title'), icon: PenLine, color: "text-red-600" },
    ];

    const currentChapter = chapters.find(c => c.id === activeChapter) || chapters[0];
    const currentIndex = chapters.findIndex(c => c.id === activeChapter);
    const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
    const nextChapter = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

    const selectChapter = (id: string) => {
        setActiveChapter(id);
        setIsSheetOpen(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20 px-2 sm:px-4">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-6 print:hidden">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-primary">{t('help.title')}</h2>
                    <p className="text-muted-foreground">{t('help.description').replace('{{name}}', appName)}</p>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <Button variant="default" size="sm" asChild className="flex-1 sm:flex-none gap-2 font-bold uppercase text-[10px] tracking-widest h-10 shadow-sm bg-primary hover:bg-primary/90 text-primary-foreground">
                        <a href="/Manual_de_Usuario_Regentum.pdf" download="Manual_de_Usuario_Regentum.pdf" target="_blank" rel="noopener noreferrer">
                            <FileDown className="h-4 w-4" /> Descargar Manual PDF
                        </a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleStartTour} className="flex-1 sm:flex-none gap-2 font-bold uppercase text-[10px] tracking-widest border-primary/20 hover:bg-primary/5 h-10">
                        <Rocket className="h-4 w-4" /> {t('help.view_tour')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleShare} className="flex-1 sm:flex-none gap-2 font-bold uppercase text-[10px] tracking-widest border-primary/20 hover:bg-primary/5 h-10">
                        <Share2 className="h-4 w-4" /> {t('help.share_app')}
                    </Button>
                </div>
            </header>

            <Tabs defaultValue="manual" className="space-y-6">
                <TabsList className="grid w-full h-auto p-1 bg-muted/50 rounded-xl grid-cols-2 md:grid-cols-4 print:hidden">
                    <TabsTrigger value="manual" className="py-2.5 font-bold gap-2">
                        <Notebook className="h-4 w-4" /> {t('help.tabs.manual')}
                    </TabsTrigger>
                    <TabsTrigger value="markers" className="py-2.5 font-bold gap-2">
                        <ScrollText className="h-4 w-4" /> {t('help.tabs.markers')}
                    </TabsTrigger>
                    <TabsTrigger value="owners" className="py-2.5 font-bold gap-2">
                        <ShieldCheck className="h-4 w-4" /> {t('help.tabs.owners')}
                    </TabsTrigger>
                    <TabsTrigger value="faq" className="py-2.5 font-bold gap-2">
                        <ClipboardList className="h-4 w-4" /> {t('help.tabs.faq')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="manual" className="animate-in fade-in duration-500 outline-none">
                    <div className="flex flex-col lg:grid lg:grid-cols-[280px_1fr] gap-8 items-start">
                        
                        <div className="w-full lg:sticky lg:top-20 space-y-4 print:hidden">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-4">Capítulos del Manual</h4>
                            
                            <div className="hidden lg:grid gap-1">
                                {chapters.map((chap) => (
                                    <button
                                        key={chap.id}
                                        onClick={() => selectChapter(chap.id)}
                                        className={cn(
                                            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left text-sm font-bold border-2",
                                            activeChapter === chap.id 
                                                ? "bg-primary text-white border-primary shadow-lg scale-[1.02]" 
                                                : "bg-background text-muted-foreground border-transparent hover:border-primary/20 hover:bg-primary/5"
                                        )}
                                    >
                                        <chap.icon className={cn("h-4 w-4", activeChapter === chap.id ? "text-white" : chap.color)} />
                                        {chap.title}
                                    </button>
                                ))}
                            </div>

                            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-2 hidden lg:block">
                                <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                                    <FileDown className="h-4 w-4" /> Manual en PDF
                                </p>
                                <p className="text-[10px] text-muted-foreground leading-snug">
                                    Descarga la versión completa para leerla offline o imprimirla.
                                </p>
                                <Button variant="outline" size="sm" asChild className="w-full gap-2 font-bold uppercase text-[10px] tracking-wider border-primary/30 hover:bg-primary hover:text-white h-9">
                                    <a href="/Manual_de_Usuario_Regentum.pdf" download="Manual_de_Usuario_Regentum.pdf" target="_blank" rel="noopener noreferrer">
                                        <FileDown className="h-3.5 w-3.5" /> Descargar PDF
                                    </a>
                                </Button>
                            </div>

                            <div className="lg:hidden w-full">
                                <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                                    <SheetTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between h-12 rounded-xl border-2">
                                            <div className="flex items-center gap-2 font-bold">
                                                <Menu className="h-4 w-4" /> {currentChapter.title}
                                            </div>
                                            <ChevronRight className="h-4 w-4 opacity-40" />
                                        </Button>
                                    </SheetTrigger>
                                    <SheetContent side="left" className="w-[300px]">
                                        <SheetHeader className="mb-6">
                                            <SheetTitle className="text-xl font-black uppercase italic tracking-tighter text-primary">Contenidos</SheetTitle>
                                        </SheetHeader>
                                        <div className="grid gap-2">
                                            {chapters.map((chap) => (
                                                <Button
                                                    key={chap.id}
                                                    variant={activeChapter === chap.id ? "default" : "ghost"}
                                                    className={cn("justify-start h-12 rounded-xl gap-3 font-bold", activeChapter === chap.id && "shadow-lg")}
                                                    onClick={() => selectChapter(chap.id)}
                                                >
                                                    <chap.icon className={cn("h-4 w-4", activeChapter === chap.id ? "text-white" : chap.color)} />
                                                    {chap.title}
                                                </Button>
                                            ))}
                                        </div>
                                    </SheetContent>
                                </Sheet>
                            </div>
                        </div>

                        <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className={cn(
                                "flex flex-col sm:flex-row items-center justify-between p-6 sm:p-8 rounded-3xl border-b-8 shadow-xl",
                                currentChapter.color.replace('text-', 'bg-').replace('600', '50').replace('800', '50'),
                                currentChapter.color.replace('text-', 'border-')
                            )}>
                                <div className="flex items-center gap-5">
                                    <div className={cn(
                                        "p-4 rounded-2xl text-white shadow-2xl scale-110",
                                        currentChapter.color.replace('text-', 'bg-')
                                    )}>
                                        <currentChapter.icon className="h-8 w-8" />
                                    </div>
                                    <div>
                                        <h3 className={cn("text-2xl sm:text-3xl font-black uppercase italic tracking-tighter leading-none", currentChapter.color)}>
                                            {currentChapter.title}
                                        </h3>
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] mt-2 opacity-60">
                                            {appName} {t('help.manual_chapters.manual_ops')}
                                        </p>
                                    </div>
                                </div>
                                <div className="hidden sm:block relative w-32 h-12 opacity-40 grayscale hover:grayscale-0 transition-all">
                                    <Image src={logoSrc} alt={appName} fill className="object-contain" />
                                </div>
                            </div>

                            <Card className="rounded-3xl border-none shadow-2xl bg-background overflow-hidden min-h-[400px]">
                                <CardContent className="p-8 sm:p-12">
                                    <div className="prose prose-blue max-w-none">
                                        {activeChapter === 'c1' && (
                                            <div className="space-y-12">
                                                <section className="space-y-4">
                                                    <p className="text-xl leading-relaxed text-muted-foreground italic border-l-4 pl-6">
                                                        {t('help.manual_chapters.c1.intro')}
                                                    </p>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                                                        {t('help.manual_chapters.c1.features_title')}
                                                    </h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {[1, 2, 3, 4].map(i => (
                                                            <div key={i} className="flex items-start gap-3 p-4 bg-muted/30 rounded-2xl border">
                                                                <Check className="h-4 w-4 text-green-600 mt-1 shrink-0" />
                                                                <p className="text-sm font-bold leading-snug">{t(`help.manual_chapters.c1.feature_${i}`)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                                        <Smartphone className="h-5 w-5 text-blue-600" />
                                                        {t('help.manual_chapters.c1.install_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c1.install_desc')}</p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                                        {['android', 'ios', 'pc'].map(platform => (
                                                            <div key={platform} className="space-y-3 p-5 rounded-2xl border-2 border-dashed bg-background">
                                                                <p className="font-black uppercase text-[10px] tracking-widest text-primary">{t(`help.manual_chapters.c1.${platform}_title`)}</p>
                                                                <p className="text-xs font-medium leading-relaxed">{t(`help.manual_chapters.c1.${platform}_step`)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </section>

                                                <Alert className="bg-primary/5 border-primary/20 rounded-2xl p-6">
                                                    <Info className="h-5 w-5 text-primary" />
                                                    <AlertDescription className="text-sm font-bold text-primary italic">
                                                        {t('help.manual_chapters.c1.tip')}
                                                    </AlertDescription>
                                                </Alert>
                                            </div>
                                        )}

                                        {activeChapter === 'c2' && (
                                            <div className="space-y-12">
                                                <section className="space-y-4">
                                                    <p className="text-xl leading-relaxed text-muted-foreground italic border-l-4 pl-6">
                                                        {t('help.manual_chapters.c2.intro')}
                                                    </p>
                                                </section>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                    <section className="space-y-4 p-6 bg-muted/20 rounded-3xl border border-dashed">
                                                        <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                                            <Sun className="h-5 w-5 text-orange-500" />
                                                            {t('help.manual_chapters.c2.style_title')}
                                                        </h4>
                                                        <p className="text-sm text-muted-foreground">{t('help.manual_chapters.c2.style_desc')}</p>
                                                        <div className="flex gap-2">
                                                            <Badge variant="outline" className="gap-1"><Languages className="h-3 w-3" /> {t('navigation.language')}</Badge>
                                                            <Badge variant="outline" className="gap-1"><Moon className="h-3 w-3" /> {t('navigation.theme_dark')}</Badge>
                                                        </div>
                                                    </section>

                                                    <section className="space-y-4 p-6 bg-primary/5 rounded-3xl border border-primary/10">
                                                        <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                                            <PenLine className="h-5 w-5 text-primary" />
                                                            {t('help.manual_chapters.c2.branding_title')}
                                                        </h4>
                                                        <p className="text-sm text-muted-foreground">{t('help.manual_chapters.c2.branding_desc')}</p>
                                                    </section>
                                                </div>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                                        <ShieldCheck className="h-5 w-5 text-green-600" />
                                                        {t('help.manual_chapters.c2.team_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c2.team_desc')}</p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        <div className="p-4 bg-background border rounded-2xl shadow-sm">
                                                            <p className="font-black text-xs text-primary uppercase mb-1">{t('providers.roles.admin')}</p>
                                                            <p className="text-xs text-muted-foreground">{t('help.manual_chapters.c2.admin_desc')}</p>
                                                        </div>
                                                        <div className="p-4 bg-background border rounded-2xl shadow-sm">
                                                            <p className="font-black text-xs text-orange-600 uppercase mb-1">{t('providers.roles.staff')}</p>
                                                            <p className="text-xs text-muted-foreground">{t('help.manual_chapters.c2.staff_desc')}</p>
                                                        </div>
                                                    </div>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                                        <Banknote className="h-5 w-5 text-green-700" />
                                                        {t('help.manual_chapters.c2.currency_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c2.currency_desc')}</p>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                                        <ListFilter className="h-5 w-5 text-blue-600" />
                                                        {t('help.manual_chapters.c2.lists_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c2.lists_desc')}</p>
                                                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none pl-0">
                                                        <li className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl"><CheckCircle2 className="h-4 w-4 text-green-600" /> <span className="text-xs font-bold">{t('help.manual_chapters.c2.list_origin')}</span></li>
                                                        <li className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl"><CheckCircle2 className="h-4 w-4 text-green-600" /> <span className="text-xs font-bold">{t('help.manual_chapters.c2.list_task')}</span></li>
                                                        <li className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl"><CheckCircle2 className="h-4 w-4 text-green-600" /> <span className="text-xs font-bold">{t('help.manual_chapters.c2.list_exp')}</span></li>
                                                    </ul>
                                                </section>

                                                <Alert className="bg-primary/5 border-primary/20 rounded-2xl p-6">
                                                    <Info className="h-5 w-5 text-primary" />
                                                    <AlertDescription className="text-sm font-bold text-primary italic">
                                                        {t('help.manual_chapters.c2.tip')}
                                                    </AlertDescription>
                                                </Alert>
                                            </div>
                                        )}

                                        {activeChapter === 'c3' && (
                                            <div className="space-y-12">
                                                <section className="space-y-4">
                                                    <p className="text-xl leading-relaxed text-muted-foreground italic border-l-4 pl-6">
                                                        {t('help.manual_chapters.c3.intro')}
                                                    </p>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                                        <Building2 className="h-5 w-5 text-green-600" />
                                                        {t('help.manual_chapters.c3.properties_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c3.properties_desc')}</p>
                                                    <div className="grid grid-cols-1 gap-4">
                                                        {[1, 2, 3].map(i => (
                                                            <div key={i} className="flex items-start gap-3 p-4 bg-muted/30 rounded-2xl border">
                                                                <Check className="h-4 w-4 text-green-600 mt-1 shrink-0" />
                                                                <p className="text-sm font-bold leading-snug">{t(`help.manual_chapters.c3.prop_item_${i}`)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                                        <ScrollText className="h-5 w-5 text-green-600" />
                                                        {t('help.manual_chapters.c3.contracts_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c3.contracts_desc')}</p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        {[1, 2].map(i => (
                                                            <div key={i} className="p-4 bg-background border rounded-2xl shadow-sm">
                                                                <p className="text-sm font-bold leading-snug">{t(`help.manual_chapters.c3.contract_item_${i}`)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                                        <Users className="h-5 w-5 text-green-600" />
                                                        {t('help.manual_chapters.c3.tenants_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c3.tenants_desc')}</p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        {[1, 2].map(i => (
                                                            <div key={i} className="p-4 bg-muted/30 border rounded-2xl">
                                                                <p className="text-sm font-bold leading-snug">{t(`help.manual_chapters.c3.tenant_item_${i}`)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </section>

                                                <Alert className="bg-primary/5 border-primary/20 rounded-2xl p-6">
                                                    <Info className="h-5 w-5 text-primary" />
                                                    <AlertDescription className="text-sm font-bold text-primary italic">
                                                        {t('help.manual_chapters.c3.tip')}
                                                    </AlertDescription>
                                                </Alert>
                                            </div>
                                        )}

                                        {activeChapter === 'c4' && (
                                            <div className="space-y-12">
                                                <section className="space-y-4">
                                                    <p className="text-xl leading-relaxed text-muted-foreground italic border-l-4 pl-6">
                                                        {t('help.manual_chapters.c4.intro')}
                                                    </p>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                                        <PlusCircle className="h-5 w-5 text-indigo-600" />
                                                        {t('help.manual_chapters.c4.start_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c4.start_desc')}</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-2xl border">
                                                            <Check className="h-4 w-4 text-green-600 mt-1 shrink-0" />
                                                            <p className="text-sm font-bold leading-snug">{t('help.manual_chapters.c4.path_property')}</p>
                                                        </div>
                                                        <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-2xl border">
                                                            <Check className="h-4 w-4 text-green-600 mt-1 shrink-0" />
                                                            <p className="text-sm font-bold leading-snug">{t('help.manual_chapters.c4.path_quick')}</p>
                                                        </div>
                                                    </div>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                                        <Calendar className="h-5 w-5 text-indigo-600" />
                                                        {t('help.manual_chapters.c4.process_title')}
                                                    </h4>
                                                    <div className="grid grid-cols-1 gap-4">
                                                        {[1, 2, 3].map(i => (
                                                            <div key={i} className="flex items-start gap-3 p-4 bg-background border rounded-2xl shadow-sm">
                                                                <div className="bg-indigo-600 text-white h-6 w-6 rounded-full flex items-center justify-center shrink-0 font-black text-xs">{i}</div>
                                                                <p className="text-sm font-bold leading-snug">{t(`help.manual_chapters.c4.process_item_${i}`)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </section>

                                                <section className="space-y-6 p-6 rounded-3xl bg-indigo-50 border-2 border-dashed border-indigo-200">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3 text-indigo-700">
                                                        <Search className="h-5 w-5" />
                                                        {t('help.manual_chapters.c4.searcher_title')}
                                                    </h4>
                                                    <p className="text-sm text-indigo-900 font-medium leading-relaxed">{t('help.manual_chapters.c4.searcher_desc')}</p>
                                                </section>

                                                <Alert className="bg-primary/5 border-primary/20 rounded-2xl p-6">
                                                    <Info className="h-5 w-5 text-primary" />
                                                    <AlertDescription className="text-sm font-bold text-primary italic">
                                                        {t('help.manual_chapters.c4.tip')}
                                                    </AlertDescription>
                                                </Alert>
                                            </div>
                                        )}

                                        {activeChapter === 'c5' && (
                                            <div className="space-y-12">
                                                <section className="space-y-4">
                                                    <p className="text-xl leading-relaxed text-muted-foreground italic border-l-4 pl-6">
                                                        {t('help.manual_chapters.c5.intro')}
                                                    </p>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3 text-orange-700">
                                                        <PlusCircle className="h-5 w-5" />
                                                        {t('help.manual_chapters.c5.start_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c5.start_desc')}</p>
                                                    <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-2xl border">
                                                        <Check className="h-4 w-4 text-green-600 mt-1 shrink-0" />
                                                        <p className="text-sm font-bold leading-snug">{t('help.manual_chapters.c5.start_step')}</p>
                                                    </div>
                                                </section>

                                                <section className="space-y-6">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        <div className="p-6 bg-background border rounded-2xl shadow-sm space-y-3">
                                                            <h4 className="text-sm font-black uppercase flex items-center gap-2 text-orange-600">
                                                                <History className="h-4 w-4" /> {t('help.manual_chapters.c5.plan_title')}
                                                            </h4>
                                                            <p className="text-sm text-muted-foreground leading-relaxed">{t('help.manual_chapters.c5.plan_desc')}</p>
                                                        </div>
                                                        <div className="p-6 bg-background border rounded-2xl shadow-sm space-y-3">
                                                            <h4 className="text-sm font-black uppercase flex items-center gap-2 text-orange-600">
                                                                <Banknote className="h-4 w-4" /> {t('help.manual_chapters.c5.tracking_title')}
                                                            </h4>
                                                            <p className="text-sm text-muted-foreground leading-relaxed">{t('help.manual_chapters.c5.tracking_desc')}</p>
                                                        </div>
                                                    </div>
                                                </section>

                                                <section className="space-y-6 p-6 rounded-3xl bg-orange-50/50 border-2 border-dashed border-orange-200">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3 text-orange-700">
                                                        <TrendingUp className="h-5 w-5" />
                                                        {t('help.manual_chapters.c5.adjustment_title')}
                                                    </h4>
                                                    <p className="text-sm text-orange-900 font-medium leading-relaxed">{t('help.manual_chapters.c5.adjustment_desc')}</p>
                                                </section>

                                                <Alert className="bg-primary/5 border-primary/20 rounded-2xl p-6">
                                                    <Info className="h-5 w-5 text-primary" />
                                                    <AlertDescription className="text-sm font-bold text-primary italic">
                                                        {t('help.manual_chapters.c5.tip')}
                                                    </AlertDescription>
                                                </Alert>
                                            </div>
                                        )}

                                        {activeChapter === 'c6' && (
                                            <div className="space-y-12">
                                                <section className="space-y-4">
                                                    <p className="text-xl leading-relaxed text-muted-foreground italic border-l-4 pl-6">
                                                        {t('help.manual_chapters.c6.intro')}
                                                    </p>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3 text-purple-700">
                                                        <RefreshCw className="h-5 w-5" />
                                                        {t('help.manual_chapters.c6.sync_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c6.sync_desc')}</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="p-4 bg-muted/30 rounded-2xl border flex items-start gap-3">
                                                            <div className="bg-purple-600 text-white h-5 w-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold">1</div>
                                                            <p className="text-sm font-medium">{t('help.manual_chapters.c6.sync_path')}</p>
                                                        </div>
                                                        <div className="p-4 bg-muted/30 rounded-2xl border flex items-start gap-3">
                                                            <div className="bg-purple-600 text-white h-5 w-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold">2</div>
                                                            <p className="text-sm font-medium">{t('help.manual_chapters.c6.sync_action')}</p>
                                                        </div>
                                                    </div>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3 text-purple-700">
                                                        <Activity className="h-5 w-5" />
                                                        {t('help.manual_chapters.c6.external_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c6.external_desc')}</p>
                                                    <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 list-none pl-0">
                                                        <li className="flex flex-col gap-2 p-4 bg-background border rounded-2xl shadow-sm text-xs font-bold italic">
                                                            <span className="text-primary uppercase tracking-widest text-[9px]">Google</span>
                                                            {t('help.manual_chapters.c6.external_google')}
                                                        </li>
                                                        <li className="flex flex-col gap-2 p-4 bg-background border rounded-2xl shadow-sm text-xs font-bold italic">
                                                            <span className="text-red-500 uppercase tracking-widest text-[9px]">Airbnb</span>
                                                            {t('help.manual_chapters.c6.external_airbnb')}
                                                        </li>
                                                        <li className="flex flex-col gap-2 p-4 bg-background border rounded-2xl shadow-sm text-xs font-bold italic">
                                                            <span className="text-blue-600 uppercase tracking-widest text-[9px]">Booking</span>
                                                            {t('help.manual_chapters.c6.external_booking')}
                                                        </li>
                                                    </ul>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3 text-purple-700">
                                                        <CalendarX className="h-5 w-5" />
                                                        {t('help.manual_chapters.c6.blocks_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c6.blocks_desc')}</p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        <div className="p-4 bg-muted/30 border-2 border-dashed rounded-2xl flex items-center gap-3">
                                                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                                                            <p className="text-sm font-bold">{t('help.manual_chapters.c6.blocks_path')}</p>
                                                        </div>
                                                        <div className="p-4 bg-muted/30 border-2 border-dashed rounded-2xl flex items-center gap-3">
                                                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                                                            <p className="text-sm font-bold">{t('help.manual_chapters.c6.blocks_action')}</p>
                                                        </div>
                                                    </div>
                                                </section>

                                                <Alert className="bg-primary/5 border-primary/20 rounded-2xl p-6">
                                                    <Info className="h-5 w-5 text-primary" />
                                                    <AlertDescription className="text-sm font-bold text-primary italic">
                                                        {t('help.manual_chapters.c6.tip')}
                                                    </AlertDescription>
                                                </Alert>
                                            </div>
                                        )}
                                        
                                        {activeChapter === 'c7' && (
                                            <div className="space-y-12">
                                                <section className="space-y-4">
                                                    <p className="text-xl leading-relaxed text-muted-foreground italic border-l-4 pl-6">
                                                        {t('help.manual_chapters.c7.intro')}
                                                    </p>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3 text-teal-700">
                                                        <Landmark className="h-5 w-5" />
                                                        {t('help.manual_chapters.c7.payments_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c7.payments_desc')}</p>
                                                    <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-2xl border">
                                                        <Check className="h-4 w-4 text-green-600 mt-1 shrink-0" />
                                                        <p className="text-sm font-bold leading-snug">{t('help.manual_chapters.c7.payments_step')}</p>
                                                    </div>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3 text-teal-700">
                                                        <AlertTriangle className="h-5 w-5" />
                                                        {t('help.manual_chapters.c7.debt_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c7.debt_desc')}</p>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3 text-teal-700">
                                                        <BarChart3 className="h-5 w-5" />
                                                        {t('help.manual_chapters.c7.reports_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c7.reports_desc')}</p>
                                                </section>

                                                <Alert className="bg-primary/5 border-primary/20 rounded-2xl p-6">
                                                    <Info className="h-5 w-5 text-primary" />
                                                    <AlertDescription className="text-sm font-bold text-primary italic">
                                                        {t('help.manual_chapters.c7.tip')}
                                                    </AlertDescription>
                                                </Alert>
                                            </div>
                                        )}

                                        {activeChapter === 'c8' && (
                                            <div className="space-y-12">
                                                <section className="space-y-4">
                                                    <p className="text-xl leading-relaxed text-muted-foreground italic border-l-4 pl-6">
                                                        {t('help.manual_chapters.c8.intro')}
                                                    </p>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3 text-red-700">
                                                        <PenLine className="h-5 w-5" />
                                                        {t('help.manual_chapters.c8.signature_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c8.signature_desc')}</p>
                                                    <div className="grid grid-cols-1 gap-4">
                                                        {[1, 2, 3].map(i => (
                                                            <div key={i} className="flex items-start gap-4 p-4 bg-background border rounded-2xl shadow-sm">
                                                                <div className="bg-red-600 text-white h-6 w-6 rounded-full flex items-center justify-center shrink-0 font-black text-xs">{i}</div>
                                                                <p className="text-sm font-bold leading-snug">{t(`help.manual_chapters.c8.sig_step_${i}`)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3 text-red-700">
                                                        <ShieldCheck className="h-5 w-5" />
                                                        {t('help.manual_chapters.c8.pdf_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c8.pdf_desc')}</p>
                                                    <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-2xl border">
                                                        <Check className="h-4 w-4 text-green-600 mt-1 shrink-0" />
                                                        <p className="text-sm font-bold leading-snug">{t('help.manual_chapters.c8.pdf_step')}</p>
                                                    </div>
                                                </section>

                                                <section className="space-y-6">
                                                    <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-3 text-red-700">
                                                        <ScrollText className="h-5 w-5" />
                                                        {t('help.manual_chapters.c8.owner_liq_title')}
                                                    </h4>
                                                    <p className="text-muted-foreground">{t('help.manual_chapters.c8.owner_liq_desc')}</p>
                                                    <div className="grid grid-cols-1 gap-4">
                                                        {[1, 2, 3].map(i => (
                                                            <div key={i} className="flex items-start gap-4 p-4 bg-background border rounded-2xl shadow-sm">
                                                                <div className="bg-red-600 text-white h-6 w-6 rounded-full flex items-center justify-center shrink-0 font-black text-xs">{i}</div>
                                                                <p className="text-sm font-bold leading-snug">{t(`help.manual_chapters.c8.liq_step_${i}`)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </section>

                                                <Alert className="bg-primary/5 border-primary/20 rounded-2xl p-6">
                                                    <Info className="h-5 w-5 text-primary" />
                                                    <AlertDescription className="text-sm font-bold text-primary italic">
                                                        {t('help.manual_chapters.c8.tip')}
                                                    </AlertDescription>
                                                </Alert>
                                            </div>
                                        )}

                                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-12 border-t mt-12 print:hidden">
                                            {prevChapter ? (
                                                <Button 
                                                    variant="outline" 
                                                    onClick={() => selectChapter(prevChapter.id)}
                                                    className="w-full sm:w-auto gap-2 font-bold uppercase text-[10px] tracking-widest h-12 rounded-xl"
                                                >
                                                    <ChevronLeft className="h-4 w-4" />
                                                    {t('common.back')}: {prevChapter.title}
                                                </Button>
                                            ) : <div className="hidden sm:block" />}

                                            {nextChapter ? (
                                                <Button 
                                                    onClick={() => selectChapter(nextChapter.id)}
                                                    className="w-full sm:w-auto gap-2 font-bold uppercase text-[10px] tracking-widest h-12 rounded-xl shadow-lg"
                                                >
                                                    {t('common.next')}: {nextChapter.title}
                                                    <ChevronRight className="h-4 w-4" />
                                                </Button>
                                            ) : <div className="hidden sm:block" />}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="hidden print:flex mt-20 pt-8 border-t flex flex-col items-center gap-2 opacity-50">
                                <div className="relative w-32 h-8 grayscale">
                                    <Image src={logoSrc} alt={appName} fill className="object-contain" />
                                </div>
                                <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">
                                    {t('owner_portal.messages.auto_generated').replace('{{name}}', appName)}
                                </p>
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="markers" className="animate-in fade-in duration-500">
                    <div className="p-6 bg-zinc-800 text-white rounded-3xl border-b-8 border-zinc-900 shadow-xl mb-6 flex items-center justify-between">
                         <div className="flex items-center gap-5">
                            <div className="p-4 rounded-2xl bg-zinc-700 text-white shadow-2xl">
                                <ScrollText className="h-8 w-8" />
                            </div>
                            <div>
                                <h3 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter leading-none">
                                    {t('help.markers.title')}
                                </h3>
                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em] mt-2 opacity-60">
                                    {t('help.markers.desc')}
                                </p>
                            </div>
                        </div>
                    </div>
                    <Card className="shadow-2xl border-none rounded-3xl overflow-hidden">
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left border-collapse">
                                    <thead>
                                        <tr className="bg-muted/80 border-b">
                                            <th className="p-6 font-black uppercase text-[10px] tracking-widest text-muted-foreground w-1/3">Código (Tap para copiar)</th>
                                            <th className="p-6 font-black uppercase text-[10px] tracking-widest text-muted-foreground">Dato que representa</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {markers.map((marker) => (
                                            <tr key={marker.code} className="hover:bg-primary/5 transition-colors group">
                                                <td className="p-6">
                                                    <button 
                                                        onClick={() => { navigator.clipboard.writeText(marker.code); toast({ title: t('common.success'), description: t('common.copy_link_success') }); }}
                                                        className="font-mono text-primary font-bold flex items-center gap-3 hover:scale-105 transition-transform bg-primary/5 px-4 py-2 rounded-xl border border-primary/10 shadow-sm"
                                                    >
                                                        <Copy className="h-4 w-4" /> {marker.code}
                                                    </button>
                                                </td>
                                                <td className="p-6 text-muted-foreground font-bold text-base">
                                                    {marker.desc}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="owners" className="animate-in fade-in duration-500 space-y-6">
                     <div className="p-6 bg-teal-600 text-white rounded-3xl border-b-8 border-teal-700 shadow-xl mb-6 flex items-center justify-between">
                         <div className="flex items-center gap-5">
                            <div className="p-4 rounded-2xl bg-teal-500 text-white shadow-2xl">
                                <ShieldCheck className="h-8 w-8" />
                            </div>
                            <div>
                                <h3 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter leading-none">
                                    {t('owner_portal.title')}
                                </h3>
                                <p className="text-[10px] font-black text-teal-100 uppercase tracking-[0.3em] mt-2 opacity-60">
                                    {t('owner_portal.description')}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <Card className="shadow-2xl border-l-8 border-l-primary rounded-3xl overflow-hidden bg-white">
                            <CardHeader className="p-8">
                                <CardTitle className="flex items-center gap-3 text-primary text-2xl font-black uppercase italic tracking-tighter">
                                    <Users className="h-8 w-8" />
                                    {t('help.owners.access_title')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-8 pt-0 space-y-6 text-base leading-relaxed">
                                <p className="font-bold text-foreground text-lg">{t('help.owners.access_desc')}</p>
                                <ol className="space-y-4">
                                    <li className="flex gap-4 items-start"><span className="bg-primary text-white h-7 w-7 rounded-full flex items-center justify-center shrink-0 font-black text-xs">1</span> <p className="font-medium text-muted-foreground">{t('help.owners.access_step1')}</p></li>
                                    <li className="flex gap-4 items-start"><span className="bg-primary text-white h-7 w-7 rounded-full flex items-center justify-center shrink-0 font-black text-xs">2</span> <p className="font-medium text-muted-foreground">{t('help.owners.access_step2')}</p></li>
                                    <li className="flex gap-4 items-start"><span className="bg-primary text-white h-7 w-7 rounded-full flex items-center justify-center shrink-0 font-black text-xs">3</span> <p className="font-medium text-muted-foreground">{t('help.owners.access_step3')}</p></li>
                                </ol>
                            </CardContent>
                        </Card>
                        
                        <Card className="shadow-2xl rounded-3xl border-none bg-gradient-to-br from-teal-600 to-teal-700 text-white">
                            <CardHeader className="p-8">
                                <CardTitle className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-3">
                                    <ShieldCheck className="h-8 w-8" />
                                    {t('help.owners.functions_title')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-8 pt-0 space-y-8">
                                <div className="flex items-start gap-4 p-4 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20">
                                    <CheckCircle className="h-6 w-6 shrink-0" />
                                    <p className="font-bold">{t('help.owners.func1')}</p>
                                </div>
                                <div className="flex items-start gap-4 p-4 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20">
                                    <CheckCircle className="h-6 w-6 shrink-0" />
                                    <p className="font-bold">{t('help.owners.func2')}</p>
                                </div>
                                <div className="flex items-start gap-4 p-4 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20">
                                    <CheckCircle className="h-6 w-6 shrink-0" />
                                    <p className="font-bold">{t('help.owners.func3')}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="faq" className="animate-in fade-in duration-500">
                    <div className="p-6 bg-zinc-700 text-white rounded-3xl border-b-8 border-zinc-800 shadow-xl mb-6 flex items-center justify-between">
                         <div className="flex items-center gap-5">
                            <div className="p-4 rounded-2xl bg-zinc-600 text-white shadow-2xl">
                                <CircleHelp className="h-8 w-8" />
                            </div>
                            <div>
                                <h3 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter leading-none">
                                    {t('help.faq.title')}
                                </h3>
                                <p className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.3em] mt-2 opacity-60">
                                    {t('help.faq.subtitle')}
                                </p>
                            </div>
                        </div>
                    </div>
                    <Card className="shadow-2xl border-none rounded-3xl overflow-hidden">
                        <CardHeader className="bg-zinc-800 text-white p-8">
                            <CardTitle className="text-2xl font-black uppercase italic tracking-tighter">{t('help.faq.title')}</CardTitle>
                            <CardDescription className="text-zinc-400 font-medium">{t('help.faq.subtitle')}</CardDescription>
                        </CardHeader>
                        <CardContent className="p-8">
                            <div className="grid gap-4">
                                {[
                                    { q: t('help.faq.q1'), a: t('help.faq.a1') },
                                    { q: t('help.faq.q2'), a: t('help.faq.a2') },
                                    { q: t('help.faq.q3'), a: t('help.faq.a3') },
                                    { q: t('help.faq.q4'), a: t('help.faq.a4') },
                                    { q: t('help.faq.q5'), a: t('help.faq.a5') },
                                    { q: t('help.faq.q6'), a: t('help.faq.a6') },
                                    { q: t('help.faq.q7'), a: t('help.faq.a7') }
                                ].map((item, idx) => (
                                    <div key={idx} className="border-b pb-4 last:border-0">
                                        <h4 className="text-lg font-black hover:text-primary transition-colors uppercase italic mb-2">{item.q}</h4>
                                        <p className="text-muted-foreground text-sm leading-relaxed p-4 bg-muted/20 rounded-xl">{item.a}</p>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
