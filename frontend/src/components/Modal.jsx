import { useEffect } from 'react'

export default function Modal({ title, children, actions, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        {title && <h2>{title}</h2>}
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  )
}

// Диалог подтверждения опасного действия (удаление, импорт и т.п.)
export function ConfirmDialog({ title, children, confirmLabel = 'Удалить', danger = true, busy, onConfirm, onCancel }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button className="btn" onClick={onCancel} disabled={busy}>Отмена</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Подождите…' : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  )
}
