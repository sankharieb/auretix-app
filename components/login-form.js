"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";

function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({
    type: isConfigured() ? "idle" : "error",
    message: isConfigured()
      ? ""
      : "Supabase is not configured yet. Add the values from .env.example to enable real login.",
  });
  const [devLink, setDevLink] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestDevelopmentLink(targetEmail) {
    const response = await fetch("/api/auth/dev-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: targetEmail,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Unable to create a development link.");
    }

    setDevLink(payload.actionLink);
    return payload.actionLink;
  }

  async function submitMagicLink(event) {
    event.preventDefault();

    if (!isConfigured()) {
      setStatus({
        type: "error",
        message: "Supabase environment values are required before login can send magic links.",
      });
      return;
    }

    if (!email.trim()) {
      setStatus({
        type: "error",
        message: "Enter an email address to receive a secure login link.",
      });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: "idle", message: "" });
    setDevLink("");

    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      );
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/app`,
        },
      });

      if (error) {
        throw error;
      }

      if (window.location.hostname === "localhost") {
        await requestDevelopmentLink(email.trim());
      }

      setStatus({
        type: "success",
        message:
          window.location.hostname === "localhost"
            ? "Magic link requested. Email delivery can be slow in local development, so a local dev login link is ready below."
            : "Magic link requested. Check your inbox and spam folder.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Unable to send a login link right now.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createDevelopmentLink() {
    if (!email.trim()) {
      setStatus({
        type: "error",
        message: "Enter the email address first, then generate a development link.",
      });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: "idle", message: "" });
    setDevLink("");

    try {
      const actionLink = await requestDevelopmentLink(email.trim());
      setStatus({
        type: "success",
        message: "Development login link created locally. Opening it now.",
      });

      window.location.href = actionLink;
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Unable to create a development login link.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="lead-form-card" onSubmit={submitMagicLink}>
      <label htmlFor="email">Work email</label>
      <input
        id="email"
        name="email"
        onChange={(event) => setEmail(event.target.value)}
        placeholder="operator@company.com"
        type="email"
        value={email}
      />

      <button
        className="button button-primary"
        disabled={isSubmitting}
        onClick={createDevelopmentLink}
        type="button"
      >
        Continue locally without email
      </button>

      <button className="button button-secondary" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Sending..." : "Send secure login link"}
      </button>

      {status.message ? (
        <div className={`form-status ${status.type === "error" ? "error" : "success"}`}>
          {status.message}
        </div>
      ) : null}

      {devLink ? (
        <a className="button button-secondary" href={devLink}>
          Open local dev login link
        </a>
      ) : null}
    </form>
  );
}
