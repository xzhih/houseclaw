type DeleteRowProps = {
  /** Localized label, e.g. "删除墙". */
  label: string;
  onConfirm: () => void;
};

/** Bottom-of-editor delete action. Single click commits — no confirm dialog,
 *  the user can Cmd+Z to undo. Visually subdued to discourage misclicks. */
export function DeleteRow({ label, onConfirm }: DeleteRowProps) {
  return (
    <button
      type="button"
      className="chrome-delete-row"
      onClick={onConfirm}
    >
      {label}
    </button>
  );
}
