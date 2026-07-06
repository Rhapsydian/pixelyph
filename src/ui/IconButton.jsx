// Shared icon-only button: centralizes the tooltip (native `title`,
// consistent with existing usage elsewhere in the codebase), active/
// disabled wiring, and the `.icon-btn` class's hover/active/focus states —
// every tool/frame/layer icon button behaves identically through this.

export function IconButton({ icon, label, active = false, disabled = false, onClick, onContextMenu }) {
  return (
    <button
      type="button"
      className={active ? 'icon-btn active' : 'icon-btn'}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {icon}
    </button>
  );
}
