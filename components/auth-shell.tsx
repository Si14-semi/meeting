export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card rounded-2xl border border-line shadow-sm p-7 animate-fade-in-up">
        {children}
      </div>
    </main>
  );
}
