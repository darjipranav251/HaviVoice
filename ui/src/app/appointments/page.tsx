"use client";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import {
  AlertTriangle,
  Building,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Flame,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import { useEffect, useRef,useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";

interface Appointment {
  id: number;
  organization_id: number;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  title: string;
  start_time: string;
  end_time: string;
  status: "upcoming" | "completed" | "no_show" | "cancelled";
  is_emergency: boolean;
  notes?: string;
  organization_name?: string;
  organization_email?: string;
  created_at: string;
}

export default function AppointmentsPage() {
  const { user, getAccessToken } = useAuth();
  const calendarRef = useRef<any>(null);

  const isSuperuser = (user as any)?.is_superuser ?? false;
  const userSelectedOrg = (user as any)?.selected_organization_id;

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [tenants, setTenants] = useState<{ organization_id: number; email: string }[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>(
    userSelectedOrg ? String(userSelectedOrg) : "all"
  );
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Modal states
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [updating, setUpdating] = useState(false);

  // New Booking Form State
  const [bookingForm, setBookingForm] = useState({
    client_name: "",
    client_phone: "",
    client_email: "",
    title: "Voice Agent Booking",
    start_date: "",
    start_time: "10:00",
    duration_minutes: 30,
    is_emergency: false,
    notes: "",
  });

  // Fetch tenants for superuser filter
  useEffect(() => {
    if (!isSuperuser) return;
    const fetchTenants = async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch("/api/v1/superuser/tenants", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTenants(data);
        }
      } catch (err) {
        console.error("Error loading tenants for filter:", err);
      }
    };
    fetchTenants();
  }, [isSuperuser, getAccessToken]);

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (activeTab !== "all") params.append("status", activeTab);
      if (timeRange !== "all") params.append("time_range", timeRange);
      if (searchTerm) params.append("search", searchTerm);
      if (isSuperuser && selectedTenantId !== "all") {
        params.append("tenant_id", selectedTenantId);
      }

      const res = await fetch(`/api/v1/appointments?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to fetch appointments");
      }
      const data = await res.json();
      setAppointments(data);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Error loading appointments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, [activeTab, timeRange, searchTerm, selectedTenantId, user]);

  // Handle Slot Selection in FullCalendar
  const handleDateSelect = (selectInfo: any) => {
    const selectedDate = selectInfo.startStr.split("T")[0];
    const selectedTime = selectInfo.startStr.includes("T")
      ? selectInfo.startStr.split("T")[1].substring(0, 5)
      : "10:00";

    setBookingForm({
      client_name: "",
      client_phone: "",
      client_email: "",
      title: "Voice Agent Booking",
      start_date: selectedDate,
      start_time: selectedTime,
      duration_minutes: 30,
      is_emergency: false,
      notes: "",
    });
    setBookModalOpen(true);
  };

  // Handle Event Click in FullCalendar
  const handleEventClick = (clickInfo: any) => {
    const aptId = parseInt(clickInfo.event.id, 10);
    const apt = appointments.find((a) => a.id === aptId);
    if (apt) {
      setSelectedAppointment(apt);
      setDetailModalOpen(true);
    }
  };

  // Handle Create Booking
  const handleCreateBooking = async () => {
    if (!bookingForm.client_name || !bookingForm.start_date) {
      toast.error("Please provide client name and start date");
      return;
    }

    setUpdating(true);
    try {
      const token = await getAccessToken();
      const startDateTime = new Date(`${bookingForm.start_date}T${bookingForm.start_time}:00`);
      const endDateTime = new Date(startDateTime.getTime() + bookingForm.duration_minutes * 60000);

      const res = await fetch("/api/v1/appointments/book", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_name: bookingForm.client_name,
          client_phone: bookingForm.client_phone,
          client_email: bookingForm.client_email,
          title: bookingForm.title,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          is_emergency: bookingForm.is_emergency,
          notes: bookingForm.notes,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to create appointment");
      }
      toast.success("Appointment booked successfully!");
      setBookModalOpen(false);
      fetchAppointments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error creating booking");
    } finally {
      setUpdating(false);
    }
  };

  // Handle Update Status
  const handleUpdateStatus = async (
    status: "upcoming" | "completed" | "no_show" | "cancelled",
    isEmergency?: boolean
  ) => {
    if (!selectedAppointment) return;
    setUpdating(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/v1/appointments/${selectedAppointment.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status,
          is_emergency: isEmergency !== undefined ? isEmergency : selectedAppointment.is_emergency,
        }),
      });

      if (!res.ok) throw new Error("Failed to update status");
      toast.success(`Appointment status updated to ${status.replace("_", " ")}`);
      setDetailModalOpen(false);
      fetchAppointments();
    } catch (err) {
      toast.error("Error updating status");
    } finally {
      setUpdating(false);
    }
  };

  // Handle Delete
  const handleDeleteAppointment = async () => {
    if (!selectedAppointment) return;
    setUpdating(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/v1/appointments/${selectedAppointment.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete appointment");
      toast.success("Appointment deleted");
      setDetailModalOpen(false);
      fetchAppointments();
    } catch (err) {
      toast.error("Error deleting appointment");
    } finally {
      setUpdating(false);
    }
  };

  // Format events for FullCalendar
  const calendarEvents = appointments.map((apt) => {
    let color = "#10b981"; // upcoming (green)
    if (apt.status === "completed") color = "#3b82f6"; // blue
    if (apt.status === "no_show") color = "#f59e0b"; // amber
    if (apt.status === "cancelled") color = "#6b7280"; // gray
    if (apt.is_emergency) color = "#ef4444"; // red

    const displayTitle = `${apt.is_emergency ? "🚨 " : ""}${apt.client_name} - ${apt.title}${
      isSuperuser && apt.organization_name ? ` (${apt.organization_name})` : ""
    }`;

    return {
      id: String(apt.id),
      title: displayTitle,
      start: apt.start_time,
      end: apt.end_time,
      backgroundColor: color,
      borderColor: color,
      extendedProps: apt,
    };
  });

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarIcon className="h-7 w-7 text-cta" />
            Appointments & Schedule
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSuperuser
              ? "Global administration & multi-tenant appointment scheduling"
              : "Manage client bookings, no-show tracking, and upcoming schedules"}
          </p>
        </div>

        <Button
          onClick={() => {
            const today = new Date().toISOString().split("T")[0];
            setBookingForm({
              client_name: "",
              client_phone: "",
              client_email: "",
              title: "Voice Agent Booking",
              start_date: today,
              start_time: "10:00",
              duration_minutes: 30,
              is_emergency: false,
              notes: "",
            });
            setBookModalOpen(true);
          }}
          className="gap-2 rounded-full"
        >
          <Plus className="h-4 w-4" />
          Book Appointment
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-xl border bg-card p-4 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search client name, phone, or title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
            <TabsList className="grid grid-cols-5 h-9 text-xs">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="no_show">No-Show</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Superadmin Tenant Selector Filter */}
          {isSuperuser && (
            <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
              <SelectTrigger className="w-[180px] h-9 text-xs border-purple-500/30 bg-purple-500/5">
                <Building className="mr-1.5 h-3.5 w-3.5 text-purple-500 shrink-0" />
                <SelectValue placeholder="Filter Tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🌐 All System Tenants</SelectItem>
                {tenants.map((t) => (
                  <SelectItem key={t.organization_id} value={String(t.organization_id)}>
                    👤 {t.email ? t.email : `Org ${t.organization_id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Time Range Filter */}
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="15days">Last 15 Days</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* FullCalendar Interactive View */}
      <Card className="shadow-sm border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">Calendar View</CardTitle>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span> Upcoming
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span> Completed
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span> No-Show
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500"></span> Emergency
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-96 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-cta" />
            </div>
          ) : (
            <div className="fullcalendar-wrapper">
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
                }}
                selectable={true}
                selectMirror={true}
                dayMaxEvents={true}
                events={calendarEvents}
                select={handleDateSelect}
                eventClick={handleEventClick}
                height="auto"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Book Appointment Modal */}
      <Dialog open={bookModalOpen} onOpenChange={setBookModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-cta" />
              Book New Appointment
            </DialogTitle>
            <DialogDescription>
              Schedule a new appointment directly or test your AI Voice Agent booking integration
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Client Name *</label>
              <Input
                placeholder="e.g. John Doe"
                value={bookingForm.client_name}
                onChange={(e) => setBookingForm({ ...bookingForm, client_name: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Phone Number</label>
                <Input
                  placeholder="+1 234 567 8900"
                  value={bookingForm.client_phone}
                  onChange={(e) => setBookingForm({ ...bookingForm, client_phone: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Email Address</label>
                <Input
                  placeholder="john@example.com"
                  value={bookingForm.client_email}
                  onChange={(e) => setBookingForm({ ...bookingForm, client_email: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Date *</label>
                <Input
                  type="date"
                  value={bookingForm.start_date}
                  onChange={(e) => setBookingForm({ ...bookingForm, start_date: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Time *</label>
                <Input
                  type="time"
                  value={bookingForm.start_time}
                  onChange={(e) => setBookingForm({ ...bookingForm, start_time: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Appointment Title</label>
              <Input
                placeholder="e.g. Initial Consultation"
                value={bookingForm.title}
                onChange={(e) => setBookingForm({ ...bookingForm, title: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="emergency_check"
                checked={bookingForm.is_emergency}
                onChange={(e) => setBookingForm({ ...bookingForm, is_emergency: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <label htmlFor="emergency_check" className="text-xs font-semibold text-red-500 flex items-center gap-1">
                <Flame className="h-3.5 w-3.5" />
                Mark as Urgent / Emergency Booking
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBookModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateBooking} disabled={updating}>
              {updating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirm Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appointment Detail & Status Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-md">
          {selectedAppointment && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {selectedAppointment.is_emergency && <Flame className="h-5 w-5 text-red-500 animate-pulse" />}
                    {selectedAppointment.title}
                  </span>
                  <Badge
                    variant={
                      selectedAppointment.status === "completed"
                        ? "default"
                        : selectedAppointment.status === "no_show"
                        ? "destructive"
                        : "outline"
                    }
                    className="capitalize"
                  >
                    {selectedAppointment.status.replace("_", " ")}
                  </Badge>
                </DialogTitle>
                <DialogDescription>Appointment Details and Status Actions</DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-semibold">{selectedAppointment.client_name}</span>
                </div>

                {selectedAppointment.client_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{selectedAppointment.client_phone}</span>
                  </div>
                )}

                {selectedAppointment.client_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{selectedAppointment.client_email}</span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>
                    {new Date(selectedAppointment.start_time).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>

                {isSuperuser && selectedAppointment.organization_name && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-2 mt-2">
                    <Building className="h-3.5 w-3.5 shrink-0" />
                    <span>Tenant: {selectedAppointment.organization_name} ({selectedAppointment.organization_email})</span>
                  </div>
                )}
              </div>

              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Status Actions:</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateStatus("completed")}
                    disabled={updating}
                    className="text-xs gap-1 border-blue-500/40 text-blue-500 hover:bg-blue-500/10"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Mark Completed
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateStatus("no_show")}
                    disabled={updating}
                    className="text-xs gap-1 border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Mark No-Show
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateStatus("upcoming", !selectedAppointment.is_emergency)}
                    disabled={updating}
                    className="text-xs gap-1 border-red-500/40 text-red-500 hover:bg-red-500/10"
                  >
                    <Flame className="h-3.5 w-3.5" />
                    Toggle Emergency
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateStatus("cancelled")}
                    disabled={updating}
                    className="text-xs gap-1 text-muted-foreground"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Cancel Booking
                  </Button>
                </div>
              </div>

              <DialogFooter className="pt-2 flex justify-between sm:justify-between">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDeleteAppointment}
                  disabled={updating}
                  className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDetailModalOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
