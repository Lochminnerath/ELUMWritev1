import type { Editor } from '@tiptap/core';
import { WarningIcon } from '../components/icons/ElumIcons';
import { Dialog } from '../components/Dialog';
import { countDocument } from './exporters';
import { keyLabel, SHORTCUTS } from './keys';

export function WordCountDialog({ open, onClose, editor }: { open: boolean; onClose: () => void; editor: Editor }) {
  const { counts, selection } = open ? countDocument(editor) : { counts: null, selection: false };
  const fmt = (n: number) => n.toLocaleString();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Word count"
      description={selection ? 'For the text you selected.' : 'For the whole document.'}
      width={380}
      footer={
        <button type="button" className="elum-btn elum-btn--primary" onClick={onClose}>
          Done
        </button>
      }
    >
      {counts && (
        <dl className="counts">
          <div>
            <dt>Words</dt>
            <dd className="mono">{fmt(counts.words)}</dd>
          </div>
          <div>
            <dt>Characters</dt>
            <dd className="mono">{fmt(counts.characters)}</dd>
          </div>
          <div>
            <dt>Characters without spaces</dt>
            <dd className="mono">{fmt(counts.charactersNoSpaces)}</dd>
          </div>
          <div>
            <dt>Paragraphs</dt>
            <dd className="mono">{fmt(counts.paragraphs)}</dd>
          </div>
        </dl>
      )}
    </Dialog>
  );
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" width={720}>
      <div className="shortcuts">
        {SHORTCUTS.map((group) => (
          <section key={group.title}>
            <h3 className="label muted">{group.title}</h3>
            <dl>
              {group.items.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd className="kbd">{keyLabel(item.keys)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

export function ConflictDialog({
  open,
  onLoadLatest,
  onKeepMine,
  onClose,
}: {
  open: boolean;
  onLoadLatest: () => void;
  onKeepMine: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<WarningIcon size={22} strokeWidth={1.75} color="var(--write-deep)" />}
      title="This document changed somewhere else"
      description="Someone, or you in another tab, saved a newer version. Your latest changes are not saved yet."
      width={480}
      footer={
        <>
          <button type="button" className="elum-btn elum-btn--secondary" onClick={onKeepMine}>
            Keep my version
          </button>
          <button type="button" className="elum-btn elum-btn--primary" onClick={onLoadLatest}>
            Load the newer version
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        Keeping your version replaces the newer one. Loading the newer version discards your unsaved changes.
      </p>
    </Dialog>
  );
}
