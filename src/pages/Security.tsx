import React from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Security: React.FC = () => {
  return (
    <AppShell>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Security and Compliance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="font-semibold">Authentication & Form Security</div>
              <ul className="list-disc ml-5 space-y-1">
                <li>Supabase Auth for login and session management.</li>
                <li>Basic form security via React Hook Form (validation and controlled inputs).</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold">Encryption & Compliance</div>
              <ul className="list-disc ml-5 space-y-1">
                <li>Advanced encryption for financial data at rest and in transit.</li>
                <li>Compliance with GDPR/PCI-DSS for multi-currency transactions.</li>
                <li>Crypto libraries like crypto-js; compliance tools such as Stripe’s built-in PCI compliance or Vercel Security features.</li>
                <li>Protects sensitive rent and accounting data, especially in international contexts.</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold">Audit Logging</div>
              <ul className="list-disc ml-5 space-y-1">
                <li>Extends delete/reinstate functions to keep immutable audit trails.</li>
                <li>Centralized Activity Log for administrative oversight.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Calendar with Alerts & Google Sync</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc ml-5 space-y-1">
              <li>Interactive calendar (react-big-calendar) for bookings, rent due dates, and maintenance schedules.</li>
              <li>Google Calendar integration via OAuth (Supabase Google provider) for two-way syncing.</li>
              <li>Alerts/notifications via Supabase Edge Functions; server-triggered reminders for upcoming events.</li>
              <li>Events persisted in Supabase; mirrored to Google Calendar for multi-user access.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};

export default Security;