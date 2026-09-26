import React from 'react';
import { useApp } from '../context/AppContext';
import { ReviewCard } from '../components/review/ReviewCard';
import { Button } from '../components/ui/Button';
import { PhosphorIcon } from '../components/ui/PhosphorIcon';

export function ReviewsPage() {
  const {
    reviewQueue,
    submitReviewDecision,
    setSelectedEmailId,
    setActiveTab,
  } = useApp();

  const handleSelect = (emailId) => {
    setSelectedEmailId(emailId);
    setActiveTab('detail');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Human Review Desk
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200">
              {reviewQueue.length} Pending
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Resolve data discrepancies, verify OCR uncertainties, and authorize release for flagged shipments
          </p>
        </div>
      </div>

      {/* Review Queue Items */}
      {reviewQueue.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <PhosphorIcon name="CheckCircle" size={24} weight="duotone" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">
            Review Queue Clear
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No shipping instructions or bills of lading currently require human intervention. All cases have been verified.
          </p>
          <Button variant="outline" size="sm" onClick={() => setActiveTab('emails')}>
            Explore All Inboxes
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {reviewQueue.map((email) => (
            <ReviewCard
              key={email.id}
              email={email}
              onResolve={submitReviewDecision}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ReviewsPage;
