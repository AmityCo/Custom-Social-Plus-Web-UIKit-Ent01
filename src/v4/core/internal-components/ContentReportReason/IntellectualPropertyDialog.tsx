import React, { useEffect, useRef, useState } from 'react';
import { Typography } from '~/v4/core/components';
import { Button } from '~/v4/core/components/AriaButton';
import { useAmityElement } from '~/v4/core/hooks/uikit';
import { useString } from '~/v4/core/localization';
import { type IntellectualPropertyReportContext } from '~/v4/core/providers/PageBehaviorProvider';
import Check from '~/v4/icons/Check';
import Copy from '~/v4/icons/Copy';
import { uniqueId } from '~/v4/utils/uniqueId';
import styles from './IntellectualPropertyDialog.module.css';

// The dialog's elements are configured under the report sheet's own component,
// whichever post or comment component opened it.
const COMPONENT_ID = 'content_report_reason';

const TITLE_KEY: Record<IntellectualPropertyReportContext['contentType'], string> = {
  post: 'amity_social_report_ip_dialog_title_post',
  comment: 'amity_social_report_ip_dialog_title_comment',
  reply: 'amity_social_report_ip_dialog_title_reply',
};

type IntellectualPropertyDialogProps = IntellectualPropertyReportContext & {
  pageId?: string;
  isOpen: boolean;
  /** Without it there is no Continue button: the guest copies and closes. */
  onContinue?: () => void;
  onCancel: () => void;
};

/**
 * Shown after a successful intellectual property report: the claim itself is
 * filed on the host's policy page, so this hands the guest the content ID to
 * paste there.
 *
 * A native <dialog> opened with showModal(), rendered inside the report sheet.
 * The browser's top layer puts it over the whole page, although the mobile
 * drawer's transform would otherwise trap anything fixed inside it. Staying
 * inside the sheet's DOM keeps it within the focus trap of both the drawer
 * (vaul) and the desktop modal (react-aria).
 */
export const IntellectualPropertyDialog = ({
  pageId = '*',
  isOpen,
  contentId,
  contentType,
  onContinue,
  onCancel,
}: IntellectualPropertyDialogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentIdRef = useRef<HTMLSpanElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // Continue, Cancel, Escape and the backdrop each end the dialog; only the
  // first one counts, so the host is never called twice.
  const isClosingRef = useRef(false);
  const [ids] = useState(() => {
    const prefix = uniqueId('intellectual_property_dialog');
    return { title: `${prefix}-title`, description: `${prefix}-description` };
  });
  const [isCopied, setIsCopied] = useState(false);

  const descriptionElement = useAmityElement({
    pageId,
    componentId: COMPONENT_ID,
    elementId: 'intellectual_property_description',
  });
  const copyButtonElement = useAmityElement({
    pageId,
    componentId: COMPONENT_ID,
    elementId: 'copy_content_id_button',
  });
  const policyButtonElement = useAmityElement({
    pageId,
    componentId: COMPONENT_ID,
    elementId: 'intellectual_property_policy_button',
  });

  const title = useString(TITLE_KEY[contentType]);
  const contentIdLabel = useString('amity_social_report_ip_dialog_content_id');
  const copyText = useString('amity_social_report_ip_dialog_copy');
  const copiedText = useString('amity_social_report_ip_dialog_copied');
  const cancelText = useString('amity_social_report_ip_dialog_cancel');
  const closeText = useString('amity_social_modal_dialog_close_button');
  // Both name the host's own policy, so the config can reword them.
  const description = descriptionElement.resolveText('amity_social_report_ip_dialog_description');
  const continueText = policyButtonElement.resolveText('amity_social_report_ip_dialog_continue');
  const copyLabel = isCopied ? copiedText : copyText;

  const restoreFocus = () => {
    const element = returnFocusRef.current;
    returnFocusRef.current = null;
    if (element?.isConnected) element.focus();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      isClosingRef.current = false;
      setIsCopied(false);
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      // The dialog itself, so its title and description are read first.
      dialog.focus();
    } else if (!isOpen && dialog.open) {
      dialog.close();
      restoreFocus();
    }
  }, [isOpen]);

  // Usually the sheet unmounts along with the dialog. Its own container then
  // returns focus, so this only matters if the element is still on the page.
  useEffect(() => restoreFocus, []);

  const finish = (callback: () => void) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    callback();
  };

  // A close request the keyboard handler below did not see, such as the
  // Android back gesture. The dialog stays open until the parent closes it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      finish(onCancel);
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onCancel]);

  const selectContentId = () => {
    const node = contentIdRef.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const copyContentId = async () => {
    try {
      await navigator.clipboard.writeText(contentId);
      setIsCopied(true);
    } catch {
      // No clipboard access (a page not served over https, or permission
      // denied): select the ID so the guest can copy it themselves.
      selectContentId();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ids.title}
      aria-describedby={ids.description}
      className={styles.dialog}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        // Handled here so the report sheet's own modal does not close only
        // itself; this closes both.
        event.preventDefault();
        event.stopPropagation();
        finish(onCancel);
      }}
      // Clicks on the backdrop land on the dialog itself; the card fills it.
      onClick={(event) => event.target === event.currentTarget && finish(onCancel)}
      // Otherwise the mobile drawer reads a press here as the start of a drag.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className={styles.dialog__card}>
        <Typography.TitleBold id={ids.title} className={styles.dialog__title}>
          {title}
        </Typography.TitleBold>
        <Typography.Caption
          as="p"
          id={ids.description}
          data-testid={descriptionElement.accessibilityId}
          className={styles.dialog__description}
        >
          {description}
        </Typography.Caption>
        <Typography.CaptionBold as="p" className={styles.dialog__contentIdLabel}>
          {contentIdLabel}
        </Typography.CaptionBold>
        <div className={styles.dialog__contentIdBox}>
          {/* Never truncated: the guest has to read or paste all of it. On a
              narrow screen it wraps instead. */}
          <span ref={contentIdRef} className={styles.dialog__contentId}>
            {contentId}
          </span>
          <Button
            variant="text"
            color="primary"
            size="small"
            data-testid={copyButtonElement.accessibilityId}
            aria-label={`${copyLabel} ${contentIdLabel}`}
            className={styles.dialog__copyButton}
            onPress={copyContentId}
          >
            {isCopied ? (
              <Check className={styles.dialog__copyIcon} />
            ) : (
              <Copy className={styles.dialog__copyIcon} />
            )}
            {/* Both labels are laid out, one hidden, so the button keeps its
                width when it changes to "Copied" and the ID does not re-wrap. */}
            <span className={styles.dialog__copyLabel}>
              <Typography.CaptionBold data-visible={!isCopied}>{copyText}</Typography.CaptionBold>
              <Typography.CaptionBold data-visible={isCopied}>{copiedText}</Typography.CaptionBold>
            </span>
          </Button>
        </div>
        {onContinue && (
          <Button
            fullWidth
            data-testid={policyButtonElement.accessibilityId}
            className={styles.dialog__continueButton}
            onPress={() => finish(onContinue)}
          >
            <Typography.BodyBold className={styles.dialog__continueLabel}>
              {continueText}
            </Typography.BodyBold>
          </Button>
        )}
        <Button
          variant="text"
          color="primary"
          fullWidth
          data-alone={!onContinue}
          className={styles.dialog__cancelButton}
          onPress={() => finish(onCancel)}
        >
          {/* With no Continue there is nothing to cancel: the button only closes. */}
          <Typography.BodyBold>{onContinue ? cancelText : closeText}</Typography.BodyBold>
        </Button>
      </div>
    </dialog>
  );
};
