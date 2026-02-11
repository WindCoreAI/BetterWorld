"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { Button, Card, CardBody } from "../../../../src/components/ui";
import { setHumanTokens } from "../../../../src/lib/api";
import { humanAuthApi } from "../../../../src/lib/humanApi";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d?$/.test(value)) return;
      const next = [...digits];
      next[index] = value;
      setDigits(next);
      setError("");

      // Auto-focus next input
      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [digits],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i] ?? "";
    }
    setDigits(next);
    // Focus last filled input or the next empty one
    const focusIndex = Math.min(pasted.length, 5);
    inputRefs.current[focusIndex]?.focus();
  }, []);

  const handleVerify = async () => {
    const code = digits.join("");
    if (code.length !== 6) {
      setError("Please enter all 6 digits");
      return;
    }

    setLoading(true);
    setError("");
    const res = await humanAuthApi.verifyEmail(email, code);
    setLoading(false);

    if (res.ok && res.data) {
      setHumanTokens(res.data.accessToken, res.data.refreshToken);
      router.push("/auth/human/profile");
    } else {
      setError(res.error?.message ?? "Invalid verification code");
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    const res = await humanAuthApi.resendCode(email);
    if (res.ok) {
      setResendCooldown(60);
      setError("");
    } else {
      setError(res.error?.message ?? "Failed to resend code");
    }
  };

  if (!email) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-charcoal-light">Missing email parameter.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-charcoal text-center mb-2">
          Verify Your Email
        </h1>
        <p className="text-charcoal-light text-center mb-8">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-charcoal">{email}</span>
        </p>

        <Card>
          <CardBody>
            <div className="space-y-6">
              {/* 6-digit input */}
              <div className="flex justify-center gap-3" onPaste={handlePaste}>
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="w-12 h-14 text-center text-2xl font-bold border border-charcoal/20 rounded-lg focus:border-terracotta focus:ring-2 focus:ring-terracotta/20 outline-none transition-colors"
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-error/10 text-error text-sm text-center">
                  {error}
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleVerify}
                loading={loading}
                disabled={loading || digits.some((d) => !d)}
              >
                {loading ? "Verifying..." : "Verify Email"}
              </Button>

              <div className="text-center">
                <button
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className="text-sm text-terracotta hover:underline disabled:text-charcoal-light disabled:no-underline"
                >
                  {resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : "Resend verification code"}
                </button>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <p className="text-charcoal-light">Loading...</p>
        </main>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
