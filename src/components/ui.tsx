/**
 * Design-system primitives.
 *
 * Small and owned in-repo rather than pulled from a component library: the
 * public page has a hard JavaScript budget and the dashboard needs full control
 * over touch-target size and contrast.
 */
import Link from 'next/link';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonBase =
  'tap-target inline-flex items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-semibold transition-colors disabled:opacity-60 disabled:pointer-events-none';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-ink-200 bg-white text-ink-900 hover:bg-ink-50',
  danger: 'bg-danger-600 text-white hover:opacity-90',
  ghost: 'text-ink-700 hover:bg-ink-100',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button {...props} className={`${buttonBase} ${variants[variant]} ${className}`} />;
}

export function ButtonLink({
  variant = 'primary',
  className = '',
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; href: string }) {
  return (
    <Link href={href} {...props} className={`${buttonBase} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[14px] font-medium text-ink-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[13px] text-ink-400">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-[13px] text-danger-600">
          {error}
        </span>
      )}
    </label>
  );
}

const controlClass =
  'tap-target w-full rounded-lg border border-ink-200 bg-white px-3 text-[16px] text-ink-900 placeholder:text-ink-400';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className ?? ''}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${controlClass} py-2 ${props.className ?? ''}`} rows={props.rows ?? 4} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${props.className ?? ''}`} />;
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`card p-4 ${className}`}>{children}</div>;
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  children: React.ReactNode;
}) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700',
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
    danger: 'bg-danger-50 text-danger-600',
    info: 'bg-brand-50 text-brand-600',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Never a blank table: an empty state always offers the next action. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <h3 className="text-[17px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-[15px] text-ink-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-[14px] text-danger-600">
      {children}
    </p>
  );
}

export function SuccessText({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-lg bg-success-50 px-3 py-2 text-[14px] text-success-600">
      {children}
    </p>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-[15px] text-ink-500">{description}</p>}
    </header>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[13px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-[28px] font-bold tabular-nums leading-none">{value}</p>
      {sub && <p className="mt-1 text-[13px] text-ink-500">{sub}</p>}
    </div>
  );
}
