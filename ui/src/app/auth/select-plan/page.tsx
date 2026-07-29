"use client";

import { Check, Crown, Infinity,Sparkles, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  Plan definitions                                                   */
/* ------------------------------------------------------------------ */

interface Plan {
  id: string;
  priceId: string;
  name: string;
  price: string;
  period: string;
  minutes: string;
  features: string[];
  badge?: string;
  highlight: boolean;
  icon: typeof Crown;
  accentClass: string;
  buttonClass: string;
  checkClass: string;
}

const PLANS: Plan[] = [
  {
    id: "basic",
    priceId: "price_dummy_basic",
    name: "Basic",
    price: "$149",
    period: "/month",
    minutes: "250 minutes",
    features: [
      "250 Voice Minutes / Month",
      "Voice Agent Builder",
      "Real-time Analytics & Reports",
      "Knowledge Base Integration",
      "Email Support",
    ],
    highlight: false,
    icon: Zap,
    accentClass: "bg-blue-500/15 text-blue-500",
    buttonClass: "",
    checkClass: "bg-primary/10 text-primary",
  },
  {
    id: "pro",
    priceId: "price_dummy_pro",
    name: "Pro",
    price: "$249",
    period: "/month",
    minutes: "500 minutes",
    features: [
      "500 Voice Minutes / Month",
      "Voice Agent Builder",
      "Real-time Analytics & Reports",
      "Knowledge Base Integration",
      "Priority Support",
      "API Access",
    ],
    badge: "Most Popular",
    highlight: true,
    icon: Crown,
    accentClass: "bg-amber-500/15 text-amber-500",
    buttonClass:
      "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md hover:from-amber-600 hover:to-orange-600 hover:shadow-lg",
    checkClass: "bg-amber-500/15 text-amber-500",
  },
  {
    id: "enterprise",
    priceId: "price_dummy_enterprise",
    name: "Enterprise",
    price: "$499",
    period: "/month",
    minutes: "Unlimited minutes",
    features: [
      "Unlimited Voice Minutes",
      "Voice Agent Builder",
      "Real-time Analytics & Reports",
      "Knowledge Base Integration",
      "Priority Support",
      "API Access",
      "Dedicated Account Manager",
    ],
    highlight: false,
    icon: Infinity,
    accentClass: "bg-violet-500/15 text-violet-500",
    buttonClass: "",
    checkClass: "bg-violet-500/15 text-violet-500",
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function SelectPlanPage() {
  const auth = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSelectPlan = async (plan: Plan) => {
    setLoadingPlan(plan.id);
    try {
      const token = await auth.getAccessToken();
      const res = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ price_id: plan.priceId, is_signup: true }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || `Request failed (${res.status})`);
      }

      const data: { url: string } = await res.json();
      window.location.href = data.url;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
      setLoadingPlan(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      {/* Header */}
      <div className="mb-10 space-y-3 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 ring-1 ring-amber-500/30">
          <Crown className="size-6 text-amber-500" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Choose your plan
        </h1>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
          Your trial is free for 14&nbsp;days. You won&apos;t be charged until
          it ends. Cancel anytime.
        </p>
      </div>

      {/* Plan cards — 3 columns on desktop, stacked on mobile */}
      <div className="mx-auto grid w-full max-w-4xl gap-6 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isLoading = loadingPlan === plan.id;
          const isDisabled = loadingPlan !== null;
          const Icon = plan.icon;

          return (
            <div
              key={plan.id}
              className={`group relative rounded-xl p-px transition-all duration-300 ${
                plan.highlight
                  ? "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
                  : "bg-gradient-to-br from-border/80 to-border/40 hover:from-border hover:to-border/60"
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2">
                  <Badge className="whitespace-nowrap border-0 bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-0.5 text-[11px] font-semibold text-white shadow-md">
                    <Sparkles className="mr-1 size-3" />
                    {plan.badge}
                  </Badge>
                </div>
              )}

              <Card
                className={`h-full border-0 bg-card transition-colors duration-300 ${
                  plan.highlight
                    ? "bg-gradient-to-br from-amber-500/[0.03] to-orange-500/[0.03]"
                    : ""
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className={`flex size-8 items-center justify-center rounded-lg ${plan.accentClass}`}
                    >
                      <Icon className="size-4" />
                    </div>
                    <CardTitle className="text-lg font-semibold">
                      {plan.name}
                    </CardTitle>
                  </div>
                  <div>
                    <span className="text-3xl font-bold tracking-tight">
                      {plan.price}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {plan.period}
                    </span>
                  </div>
                  <CardDescription className="text-xs font-medium">
                    {plan.minutes}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Feature list */}
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <div
                          className={`flex size-4 shrink-0 items-center justify-center rounded-full ${plan.checkClass}`}
                        >
                          <Check className="size-2.5" strokeWidth={3} />
                        </div>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {/* CTA button */}
                  <Button
                    onClick={() => handleSelectPlan(plan)}
                    disabled={isDisabled}
                    className={`w-full transition-all duration-300 ${plan.buttonClass}`}
                    variant={plan.highlight ? "default" : "outline"}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Redirecting…
                      </span>
                    ) : (
                      "Start 14-Day Free Trial"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
        All plans include a 14-day free trial. No charge until the trial ends.
        <br />
        Need a custom plan?{" "}
        <span className="text-primary">Contact us for enterprise pricing.</span>
      </p>
    </div>
  );
}
