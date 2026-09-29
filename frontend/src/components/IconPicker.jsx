import { useEffect, useRef, useState } from 'react'

export const ICON_GROUPS = {
  'Здоровье': ['💧', '🥗', '🍎', '😴', '💊', '🦷', '🚭', '🧴'],
  'Спорт': ['🏃', '💪', '🚴', '🏊', '🧘', '⚽', '🏋️', '🚶'],
  'Учёба и работа': ['📚', '✍️', '🗣️', '💻', '🎯', '🧠', '📝', '⏰'],
  'Дом и быт': ['🧹', '🍳', '🪴', '🛏️', '🧺', '💰', '🛒', '🐶'],
  'Разное': ['✅', '⭐', '🔥', '🎸', '🎨', '📵', '☀️', '❤️'],
}

// Выбор иконки: готовые эмодзи по группам + своя (любой эмодзи или символ)
export default function IconPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const pick = (icon) => {
    onChange(icon)
    setOpen(false)
  }

  const applyCustom = () => {
    const icon = custom.trim()
    if (!icon) return
    pick(icon)
    setCustom('')
  }

  return (
    <div className="icon-picker" ref={ref}>
      <button type="button" className="icon-picker-btn" onClick={() => setOpen(!open)} title="Выбрать иконку">
        {value}
      </button>
      {open && (
        <div className="icon-popover">
          {Object.entries(ICON_GROUPS).map(([group, icons]) => (
            <div key={group}>
              <div className="small muted">{group}</div>
              <div className="icon-grid">
                {icons.map((icon) => (
                  <button type="button" key={icon} className={`icon-option ${icon === value ? 'active' : ''}`} onClick={() => pick(icon)}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="stack" style={{ gap: 6 }}>
            <div className="small muted">Своя иконка</div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                className="input"
                placeholder="Вставьте эмодзи"
                maxLength={16}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCustom() } }}
              />
              <button type="button" className="btn" onClick={applyCustom} disabled={!custom.trim()}>OK</button>
            </div>
            <div className="small muted">Подсказка: Win + . открывает панель эмодзи</div>
          </div>
        </div>
      )}
    </div>
  )
}
