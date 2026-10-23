import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, ExternalLink } from 'lucide-react';
import { Alert, Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Skeleton } from '@/components/ui/surfaces.jsx';
import { Textarea } from '@/components/ui/form-controls.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmDialog, Modal } from '@/components/ui/dialog.jsx';
import { BackLink, PageHeader, formatDateTime } from '@/components/shared/index.jsx';
import { DOCUMENT_TYPE_OPTIONS } from '@/features/partner/schemas.js';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const STATUS_TONE = { DRAFT: 'neutral', PENDING_REVIEW: 'warning', APPROVED: 'success', REJECTED: 'danger' };
const DOC_LABELS = Object.fromEntries(DOCUMENT_TYPE_OPTIONS.map((option) => [option.value, option.label]));

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-medium text-[var(--text-strong)]">{value || '—'}</p>
    </div>
  );
}

export function PartnerApplicationDetailPage() {
  const { userId } = useParams();
  const [application, setApplication] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [approving, setApproving] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getPartnerApplication(userId)
      .then((result) => !cancelled && setApplication(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const viewDocument = async (docId) => {
    try {
      const blob = await adminApi.partnerDocumentBlob(userId, docId);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch (err) {
      setActionError(normalizeError(err).message);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    setActionError(null);
    try {
      const updated = await adminApi.approvePartnerApplication(userId);
      setApplication(updated);
      setConfirmApprove(false);
    } catch (err) {
      setActionError(normalizeError(err).message);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    setActionError(null);
    try {
      const updated = await adminApi.rejectPartnerApplication(userId, rejectReason);
      setApplication(updated);
      setShowReject(false);
      setRejectReason('');
    } catch (err) {
      setActionError(normalizeError(err).message);
    } finally {
      setRejecting(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink to="/admin/partners">Partner Applications</BackLink>
        <Alert tone="error">{error}</Alert>
      </div>
    );
  }
  if (!application) {
    return <div className="space-y-4">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-24 w-full" />)}</div>;
  }

  const canDecide = application.status === 'PENDING_REVIEW';

  return (
    <div className="space-y-6">
      <BackLink to="/admin/partners">Partner Applications</BackLink>
      <PageHeader
        title={application.businessName}
        description={`${application.propertyName} · ${application.propertyCity}`}
        actions={<Badge tone={STATUS_TONE[application.status] ?? 'neutral'}>{application.status.replaceAll('_', ' ')}</Badge>}
      />

      {actionError && <Alert tone="error">{actionError}</Alert>}
      {application.status === 'REJECTED' && application.rejectionReason && (
        <Alert tone="warning" title="Rejection reason">{application.rejectionReason}</Alert>
      )}

      <Card>
        <CardHeader><CardTitle>Business details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <InfoRow label="Business type" value={application.businessType?.replaceAll('_', ' ')} />
          <InfoRow label="GSTIN" value={application.gstin} />
          <InfoRow label="PAN" value={application.pan} />
          <InfoRow label="Contact phone" value={application.contactPhone} />
          <InfoRow label="Submitted" value={formatDateTime(application.submittedAt)} />
          <InfoRow label="Reviewed" value={formatDateTime(application.reviewedAt)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Property details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <InfoRow label="Property name" value={application.propertyName} />
          <InfoRow label="City" value={application.propertyCity} />
          <InfoRow label="Estimated rooms" value={application.estimatedRooms} />
          <InfoRow label="Address" value={application.propertyAddress} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Verification documents</CardTitle><CardDescription>Only visible to administrators and the applicant.</CardDescription></CardHeader>
        {application.documents.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-[var(--text-muted)]">No documents uploaded yet.</p>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {application.documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-muted)] text-[var(--text-muted)]"><FileText className="h-4 w-4" /></span>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-strong)]">{DOC_LABELS[doc.docType] ?? doc.docType}</p>
                    <p className="text-xs text-[var(--text-muted)]">Uploaded {formatDateTime(doc.uploadedAt)}</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => viewDocument(doc.id)}>
                  View <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {canDecide && (
        <Card>
          <CardHeader><CardTitle>Decision</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={() => setConfirmApprove(true)}>Approve application</Button>
            <Button variant="danger-outline" onClick={() => setShowReject(true)}>Reject application</Button>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmApprove}
        title="Approve this partner?"
        description="They will be able to add their property and manage rooms, rates and bookings."
        confirmLabel="Approve"
        tone="primary"
        loading={approving}
        onConfirm={handleApprove}
        onCancel={() => setConfirmApprove(false)}
      />

      <Modal open={showReject} title="Reject application" onClose={() => setShowReject(false)}>
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">This reason is shared with the applicant.</p>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Explain what needs to be corrected" />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowReject(false)} disabled={rejecting}>Cancel</Button>
            <Button variant="danger" onClick={handleReject} loading={rejecting} disabled={!rejectReason.trim()}>Reject</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
