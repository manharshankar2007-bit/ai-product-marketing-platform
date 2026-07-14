export function DashboardHeader() {
  return (
    <header className="flex flex-col items-center gap-2 py-12 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        AI Product Marketing Platform
      </h1>
      <p className="max-w-xl text-base text-muted-foreground">
        Generate high-quality product newsletters from PRDs.
      </p>
    </header>
  )
}
