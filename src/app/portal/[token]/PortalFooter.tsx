export default function PortalFooter() {
  return (
    <div className="px-4 sm:px-6 pt-5 pb-28 md:pb-10 shrink-0" style={{ borderTop: '1px solid var(--c-border)' }}>
      <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
        Powered by{' '}
        <a href="https://pneumastudio.mx" target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--c-text-4)' }} className="hover:opacity-80 transition-opacity">
          Pneuma Studio
        </a>
      </span>
    </div>
  );
}
