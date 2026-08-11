export function PrimaryButtonLegacy({ children, onClick }) {
  return (
    <button type="button" className="btn btn-primary" onClick={onClick}>
      {children}
    </button>
  );
}
