import { Sidebar } from "@/components/layout/sidebar";
import { CheckReminderBanner } from "@/components/layout/check-reminder-banner";
import { getCheckReminders } from "@/lib/queries/operational";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const pendingChecks = await getCheckReminders();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-0 p-6 lg:p-8 bg-background">
        <CheckReminderBanner pending={pendingChecks} />
        {children}
      </main>
    </div>
  );
}
