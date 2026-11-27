// Галочка — рисуется линией, при отметке «прочерчивается» (см. .check-icon в styles.css)
export function CheckIcon() {
  return (
    <svg className="check-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  )
}

// Чекбокс приложения. С label кликабельна вся строка (квадрат + текст).
// size="sm" — маленький (в карточках дневника), color — свой цвет отметки (например, цвет привычки).
export default function Checkbox({ checked, onChange, label, size, color, disabled, title, className = '' }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ? undefined : title}
      title={title}
      disabled={disabled}
      className={`checkbox ${checked ? 'checked' : ''} ${size === 'sm' ? 'checkbox-sm' : ''} ${className}`}
      onClick={(e) => { e.stopPropagation(); onChange?.(!checked) }}
    >
      <span className="checkbox-box" style={checked && color ? { background: color, borderColor: color } : undefined}>
        <CheckIcon />
      </span>
      {label && <span className="checkbox-text">{label}</span>}
    </button>
  )
}
