"use client";

import { Calendar, CheckCircle, ExternalLink, Key, Loader2, RefreshCw, Shield, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

interface CalcomSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CalcomSettingsModal({ open, onOpenChange }: CalcomSettingsModalProps) {
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [eventTypeId, setEventTypeId] = useState("");
  const [username, setUsername] = useState("");
  const [bookingSlug, setBookingSlug] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/v1/appointments/calcom/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setApiKey(data.api_key || "");
        setEventTypeId(data.event_type_id || "");
        setUsername(data.username || "");
        setBookingSlug(data.booking_slug || "");
        setIsEnabled(data.is_enabled ?? true);
      }
    } catch (err) {
      console.error("Error loading Cal.com settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchSettings();
      setTestResult(null);
    }
  }, [open]);

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      toast.error("Please enter your Cal.com API key to test");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/v1/appointments/calcom/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        toast.success(data.message || "Connected to Cal.com successfully!");
        if (data.username && !username) {
          setUsername(data.username);
        }
      } else {
        toast.error(data.message || "Failed to connect to Cal.com");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to test Cal.com connection");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/v1/appointments/calcom/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          api_key: apiKey.trim() || undefined,
          event_type_id: eventTypeId.trim() || undefined,
          username: username.trim() || undefined,
          booking_slug: bookingSlug.trim() || undefined,
          is_enabled: isEnabled,
        }),
      });

      if (res.ok) {
        toast.success("Cal.com scheduling settings saved successfully!");
        onOpenChange(false);
      } else {
        toast.error("Failed to save Cal.com settings");
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
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">Cal.com Calendar Sync & Booking Engine</DialogTitle>
              <DialogDescription>
                Sync your AI Voice Agent appointments seamlessly with Cal.com and external calendars.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading Cal.com settings...</span>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Status Banner */}
            <div className="rounded-lg border bg-muted/40 p-3 flex items-center justify-between text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">Integration Status:</span>
              </div>
              <Badge className={apiKey && eventTypeId ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" : "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30"}>
                {apiKey && eventTypeId ? "Cal.com Connected" : "Default HaviVoice Engine"}
              </Badge>
            </div>

            {/* Information Card */}
            <div className="text-xs text-muted-foreground bg-accent/40 rounded-md p-3 space-y-1 border">
              <p className="font-medium text-foreground">💡 How Cal.com Works with HaviVoice:</p>
              <p>
                When your AI voice agent speaks with callers, it checks open slots and books appointments natively. If Cal.com API key is linked, bookings automatically sync to your connected Google / Outlook calendars!
              </p>
            </div>

            {/* API Key Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="calApiKey" className="text-xs font-semibold">
                  Cal.com API Key (Optional)
                </Label>
                <a
                  href="https://app.cal.com/settings/developer/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                >
                  Get API Key <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <Input
                id="calApiKey"
                type="password"
                placeholder="cal_live_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            {/* Event Type ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="calEventTypeId" className="text-xs font-semibold">
                  Event Type ID
                </Label>
                <Input
                  id="calEventTypeId"
                  placeholder="e.g. 123456"
                  value={eventTypeId}
                  onChange={(e) => setEventTypeId(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="calBookingSlug" className="text-xs font-semibold">
                  Booking Slug / Event Name
                </Label>
                <Input
                  id="calBookingSlug"
                  placeholder="e.g. 30min-consultation"
                  value={bookingSlug}
                  onChange={(e) => setBookingSlug(e.target.value)}
                />
              </div>
            </div>

            {/* Test Connection Button & Indicator */}
            {apiKey && (
              <div className="pt-1 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="gap-1.5 cursor-pointer text-xs"
                >
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Test API Connection
                </Button>

                {testResult && (
                  <span
                    className={`text-xs font-medium ${
                      testResult.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                    }`}
                  >
                    {testResult.success ? "✓ Valid API Key" : "✗ Invalid API Key"}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading} className="gap-1.5 cursor-pointer">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Scheduling Integration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
