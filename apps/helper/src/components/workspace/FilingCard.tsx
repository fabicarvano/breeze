import { useI18n } from '../../lib/i18n';
import { useEffect, useRef, useState } from 'react';
import type { FilingRecord, WorkspaceProject } from '../../stores/workspaceStore';
import { toast } from '../ui/Toaster';
import { formatWhen } from './WorkspacePanel';

export interface FilingCardProps {
  filing: FilingRecord;
  projects: WorkspaceProject[];
  busy: boolean;
  onClassify: (fileIndexId: string) => void;
  onAssign: (fileIndexId: string, projectKey: string) => void;
  /**
   * True only for the card most recently dropped onto a ProjectRail entry.
   * Gates the settle animation + toast to the onDrop path per the brief —
   * the pre-existing click-to-file ("File it") and select-to-reassign paths
   * are unaffected, as they were before this card restyle.
   */
  viaDrop?: boolean;
}

/**
 * One unfiled email as a card in the Filing tab. Draggable onto a
 * ProjectRail entry (sets the `text/x-ws-email-id` payload DnD reads);
 * also files via the inline "Sort"/"File it"/reassign-select controls,
 * same as before the card restyle. Only the drag-drop path (`viaDrop`)
 * triggers the settle (fade/collapse) + confirmation toast.
 */
export function FilingCard({ filing, projects, busy, onClassify, onAssign, viaDrop }: FilingCardProps) {
  const t = useI18n();
  const subject = filing.emailMeta?.subject ?? filing.name;
  const decided = filing.status === 'confirmed' || filing.status === 'reassigned';
  const decidedLabel = filing.decidedProjectKey
    ? projects.find((p) => p.key === filing.decidedProjectKey)?.label ?? filing.decidedProjectKey
    : null;

  const wasDecided = useRef(decided);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (decided && !wasDecided.current && viaDrop) {
      setSettling(true);
      toast(t('Filed to {project}', { project: decidedLabel ?? t('project') }));
    }
    wasDecided.current = decided;
  }, [decided, decidedLabel, viaDrop, t]);

  return (
    <div
      className={`ws-filing-card${settling ? ' ws-filing-card-settling' : ''}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/x-ws-email-id', filing.fileIndexId)}
    >
      <span className="ws-filing-card-subject">{subject}</span>
      <span className="ws-filing-card-meta">
        {[filing.emailMeta?.from, formatWhen(filing.emailMeta?.date)].filter(Boolean).join(' · ')}
      </span>

      {decided && (
        <span className="ws-chip ws-chip-success">{t('Filed to:')} {decidedLabel}</span>
      )}
      {!decided && filing.status === 'suggested' && filing.confidence === 'high' && (
        <span className="ws-chip ws-chip-success">
          {t('Filed to:')} {filing.suggestedProjectLabel} — {filing.rationale}
        </span>
      )}
      {!decided && filing.status === 'suggested' && filing.confidence !== 'high' && (
        <>
          <span className="ws-chip ws-chip-warning">
            {filing.suggestedProjectLabel
              ? t('Possibly {project} — {rationale}', { project: filing.suggestedProjectLabel, rationale: filing.rationale ?? '' })
              : t('No clear match — pick a project below.')}
          </span>
          <select
            className="ws-filing-card-select"
            value=""
            onChange={(e) => {
              const key = e.target.value;
              if (key) onAssign(filing.fileIndexId, key);
            }}
            title={t("File to a different project")}
          >
            <option value="">{t("Move to…")}</option>
            {projects.map((p) => (
              <option key={p.key} value={p.key}>
                {p.key} {p.label}
              </option>
            ))}
          </select>
        </>
      )}

      <div className="ws-filing-card-actions">
        {busy && <span className="helper-spinner" />}
        {!busy && filing.status === null && (
          <button
            className="helper-btn helper-btn-sm"
            onClick={() => onClassify(filing.fileIndexId)}
            title={t("Suggest where this email belongs")}
          >
            {t("Sort")}
          </button>
        )}
        {!busy && filing.status === 'suggested' && filing.suggestedProjectKey && (
          <button
            className="ws-btn-accent"
            onClick={() => onAssign(filing.fileIndexId, filing.suggestedProjectKey!)}
            title={t("File to the suggested project")}
          >
            {t("File it")}
          </button>
        )}
      </div>
    </div>
  );
}
