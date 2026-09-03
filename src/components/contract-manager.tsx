'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateBooking } from '@/lib/actions';
import { BookingWithDetails, ContractStatus } from '@/lib/data';
import { Loader2, FileDown, PenLine, FileText } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import { useToast } from './ui/use-toast';

interface ContractManagerProps {
  booking: BookingWithDetails;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onContractUpdated?: () => void;
  onSignatureClick?: (booking: BookingWithDetails) => void;
}

export function ContractManager({
  booking,
  isOpen,
  onOpenChange,
  onContractUpdated,
  onSignatureClick,
}: ContractManagerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<ContractStatus>(booking.contractStatus || 'not_sent');

  useEffect(() => {
    if (isOpen) {
      setStatus(booking.contractStatus || 'not_sent');
    }
  }, [isOpen, booking]);

  const handleSaveStatus = () => {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append('id', booking.id);
        formData.append('contractStatus', status);

        const result = await updateBooking({}, formData);
        if (result.success) {
          toast({ title: t('common.success'), description: 'Estado del contrato actualizado correctamente.' });
          onContractUpdated?.();
          onOpenChange(false);
        } else {
          toast({ variant: 'destructive', title: t('common.error'), description: result.message });
        }
      } catch (error) {
        console.error('Error updating contract status:', error);
        toast({ variant: 'destructive', title: t('common.error'), description: 'No se pudo actualizar el estado del contrato.' });
      }
    });
  };

  const handleOpenPdf = () => {
    window.open(`/contract?id=${booking.id}`, '_blank');
  };

  const handleSignature = () => {
    if (onSignatureClick) {
      onSignatureClick(booking);
      onOpenChange(false);
    }
  };

  const isCancelled = booking.status === 'cancelled';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {t('bookings.filters.contract')}
          </DialogTitle>
          <DialogDescription>
            {booking.property?.name} — <span className="font-semibold text-foreground">{booking.tenant?.name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-3">
          {/* Acciones directas */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Acciones del Contrato
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex items-center justify-center gap-2 h-11 text-xs font-semibold"
                onClick={handleOpenPdf}
              >
                <FileDown className="h-4 w-4 text-primary" />
                <span>Enviar / Ver PDF</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="flex items-center justify-center gap-2 h-11 text-xs font-semibold text-blue-700 border-blue-200 hover:bg-blue-50"
                onClick={handleSignature}
                disabled={isCancelled}
              >
                <PenLine className="h-4 w-4 text-blue-600" />
                <span>Firma Digital</span>
              </Button>
            </div>
          </div>

          <hr className="border-border" />

          {/* Selector de estado */}
          <div className="space-y-2">
            <Label htmlFor="contract-status-select" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Cambiar Estado
            </Label>
            <Select value={status} onValueChange={(val) => setStatus(val as ContractStatus)}>
              <SelectTrigger id="contract-status-select" className="w-full">
                <SelectValue placeholder="Seleccionar estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not_sent">
                  {t('bookings.contract_status.not_sent')}
                </SelectItem>
                <SelectItem value="sent">
                  {t('bookings.contract_status.sent')}
                </SelectItem>
                <SelectItem value="signed">
                  {t('bookings.contract_status.signed')}
                </SelectItem>
                <SelectItem value="not_required">
                  {t('bookings.contract_status.not_required')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleSaveStatus}
            disabled={isPending || status === (booking.contractStatus || 'not_sent')}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar Estado'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
