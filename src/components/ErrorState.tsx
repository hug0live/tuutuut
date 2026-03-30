type ErrorStateProps = {
  title?: string;
  message: string;
  compact?: boolean;
};

export function ErrorState({
  title = "Une erreur est survenue",
  message,
  compact = false
}: ErrorStateProps): JSX.Element {
  return (
    <div className={`error-state${compact ? " error-state--compact" : ""}`} role="status">
      <p className="error-state__title">{title}</p>
      <p className="error-state__message">{message}</p>
    </div>
  );
}
