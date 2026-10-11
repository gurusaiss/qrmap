/**
 * Design-system primitives — "Market Ledger" (see globals.css header comment
 * for the full rationale).
 *
 * Small and owned in-repo rather than pulled from a component library: the
 * public page has a hard JavaScript budget and the dashboard needs full
 * control over touch-target size, contrast and the tactile feel below.
 */
import Link from 'next/link';

/* -------------------------------------------------------------------------- */
/* Tiny inline icon set - no icon-font or icon-library dependency.            */
/* -------------------------------------------------------------------------- */

type IconProps = { className?: string };

export function IconCheck({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M4 10.5 8 14l8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconAlert({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M10 3 2 17h16L10 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 8.3v3.4M10 14.3h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconPlus({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconChevronRight({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A loosely-sketched shop awning — the one illustration the empty state ever shows. */
function EmptyStateMark() {
  return (
    <svg viewBox="0 0 64 48" className="h-12 w-16 text-ink-200" aria-hidden="true">
      <path
        d="M4 20 10 6h44l6 14M4 20v4a4 4 0 0 0 8 0v-4M12 20v4a4 4 0 0 0 8 0v-4M20 20v4a4 4 0 0 0 8 0v-4M28 20v4a4 4 0 0 0 8 0v-4M36 20v4a4 4 0 0 0 8 0v-4M44 20v4a4 4 0 0 0 8 0v-4M52 20v4a4 4 0 0 0 8 0v-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M14 46V28M50 46V28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Buttons - tactile press, not just a colour swap on hover.                  */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonBase =
  'tap-target inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] px-4 text-[15px] font-semibold ' +
  'transition-[background-color,box-shadow,transform,border-color] duration-150 ease-out ' +
  'active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-[0_1px_2px_rgba(36,27,21,0.15)] hover:bg-brand-700 hover:shadow-[0_4px_12px_-2px_rgba(194,73,29,0.45)]',
  secondary: 'border border-ink-200 bg-[var(--surface)] text-ink-900 hover:border-ink-400 hover:bg-ink-50',
  danger: 'bg-danger-600 text-white shadow-[0_1px_2px_rgba(36,27,21,0.15)] hover:bg-[#962019] hover:shadow-[0_4px_12px_-2px_rgba(179,38,30,0.45)]',
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

/* -------------------------------------------------------------------------- */
/* Form controls                                                              */
/* -------------------------------------------------------------------------- */

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
        <span role="alert" className="mt-1 flex items-center gap-1 text-[13px] text-danger-600">
          <IconAlert className="h-3.5 w-3.5 shrink-0" />
          {error}
        </span>
      )}
    </label>
  );
}

const controlClass =
  'tap-target w-full rounded-[var(--radius-sm)] border border-ink-200 bg-[var(--surface)] px-3 text-[16px] text-ink-900 ' +
  'placeholder:text-ink-400 transition-[border-color,box-shadow] duration-150 ' +
  'hover:border-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className ?? ''}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${controlClass} py-2 ${props.className ?? ''}`} rows={props.rows ?? 4} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${props.className ?? ''}`} />;
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className = '',
  interactive = false,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return <div className={`card ${interactive ? 'card-interactive' : ''} p-4 ${className}`}>{children}</div>;
}

export function Badge({
  tone = 'neutral',
  dot = false,
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  dot?: boolean;
  children: React.ReactNode;
}) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700',
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
    danger: 'bg-danger-50 text-danger-600',
    info: 'bg-teal-50 text-teal-700',
  };
  const dots = {
    neutral: 'bg-ink-400',
    success: 'bg-success-600',
    warning: 'bg-warning-600',
    danger: 'bg-danger-600',
    info: 'bg-teal-600',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium ${tones[tone]}`}>
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dots[tone]}`} aria-hidden="true" />}
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
    <div className="card rise-in flex flex-col items-center px-6 py-10 text-center">
      <EmptyStateMark />
      <h3 className="mt-3 font-display text-[17px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-[15px] text-ink-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="rise-in flex items-start gap-2 rounded-[var(--radius-sm)] bg-danger-50 px-3 py-2 text-[14px] text-danger-600">
      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function SuccessText({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p role="status" className="rise-in flex items-start gap-2 rounded-[var(--radius-sm)] bg-success-50 px-3 py-2 text-[14px] text-success-600">
      <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="rise-in mb-5">
      <h1 className="font-display text-[24px] font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-[15px] text-ink-500">{description}</p>}
    </header>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card relative overflow-hidden p-4">
      <span className="absolute inset-y-0 left-0 w-1 bg-brand-600/70" aria-hidden="true" />
      <p className="text-[13px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 font-display text-[28px] font-semibold tabular-nums leading-none">{value}</p>
      {sub && <p className="mt-1 text-[13px] text-ink-500">{sub}</p>}
    </div>
  );
}
