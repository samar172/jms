"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Gem } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("admin@jms.local");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex relative flex-col justify-end bg-sidebar text-white p-12 overflow-hidden">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 30% 20%, rgba(138,109,31,0.55), transparent 55%), radial-gradient(circle at 80% 80%, rgba(138,109,31,0.35), transparent 50%)",
          }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <Gem className="text-gold" size={28} />
            <span className="text-2xl font-semibold">JMS</span>
          </div>
          <p className="text-white/70 max-w-sm">
            Jewellery Manufacturing, Costing &amp; Karigar Management — one system of record from
            design sketch to finished, costed product.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center p-8 bg-bg">
        <div className="w-full max-w-sm">
          <div className="card p-8">
            <h1 className="text-xl font-semibold mb-1">Sign in to your workspace</h1>
            <p className="text-sm text-text-muted mb-6">Enter your credentials to continue</p>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  required
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    className="input pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    onClick={() => setShowPassword((s) => !s)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}

              <button type="submit" disabled={submitting} className="btn btn-primary w-full">
                {submitting ? "Signing in…" : "Sign In"}
              </button>
            </form>
          </div>
          <p className="text-xs text-text-muted text-center mt-4">
            Protected by role-based access control and an immutable audit trail.
          </p>
        </div>
      </div>
    </div>
  );
}
