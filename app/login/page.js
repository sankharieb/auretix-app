import Link from "next/link";
import LoginForm from "../../components/login-form";

export const metadata = {
  title: "Sign in | Auretix",
};

export default function LoginPage() {
  return (
    <main className="site-shell">
      <section className="content-section">
        <div className="section-intro">
          <div className="eyebrow">Secure workspace access</div>
          <h1>Sign in to Auretix</h1>
          <p>
            Use a magic link to access company workspaces, decision runs, and procurement workflows.
          </p>
        </div>

        <div className="form-grid">
          <div className="form-intro-card">
            <div className="result-label">Access model</div>
            <ul className="action-list mini-points">
              <li>Company-scoped workspaces.</li>
              <li>Roles for owners, admins, operators, finance, and viewers.</li>
              <li>Audit trails for saved workspaces and decision runs.</li>
            </ul>
            <Link className="button button-secondary" href="/app">
              Back to app
            </Link>
          </div>

          <LoginForm />
        </div>
      </section>
    </main>
  );
}
