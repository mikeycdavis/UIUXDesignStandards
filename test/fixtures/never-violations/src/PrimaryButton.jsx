export function PrimaryButton({ children, onClick }) {
  return (
    <button type="button" className="primary" onClick={onClick}>
      {children}
    </button>
  );
}
