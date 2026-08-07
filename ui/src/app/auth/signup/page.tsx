"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { signupApiV1AuthSignupPost } from "@/client/sdk.gen";
import { AuthEnterpriseCTA } from "@/components/auth/AuthEnterpriseCTA";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COUNTRY_CODES = [
  { code: "+1", label: "🇺🇸/🇨🇦 +1 (US/Canada)" },
  { code: "+44", label: "🇬🇧 +44 (UK)" },
  { code: "+91", label: "🇮🇳 +91 (India)" },
  { code: "+61", label: "🇦🇺 +61 (Australia)" },
  { code: "+49", label: "🇩🇪 +49 (Germany)" },
  { code: "+33", label: "🇫🇷 +33 (France)" },
  { code: "+81", label: "🇯🇵 +81 (Japan)" },
  { code: "+971", label: "🇦🇪 +971 (UAE)" },
  { code: "+52", label: "🇲🇽 +52 (Mexico)" },
  { code: "+55", label: "🇧🇷 +55 (Brazil)" },
  { code: "+39", label: "🇮🇹 +39 (Italy)" },
  { code: "+34", label: "🇪🇸 +34 (Spain)" },
  { code: "+31", label: "🇳🇱 +31 (Netherlands)" },
  { code: "+64", label: "🇳🇿 +64 (New Zealand)" },
  { code: "+65", label: "🇸🇬 +65 (Singapore)" },
  { code: "+27", label: "🇿🇦 +27 (South Africa)" },
];

const SME_BUSINESS_TYPES = [
  "Dental Clinic",
  "Medical & Health Practice",
  "Salon, Barber & Beauty",
  "Spa & Wellness Center",
  "Auto Repair & Detailing",
  "Plumbing & HVAC Services",
  "Electrical & Trades",
  "Legal & Law Firm",
  "Real Estate & Property Mgmt",
  "Fitness, Gym & Personal Training",
  "Veterinary Care & Pet Services",
  "Cleaning & Maid Services",
  "Photography & Videography",
  "Tutoring & Educational Services",
  "Restaurant, Cafe & Catering",
  "Accounting & Tax Services",
  "Insurance Agency",
  "General Contracting & Roofing",
  "Consulting & Professional Services",
  "Other Local SME",
];

const COUNTRIES = [
  "United States",
  "Canada",
  "United Kingdom",
  "India",
  "Australia",
  "Germany",
  "France",
  "Japan",
  "United Arab Emirates",
  "Mexico",
  "Brazil",
  "Italy",
  "Spain",
  "Netherlands",
  "New Zealand",
  "Singapore",
  "South Africa",
  "Other",
];

export default function SignupPage() {
  // Credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Mobile Contact
  const [countryCode, setCountryCode] = useState("+1");
  const [mobileNumber, setMobileNumber] = useState("");

  // Business Profile
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("Dental Clinic");

  // Address
  const [addressStreet, setAddressStreet] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [addressCountry, setAddressCountry] = useState("United States");

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    const fullMobile = mobileNumber ? `${countryCode} ${mobileNumber.trim()}` : undefined;

    setLoading(true);

    try {
      const res = await signupApiV1AuthSignupPost({
        body: {
          email,
          password,
          mobile_number: fullMobile,
          business_name: businessName.trim() || undefined,
          business_type: businessType || undefined,
          address_street: addressStreet.trim() || undefined,
          address_city: addressCity.trim() || undefined,
          address_state: addressState.trim() || undefined,
          address_zip: addressZip.trim() || undefined,
          address_country: addressCountry || undefined,
        },
      });

      if (res.error || !res.data) {
        const detail = (res.error as { detail?: string })?.detail;
        toast.error(detail || "Signup failed");
        return;
      }

      // Set httpOnly cookies via server route
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: res.data.token, user: res.data.user }),
      });

      window.location.href = "/overview";
    } catch {
      toast.error("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell enterpriseSlot={<AuthEnterpriseCTA />}>
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Get started with your 14-day free trial. No credit card required upfront.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Account Info */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Account Credentials
          </h2>
          <div className="space-y-2">
            <Label htmlFor="email">Email address *</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min 8 chars"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
          </div>
        </div>

        {/* Mobile Contact */}
        <div className="space-y-3 pt-2 border-t">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Mobile Contact
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="mobileNumber">Mobile Number</Label>
            <div className="flex gap-2">
              <select
                className="flex h-10 w-[130px] rounded-md border border-input bg-background px-2 py-1 text-xs sm:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <Input
                id="mobileNumber"
                type="tel"
                placeholder="(555) 000-0000"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
        </div>

        {/* Business Profile */}
        <div className="space-y-3 pt-2 border-t">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Business Details
          </h2>
          <div className="space-y-2">
            <Label htmlFor="businessName">Business Name</Label>
            <Input
              id="businessName"
              type="text"
              placeholder="e.g. Apex Dental Clinic"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="businessType">Business Category</Label>
            <select
              id="businessType"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
            >
              {SME_BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Location & Address */}
        <div className="space-y-3 pt-2 border-t">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Business Location
          </h2>
          <div className="space-y-2">
            <Label htmlFor="addressStreet">Street Address</Label>
            <Input
              id="addressStreet"
              type="text"
              placeholder="123 Main St, Suite 100"
              value={addressStreet}
              onChange={(e) => setAddressStreet(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="addressCity">City</Label>
              <Input
                id="addressCity"
                type="text"
                placeholder="New York"
                value={addressCity}
                onChange={(e) => setAddressCity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addressState">State / Province</Label>
              <Input
                id="addressState"
                type="text"
                placeholder="NY"
                value={addressState}
                onChange={(e) => setAddressState(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="addressZip">Zip / Postal Code</Label>
              <Input
                id="addressZip"
                type="text"
                placeholder="10001"
                value={addressZip}
                onChange={(e) => setAddressZip(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addressCountry">Country</Label>
              <select
                id="addressCountry"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={addressCountry}
                onChange={(e) => setAddressCountry(e.target.value)}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <Button type="submit" className="w-full mt-4" size="lg" disabled={loading}>
          {loading ? "Creating account..." : "Start 14-Day Free Trial"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground pt-2">
        Already have an account?{" "}
        <Link href="/auth/login" className="text-primary underline-offset-4 hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
