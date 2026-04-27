import { useState } from "react";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import logo from "@/assets/isr-logo.png";

export function AuthGate({ onGuest }: { onGuest?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<0 | 1>(0);

  const signInGoogle = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Google sign-in failed", {
          description: result.error instanceof Error ? result.error.message : "Try again",
        });
        setLoading(false);
        return;
      }
      // result.redirected -> browser navigates away
    } catch (err) {
      toast.error("Sign-in failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* Ambient background orbs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 -left-40 size-[520px] rounded-full bg-foreground/[0.04] blur-3xl animate-orb-slow" />
        <div className="absolute top-1/3 -right-40 size-[600px] rounded-full bg-foreground/[0.05] blur-3xl animate-orb-slower" />
      </div>

      <header className="apple-blur sticky top-0 z-10 border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5 animate-apple-fade">
            <img src={logo} alt="ISR" className="size-7 rounded-[8px]" width={28} height={28} />
            <span className="text-[15px] font-semibold tracking-tight">ISR AI</span>
          </div>
          <div className="text-xs text-muted-foreground hidden sm:block animate-apple-fade">
            Israel advocacy · clarified
          </div>
        </div>
      </header>

      <main className="flex-1 grid lg:grid-cols-2 max-w-6xl w-full mx-auto px-6 py-12 lg:py-20 gap-12 items-center">
        {step === 0 ? (
          <section className="animate-apple-up">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-4">
              About the project
            </div>
            <h1 className="text-5xl lg:text-6xl font-semibold tracking-[-0.045em] leading-[1.02]">
              Win the
              <br />
              <span className="shimmer-text">argument online.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-lg">
              An Israeli-advocacy AI built for replying smart online — counter antisemitism,
              demonization, double standards, and Hamas propaganda with short, sharp, factual answers.
            </p>

            <div className="mt-10 grid sm:grid-cols-2 gap-3">
              {[
                { t: "Ready-to-post replies", d: "Short drafts you can paste straight into the thread." },
                { t: "Spots demonization", d: "Calls out the 3D test: demonization, double standards, delegitimization." },
                { t: "New & old antisemitism", d: "Knows the tropes — from blood libel to Holocaust inversion." },
                { t: "Image analysis", d: "Drop a screenshot; it tells you how to respond." },
              ].map((f, i) => (
                <div
                  key={f.t}
                  className="rounded-2xl border border-border p-4 bg-card hover:bg-accent transition-all duration-300 hover:-translate-y-0.5"
                  style={{ animation: `apple-fade-up 0.6s var(--easing-apple) ${0.1 + i * 0.07}s both` }}
                >
                  <div className="text-sm font-semibold">{f.t}</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.d}</div>
                </div>
              ))}
            </div>

            <div className="mt-10 flex items-center gap-3">
              <button
                onClick={() => setStep(1)}
                className="h-11 px-6 rounded-full bg-foreground text-background text-sm font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-[var(--shadow-soft)]"
              >
                Continue
              </button>
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-foreground" />
                <span className="size-1.5 rounded-full bg-border" />
              </div>
            </div>
          </section>
        ) : (
          <section className="animate-slide-left">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-4">
              Sign in
            </div>
            <h1 className="text-5xl lg:text-6xl font-semibold tracking-[-0.045em] leading-[1.02]">
              One tap.
              <br />
              <span className="shimmer-text">No passwords.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-lg">
              ISR AI uses Google sign-in only. Your conversations stay private to your account.
            </p>
            <button
              onClick={() => setStep(0)}
              className="mt-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
          </section>
        )}

        <section className="animate-apple-up" style={{ animationDelay: "0.15s" }}>
          <div className="rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-elevated)]">
            <div className="flex items-center gap-3 mb-6">
              <img src={logo} alt="" className="size-8" width={32} height={32} />
              <div>
                <h2 className="text-xl font-semibold tracking-tight leading-tight">Welcome to ISR AI</h2>
                <div className="text-xs text-muted-foreground">Sign in to start</div>
              </div>
            </div>

            <button
              onClick={signInGoogle}
              disabled={loading}
              className="w-full h-12 rounded-full bg-foreground text-background text-sm font-medium flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:scale-100 shadow-[var(--shadow-soft)]"
            >
              <GoogleGlyph />
              {loading ? "Opening Google…" : "Continue with Google"}
            </button>

            {onGuest && (
              <button
                onClick={onGuest}
                className="mt-3 w-full h-11 rounded-full border border-border bg-card hover:bg-accent text-sm font-medium transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
              >
                Continue as guest
              </button>
            )}

            <div className="mt-5 text-[11px] text-muted-foreground text-center leading-relaxed">
              Sign in to save chats. Guest mode keeps nothing — chats vanish on refresh.
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#FFF" d="M21.6 12.227c0-.682-.061-1.337-.175-1.966H12v3.72h5.385a4.604 4.604 0 0 1-1.998 3.022v2.51h3.232c1.892-1.743 2.981-4.31 2.981-7.286z"/>
      <path fill="#FFF" opacity="0.9" d="M12 22c2.7 0 4.964-.895 6.619-2.428l-3.232-2.51c-.896.6-2.041.955-3.387.955-2.605 0-4.81-1.76-5.598-4.124H3.064v2.59A9.997 9.997 0 0 0 12 22z"/>
      <path fill="#FFF" opacity="0.75" d="M6.402 13.893A6.005 6.005 0 0 1 6.09 12c0-.66.114-1.299.312-1.893V7.518H3.064A9.997 9.997 0 0 0 2 12c0 1.614.387 3.139 1.064 4.482l3.338-2.59z"/>
      <path fill="#FFF" opacity="0.6" d="M12 5.977c1.47 0 2.787.504 3.823 1.494l2.867-2.867C16.96 2.99 14.696 2 12 2 8.094 2 4.72 4.244 3.064 7.518l3.338 2.59C7.19 7.737 9.395 5.977 12 5.977z"/>
    </svg>
  );
}
