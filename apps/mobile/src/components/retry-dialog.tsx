import { AlertDialog, Host, Text, TextButton } from '@expo/ui/jetpack-compose';

interface RetryDialogProps {
  visible: boolean;
  /** Title of the episode acted on, held by the caller as a snapshot. */
  episodeTitle: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

/**
 * Long-press menu for a failed watch download.
 *
 * Only offered for an episode the watch has reported as `error`. A download failure is
 * sticky on the watch — its worker skips errored episodes until something clears the flag
 * — and before this the only thing that could was a long-press on the watch itself.
 *
 * The caller passes the title rather than the episode, and keeps showing it while the
 * dialog animates out: the status changes the moment the watch picks the retry up, and a
 * lookup would go undefined underneath the closing dialog.
 */
export function RetryDialog({
  visible,
  episodeTitle,
  onConfirm,
  onDismiss,
}: RetryDialogProps) {
  if (!visible) return null;

  return (
    <Host matchContents>
      <AlertDialog onDismissRequest={onDismiss}>
        <AlertDialog.Title>
          <Text>{episodeTitle}</Text>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <Text>This download failed. Try it again on your watch?</Text>
        </AlertDialog.Text>
        <AlertDialog.ConfirmButton>
          <TextButton onClick={onConfirm}>
            <Text>Retry download</Text>
          </TextButton>
        </AlertDialog.ConfirmButton>
        <AlertDialog.DismissButton>
          <TextButton onClick={onDismiss}>
            <Text>Cancel</Text>
          </TextButton>
        </AlertDialog.DismissButton>
      </AlertDialog>
    </Host>
  );
}
