import { AlertDialog, Host, Text, TextButton } from '@expo/ui/jetpack-compose';

interface RemoveDialogProps {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function RemoveDialog({ visible, title, message, onConfirm, onDismiss }: RemoveDialogProps) {
  if (!visible) return null;

  return (
    <Host matchContents>
      <AlertDialog onDismissRequest={onDismiss}>
        <AlertDialog.Title>
          <Text>{title}</Text>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <Text>{message}</Text>
        </AlertDialog.Text>
        <AlertDialog.ConfirmButton>
          <TextButton onClick={onConfirm}>
            <Text>Remove</Text>
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
