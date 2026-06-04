"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const supabase = createSupabaseBrowserClient();

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage("Vérifie ton email pour confirmer ton compte.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        window.location.href = "/";
      }
    }

    setLoading(false);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span style={{ fontWeight: 300 }}>Ad</span><strong style={{ fontWeight: 760, fontStyle: "italic" }}>Stylr</strong>
        </div>
        <h1>{mode === "signin" ? "Connexion" : "Créer un compte"}</h1>
        <form className="login-form" onSubmit={(e) => void handleSubmit(e)}>
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ton@email.com"
              required
              type="email"
              value={email}
            />
          </label>
          <label className="field">
            <span>Mot de passe</span>
            <input
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={6}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={password}
            />
          </label>
          {error ? <p className="login-error">{error}</p> : null}
          {message ? <p className="login-message">{message}</p> : null}
          <button className="button primary" disabled={loading} type="submit">
            {loading ? "…" : mode === "signin" ? "Se connecter" : "Créer le compte"}
          </button>
        </form>
        <button
          className="login-switch"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setMessage(""); }}
          type="button"
        >
          {mode === "signin" ? "Pas de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}
