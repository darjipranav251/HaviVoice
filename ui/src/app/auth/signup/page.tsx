"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { signupApiV1AuthSignupPost } from "@/client/sdk.gen";
import { AuthEnterpriseCTA } from "@/components/auth/AuthEnterpriseCTA";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ComboboxOption, SearchableCombobox } from "@/components/ui/SearchableCombobox";
import { ALL_COUNTRIES, STATES_BY_COUNTRY } from "@/lib/countriesData";

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
  "Other / Custom Industry",
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
  const [customBusinessType, setCustomBusinessType] = useState("");

  // Address
  const [addressStreet, setAddressStreet] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [addressCountry, setAddressCountry] = useState("United States");

  const [loading, setLoading] = useState(false);

  // Prepare searchable options for country phone dial codes
  const phoneDialCodeOptions: ComboboxOption[] = useMemo(() => {
    return ALL_COUNTRIES.map((c) => ({
      value: c.dialCode,
      label: `${c.flag} ${c.dialCode}`,
      subLabel: `${c.name} (${c.code})`,
      flag: c.flag,
      searchValue: `${c.name} ${c.code} ${c.dialCode} ${c.flag}`,
    }));
  }, []);

  // Prepare searchable options for business country location
  const countryLocationOptions: ComboboxOption[] = useMemo(() => {
    return ALL_COUNTRIES.map((c) => ({
      value: c.name,
      label: c.name,
      subLabel: c.code,
      flag: c.flag,
      searchValue: `${c.name} ${c.code} ${c.flag}`,
    }));
  }, []);

  // Check if current businessType requires custom input
  const isCustomBusiness = businessType === "Other / Custom Industry" || businessType === "Other Local SME";

  // Available states for selected country
  const availableStates = STATES_BY_COUNTRY[addressCountry] || null;

  // When country changes, sync state dropdown or clear
  const handleCountryChange = (newCountry: string) => {
    setAddressCountry(newCountry);
    const newStates = STATES_BY_COUNTRY[newCountry];
    if (newStates && newStates.length > 0) {
      setAddressState(newStates[0]);
    } else {
      setAddressState("");
    }
  };

  // Set default state on initial load
  useEffect(() => {
    if (STATES_BY_COUNTRY["United States"]) {
      setAddressState(STATES_BY_COUNTRY["United States"][0]);
    }
  }, []);

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

    if (isCustomBusiness && !customBusinessType.trim()) {
      toast.error("Please specify your business type / industry");
      return;
    }

    const effectiveBusinessType = isCustomBusiness
      ? customBusinessType.trim() || "Other Business"
      : businessType;

    const fullMobile = mobileNumber ? `${countryCode} ${mobileNumber.trim()}` : undefined;

    setLoading(true);

    try {
      const res = await signupApiV1AuthSignupPost({
        body: {
          email,
          password,
          mobile_number: fullMobile,
          business_name: businessName.trim() || undefined,
          business_type: effectiveBusinessType || undefined,
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
          Get started with your 14-day free trial. Full access guaranteed.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Account Credentials */}
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

        {/* Mobile Contact with Searchable Country Code */}
        <div className="space-y-3 pt-2 border-t">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Mobile Contact
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="mobileNumber">Mobile Phone Number</Label>
            <div className="flex gap-2">
              <div className="w-[150px] shrink-0">
                <SearchableCombobox
                  options={phoneDialCodeOptions}
                  value={countryCode}
                  onChange={setCountryCode}
                  placeholder="Dial Code"
                  searchPlaceholder="Search country or code..."
                />
              </div>
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

        {/* Business Profile with Custom Business Type Support */}
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
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
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

          {/* Render custom business type input if "Other" is selected */}
          {isCustomBusiness && (
            <div className="space-y-1.5 animate-in fade-in-50 slide-in-from-top-1">
              <Label htmlFor="customBusinessType" className="text-primary font-medium">
                Specify Your Business Category / Industry *
              </Label>
              <Input
                id="customBusinessType"
                type="text"
                placeholder="e.g. Chiropractic Clinic, Flight Training, Solar Services..."
                value={customBusinessType}
                onChange={(e) => setCustomBusinessType(e.target.value)}
                required
              />
            </div>
          )}
        </div>

        {/* Location & Address with Searchable Country */}
        <div className="space-y-3 pt-2 border-t">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Business Location
          </h2>
          <div className="space-y-2">
            <Label htmlFor="addressCountry">Country</Label>
            <SearchableCombobox
              options={countryLocationOptions}
              value={addressCountry}
              onChange={handleCountryChange}
              placeholder="Select Country"
              searchPlaceholder="Search country name or code..."
            />
          </div>

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
                placeholder="City"
                value={addressCity}
                onChange={(e) => setAddressCity(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="addressState">State / Province</Label>
              {availableStates ? (
                <select
                  id="addressState"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  value={addressState}
                  onChange={(e) => setAddressState(e.target.value)}
                >
                  {availableStates.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="addressState"
                  type="text"
                  placeholder="State / Province"
                  value={addressState}
                  onChange={(e) => setAddressState(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="addressZip">Zip / Postal Code</Label>
            <Input
              id="addressZip"
              type="text"
              placeholder="Zip / Postal Code"
              value={addressZip}
              onChange={(e) => setAddressZip(e.target.value)}
            />
          </div>
        </div>

        <Button type="submit" className="w-full mt-4 cursor-pointer" size="lg" disabled={loading}>
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
