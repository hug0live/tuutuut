type LoadingStateProps = {
  title?: string;
  message?: string;
  compact?: boolean;
};

export function LoadingState({
  title = "Chargement en cours",
  message = "Préparation des données du dashboard...",
  compact = false
}: LoadingStateProps): JSX.Element {
  return (
    <div className={`loading-state${compact ? " loading-state--compact" : ""}`}>
      <div className="loading-state__dot" aria-hidden="true" />
      <div>
        <p className="loading-state__title">{title}</p>
        <p className="loading-state__message">{message}</p>
      </div>
    </div>
  );
}
