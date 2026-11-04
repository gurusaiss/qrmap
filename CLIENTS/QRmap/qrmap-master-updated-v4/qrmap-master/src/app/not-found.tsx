import { ButtonLink } from '@/components/ui';

/** Global 404 for the React-rendered surfaces. The public page has its own (see modules/merchants/render-html.ts). */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-[18px] font-semibold">Page not found</h1>
      <p className="mt-2 text-[15px] text-ink-500">The page you&apos;re looking for doesn&apos;t exist.</p>
      <ButtonLink href="/" className="mt-5">
        Go home
      </ButtonLink>
    </div>
  );
}
