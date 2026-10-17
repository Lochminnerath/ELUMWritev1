import type { Editor } from '@tiptap/core';
import { Link2, Unlink } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Popover } from '../../components/Popover';
import { keyLabel } from '../keys';
import { normalizeUrl } from '../format';

const keep = (e: { preventDefault: () => void }) => e.preventDefault();

interface LinkPopoverProps {
  editor: Editor;
  active: boolean;
  href: string | null;
  empty: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkPopover({ editor, active, href, empty, open, onOpenChange }: LinkPopoverProps) {
  return (
    <Popover
      label="Link"
      open={open}
      onOpenChange={onOpenChange}
      restoreFocus={false}
      className="link-popover"
      trigger={(props) => (
        <button
          type="button"
          className="icon-btn"
          aria-label="Link"
          aria-pressed={active}
          data-tip={`Link (${keyLabel('Mod+K')})`}
          onMouseDown={keep}
          {...props}
        >
          <Link2 size={18} strokeWidth={1.75} />
        </button>
      )}
    >
      {(close) => <LinkForm editor={editor} active={active} href={href} askText={empty && !active} onDone={close} />}
    </Popover>
  );
}

function LinkForm({
  editor,
  active,
  href,
  askText,
  onDone,
}: {
  editor: Editor;
  active: boolean;
  href: string | null;
  askText: boolean;
  onDone: () => void;
}) {
  const [url, setUrl] = useState(href ?? '');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const target = normalizeUrl(url);
    if (!target) {
      setError('Enter a web address, email or phone link.');
      return;
    }
    const chain = editor.chain().focus();
    if (askText) {
      chain.insertContent({ type: 'text', text: text.trim() || url.trim(), marks: [{ type: 'link', attrs: { href: target } }] }).run();
    } else {
      chain.extendMarkRange('link').setLink({ href: target }).run();
    }
    onDone();
  };

  return (
    <form className="link-form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Link to</span>
        <input
          className="input input--sm"
          data-autofocus
          value={url}
          placeholder="Paste or type a link"
          aria-invalid={!!error}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
        />
      </label>
      {askText && (
        <label className="field">
          <span className="field-label">Text to show</span>
          <input className="input input--sm" value={text} placeholder="Optional" onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      {error && <span className="field-error">{error}</span>}
      <div className="link-form__actions">
        {active && (
          <button
            type="button"
            className="elum-btn elum-btn--quiet elum-btn--sm"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              onDone();
            }}
          >
            <Unlink size={16} strokeWidth={1.75} /> Remove
          </button>
        )}
        <button type="submit" className="elum-btn elum-btn--primary elum-btn--sm" disabled={!url.trim()}>
          Apply
        </button>
      </div>
    </form>
  );
}
