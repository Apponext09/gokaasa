import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, FileWarning, FilePen } from 'lucide-react';
import { Alert, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { FullPageSpinner, PageHeader } from '@/components/shared/index.jsx';
import { partnerApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const STATUS_META = {
  DRAFT: { icon: FilePen, title: 'Finish your application', tone: 'info' },
  PENDING_REVIEW: { icon: Clock, title: 'Application under review', tone: 'info' },
  APPROVED: { icon: CheckCircle2, title: 'Application approved', tone: 'success' },
  REJECTED: { icon: FileWarning, title: 'Application not approved', tone: 'warning' },
};

export function ApplicationStatusPage() {
  const [application, setApplication] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    partnerApi
      .getApplication()
      .then((result) => !cancelled && setApplication(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!application) return <FullPageSpinner label="Loading your application" />;

  const meta = STATUS_META[application.status] ?? STATUS_META.DRAFT;
  const Icon = meta.icon;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader title="Your partner application" description={application.propertyName} />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-muted)] text-[var(--text-muted)]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>{meta.title}</CardTitle>
              <CardDescription>Business: {application.businessName}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {application.status === 'DRAFT' && (
            <>
              <Alert tone="info">Upload your verification documents and submit your application to begin the review.</Alert>
              <Link to="/partner/documents"><Button className="w-full">Continue application</Button></Link>
            </>
          )}
          {application.status === 'PENDING_REVIEW' && (
            <Alert tone="info">Our team is reviewing your application. We'll notify you by email once a decision is made.</Alert>
          )}
          {application.status === 'APPROVED' && (
            <>
              <Alert tone="success">Your application has been approved. You can now add your property and start managing bookings.</Alert>
              <Link to="/admin/dashboard"><Button className="w-full">Go to dashboard</Button></Link>
            </>
          )}
          {application.status === 'REJECTED' && (
            <>
              <Alert tone="warning" title="Reason">{application.rejectionReason}</Alert>
              <Link to="/partner/documents"><Button className="w-full">Update and resubmit</Button></Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
