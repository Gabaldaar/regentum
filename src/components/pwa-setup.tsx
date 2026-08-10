"use client";

import { useEffect, useState } from "react";
import { X, Download, Share, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const PwaSetup = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);

  useEffect(() => {
    // 1. Registro del Service Worker y detección de actualizaciones
    let handleControllerChange: () => void;
    let handleFocus: () => void;

    if (typeof window !== 'undefined' && "serviceWorker" in navigator) {
      const hasController = !!navigator.serviceWorker.controller;

      handleControllerChange = () => {
        if (hasController) {
          setShowUpdatePrompt(true);
        }
      };

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => {
          console.log("Regentum PWA: Service Worker activo en:", registration.scope);
          registration.update().catch(() => {});

          // Comprobar actualización al enfocar la pestaña
          handleFocus = () => {
            registration.update().catch(() => {});
          };
          window.addEventListener('focus', handleFocus);
        })
        .catch((error) => {
          console.error("Regentum PWA: Error en registro del SW:", error);
        });
    }

    // 2. Lógica para mostrar la invitación de instalación
    if (typeof window === 'undefined') return;

    // Verificar si el usuario ya descartó el aviso antes
    if (localStorage.getItem('pwa-prompt-dismissed') === 'true') {
      return;
    }

    // Verificar si ya está instalada (Standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    if (isStandalone) {
      return; // Ya está instalada
    }

    // Detección específica para iOS (ya que no soporta beforeinstallprompt de forma estándar)
    const ua = window.navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    if (isIOSDevice) {
      setIsIOS(true);
      // En iOS mostramos el aviso tras un par de segundos para no ser agresivos
      const timer = setTimeout(() => setShowPrompt(true), 2500);
      return () => {
        clearTimeout(timer);
        if ("serviceWorker" in navigator && handleControllerChange) {
          navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
        }
        if (handleFocus) {
          window.removeEventListener('focus', handleFocus);
        }
      };
    }

    // Manejo para Android / Escritorio (Chrome, Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Mostramos el banner
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      if (typeof window !== 'undefined') {
        if ("serviceWorker" in navigator && handleControllerChange) {
          navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
        }
        if (handleFocus) {
          window.removeEventListener('focus', handleFocus);
        }
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      }
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  // Priorizamos mostrar la actualización antes que la invitación a instalar
  const showInstallBanner = showPrompt && !showUpdatePrompt;

  return (
    <>
      {showInstallBanner && (
        <div className="fixed bottom-4 left-4 right-4 z-[9999] md:bottom-8 md:left-auto md:right-8 md:w-96 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-primary/95 text-primary-foreground backdrop-blur-md rounded-xl p-4 shadow-2xl border border-primary/20 flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="bg-background/20 p-2 rounded-lg">
                  <Download className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">Instalar Regentum</h3>
                  <p className="text-sm text-primary-foreground/80 leading-tight mt-0.5">
                    Acceso más rápido y notificaciones
                  </p>
                </div>
              </div>
              <button 
                onClick={handleDismiss} 
                className="p-1 -mr-1 hover:bg-background/20 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <div className="text-sm bg-background/10 rounded-lg p-3 flex flex-col gap-1.5 mt-1">
                <div className="flex items-center gap-2">
                  <Share className="w-4 h-4 flex-shrink-0" />
                  <span>Toca <strong>Compartir</strong> en la barra inferior</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 flex items-center justify-center font-bold bg-background/20 rounded text-[10px]">+</div>
                  <span>Selecciona <strong>Agregar a inicio</strong></span>
                </div>
              </div>
            ) : deferredPrompt ? (
              <Button 
                onClick={handleInstallClick} 
                variant="secondary" 
                className="w-full font-semibold shadow-sm mt-1"
              >
                Instalar Aplicación
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {showUpdatePrompt && (
        <div className="fixed bottom-4 left-4 right-4 z-[9999] md:bottom-8 md:left-auto md:right-8 md:w-96 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-emerald-600/95 text-white backdrop-blur-md rounded-xl p-4 shadow-2xl border border-emerald-500/20 flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg text-white">
                  <RefreshCw className="w-6 h-6 animate-spin" style={{ animationDuration: "3s" }} />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-white">Actualización disponible</h3>
                  <p className="text-sm text-white/80 leading-tight mt-0.5">
                    Una nueva versión de Regentum está lista.
                  </p>
                </div>
              </div>
            </div>
            <Button 
              onClick={() => window.location.reload()} 
              variant="secondary" 
              className="w-full font-semibold shadow-sm mt-1 bg-white text-emerald-700 hover:bg-white/90"
            >
              Actualizar ahora
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default PwaSetup;
