"use client";

import { Clock, Loader2, Save, Settings, ShieldAlert, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";

interface AppointmentSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTenantId?: number | string | null;
  onSaved?: () => void;
}

export function AppointmentSettingsModal({
  open,
  onOpenChange,
  selectedTenantId,
  onSaved,
}: AppointmentSettingsModalProps) {
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [bufferMinutes, setBufferMinutes] = useState<number>(0);
  const [allowOverlap, setAllowOverlap] = useState<boolean>(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;

      const url = selectedTenantId
        ? `/api/v1/appointments/settings?tenant_id=${selectedTenantId}`
        : "/api/v1/appointments/settings";

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setDurationMinutes(data.default_duration_minutes || 30);
        setBufferMinutes(data.buffer_minutes || 0);
        setAllowOverlap(Boolean(data.allow_overlap));
      }
    } catch (err) {
      console.error("Error loading appointment settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchSettings();
    }
  }, [open, selectedTenantId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/v1/appointments/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          default_duration_minutes: Number(durationMinutes),
          buffer_minutes: Number(bufferMinutes),
          allow_overlap: allowOverlap,
          tenant_id: selectedTenantId || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("Appointment booking settings saved successfully!");
        if (onSaved) onSaved();
        onOpenChange(false);
      } else {
        const errorMsg =
          typeof data.detail === "string"
            ? data.detail
            : Array.isArray(data.detail)
            ? data.detail.map((e: any) => e.msg || e.message || JSON.stringify(e)).join(", ")
            : typeof data.detail === "object" && data.detail !== null
            ? data.detail.msg || data.detail.message || JSON.stringify(data.detail)
            : "Failed to save appointment settings";
        toast.error(errorMsg);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error saving settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">Appointment Booking Rules</DialogTitle>
              <DialogDescription>
                Configure default duration, gap buffers, and conflict prevention rules.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading booking settings...</span>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Default Duration Selection */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" />
                Default Appointment Duration
              </Label>
              <Select
                value={String(durationMinutes)}
                onValueChange={(val) => setDurationMinutes(Number(val))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select appointment length" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 Minutes</SelectItem>
                  <SelectItem value="30">30 Minutes (Recommended)</SelectItem>
                  <SelectItem value="45">45 Minutes</SelectItem>
                  <SelectItem value="60">1 Hour (60 Minutes)</SelectItem>
                  <SelectItem value="90">1.5 Hours (90 Minutes)</SelectItem>
                  <SelectItem value="120">2 Hours (120 Minutes)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Default duration applied when callers book over the phone or via web dashboard.
              </p>
            </div>

            {/* Buffer Gap Time Selection */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Buffer Time Between Appointments
              </Label>
              <Select
                value={String(bufferMinutes)}
                onValueChange={(val) => setBufferMinutes(Number(val))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select buffer time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0 Minutes (Back-to-Back)</SelectItem>
                  <SelectItem value="5">5 Minutes</SelectItem>
                  <SelectItem value="10">10 Minutes</SelectItem>
                  <SelectItem value="15">15 Minutes (Recommended)</SelectItem>
                  <SelectItem value="30">30 Minutes</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Rest & prep time enforced between consecutive bookings.
              </p>
            </div>

            {/* Double-Booking / Overlap Prevention Toggle */}
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-emerald-500" />
                    Strict Double-Booking Prevention
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Block overlapping appointments at the same time.
                  </p>
                </div>
                <Switch
                  checked={!allowOverlap}
                  onCheckedChange={(checked) => setAllowOverlap(!checked)}
                />
              </div>

              <div className="text-xs text-muted-foreground bg-muted/50 p-2.5 rounded border mt-2">
                {!allowOverlap ? (
                  <p className="text-emerald-700 dark:text-emerald-300 font-medium">
                    ✓ Enabled: Callers and users cannot book conflicting slots on the same day.
                  </p>
                ) : (
                  <p className="text-amber-700 dark:text-amber-300 font-medium">
                    ⚠️ Disabled: Overlapping appointments at the exact same time will be allowed.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5 cursor-pointer">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Booking Rules
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
