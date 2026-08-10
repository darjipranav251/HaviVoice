"use client";

import { CheckCircle2, Globe, Loader2, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";

interface GoogleCalendarSyncModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GoogleCalendarSyncModal({ open, onOpenChange }: GoogleCalendarSyncModalProps) {
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const [isConnected, setIsConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/v1/appointments/google/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIsConnected(data.is_connected);
        setConnectedEmail(data.connected_email);
        setClientId(data.client_id || "");
      }
    } catch (err) {
      console.error("Error loading Google Calendar status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchStatus();
    }
  }, [open]);

  // Handle 1-Click Google OAuth Connect (Redirects directly to Google Login)
  const handleInitiateOAuth = () => {
    const activeClientId = clientId || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
    const redirectUri = typeof window !== "undefined" ? `${window.location.origin}/appointments` : "";

    if (!activeClientId) {
      toast.error("Google OAuth is not configured on the server. Please check GOOGLE_OAUTH_CLIENT_ID in your server .env file.");
      return;
    }

    const scope = encodeURIComponent("https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email");
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${encodeURIComponent(
      activeClientId
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&access_type=offline&prompt=consent`;

    // Direct 1-Click Redirect to Google
    window.location.href = authUrl;
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/v1/appointments/google/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success("Google Calendar disconnected");
        fetchStatus();
      }
    } catch (err) {
      console.error(err);
      toast.error("Error disconnecting Google Calendar");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">1-Click Google Calendar Sync</DialogTitle>
              <DialogDescription>
                Automatically push AI Voice Agent bookings to your Google Calendar in real-time.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Checking Google Calendar connection...</span>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Status Banner */}
            <div className="rounded-lg border bg-muted/40 p-3 flex items-center justify-between text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">Calendar Status:</span>
              </div>
              <Badge
                className={
                  isConnected
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-medium"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-medium"
                }
              >
                {isConnected ? `Connected (${connectedEmail || "Google"})` : "Not Connected"}
              </Badge>
            </div>

            {/* Feature Highlights */}
            <div className="text-xs text-muted-foreground bg-accent/40 rounded-md p-3 space-y-1.5 border">
              <p className="font-medium text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                Real-Time Google Calendar Features:
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Every appointment booked by callers appears on your phone instantly.</li>
                <li>Zero manual syncing required ($0 API fees forever).</li>
                <li>Deleting an appointment in HaviVoice removes it from Google Calendar.</li>
              </ul>
            </div>

            {/* Connected State */}
            {isConnected ? (
              <div className="space-y-3 pt-2">
                <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-4 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-emerald-800 dark:text-emerald-200">✓ Active 1-Click Sync Enabled</p>
                    <p className="text-muted-foreground mt-0.5">Connected Account: {connectedEmail || "Primary Calendar"}</p>
                  </div>
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="w-full text-destructive hover:bg-destructive/10 cursor-pointer gap-1.5 py-5"
                >
                  {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                  Disconnect Google Calendar
                </Button>
              </div>
            ) : (
              /* Disconnected / Pure 1-Click Button State */
              <div className="pt-2">
                <Button
                  type="button"
                  onClick={handleInitiateOAuth}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 cursor-pointer py-6 text-base font-semibold shadow-md"
                >
                  <Globe className="h-5 w-5" />
                  1-Click Connect with Google Calendar
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
