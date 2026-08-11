export function App({ chartUrl }) {
  return (
    <section>
      <h2>Usage</h2>
      <img src={chartUrl} alt="Requests per day over the last month" />
      <button type="button" tabIndex={0} role="button">
        Refresh
      </button>
      <div role="switch" tabIndex={0} onClick={toggle} onKeyDown={toggle} aria-checked="false">
        Live updates
      </div>
    </section>
  );
}
