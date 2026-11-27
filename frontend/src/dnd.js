// Перетаскивание мышкой на pointer-событиях (без HTML5 drag & drop).
// Встроенный drag & drop в Windows запускает системный цикл перетаскивания, который иногда
// «залипает» — страница перестаёт реагировать на клики. Здесь всё под нашим контролем:
// за курсором едет копия элемента, Escape отменяет перетаскивание.

const THRESHOLD = 5     // на сколько пикселей сдвинуть мышь, чтобы клик стал перетаскиванием
const SCROLL_EDGE = 60  // у края окна страница прокручивается сама
const SCROLL_STEP = 14

// Вызывать из onPointerDown элемента. onStart() — перетаскивание началось,
// onMove(x, y) — курсор сдвинулся, onDrop(x, y) — отпустили, onCancel() — Escape или потеря курсора.
export function beginDrag(e, { onStart, onMove, onDrop, onCancel }) {
  if (e.button !== 0 || e.pointerType === 'touch') return
  if (e.target.closest('button, input, textarea, select, a')) return // клики по чекбоксу и т.п.

  const source = e.currentTarget
  const startX = e.clientX
  const startY = e.clientY
  let ghost = null
  let offset = null
  let last = { x: startX, y: startY }
  let scrollTimer = null

  const autoScroll = () => {
    const dy = last.y < SCROLL_EDGE ? -SCROLL_STEP : last.y > window.innerHeight - SCROLL_EDGE ? SCROLL_STEP : 0
    if (dy) {
      window.scrollBy(0, dy)
      onMove(last.x, last.y)
    }
  }

  const move = (ev) => {
    last = { x: ev.clientX, y: ev.clientY }
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return
      const r = source.getBoundingClientRect()
      offset = { x: startX - r.left, y: startY - r.top }
      ghost = source.cloneNode(true)
      ghost.classList.add('drag-ghost')
      ghost.style.width = `${r.width}px`
      document.body.appendChild(ghost)
      document.body.classList.add('dragging-active')
      scrollTimer = setInterval(autoScroll, 30)
      onStart()
    }
    ghost.style.transform = `translate(${ev.clientX - offset.x}px, ${ev.clientY - offset.y}px) rotate(1.5deg)`
    onMove(ev.clientX, ev.clientY)
  }

  const cleanup = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', key)
    window.removeEventListener('blur', cancel)
    clearInterval(scrollTimer)
    ghost?.remove()
    document.body.classList.remove('dragging-active')
  }

  const up = (ev) => {
    cleanup()
    if (!ghost) return // это был обычный клик
    suppressNextClick()
    onDrop(ev.clientX, ev.clientY)
  }

  const cancel = () => {
    cleanup()
    if (ghost) onCancel?.()
  }

  const key = (ev) => {
    if (ev.key === 'Escape') cancel()
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', key)
  window.addEventListener('blur', cancel)
}

// После перетаскивания браузер присылает click — он не должен открывать карточку
function suppressNextClick() {
  const stop = (ev) => { ev.stopPropagation(); ev.preventDefault() }
  window.addEventListener('click', stop, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0)
}

// На какое место в списке встанет элемент: сколько элементов (кроме перетаскиваемого) выше курсора
export function indexAt(listEl, clientY, selector, excludeId) {
  const els = [...listEl.querySelectorAll(selector)].filter((el) => Number(el.dataset.sortId) !== excludeId)
  let index = 0
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (clientY > r.top + r.height / 2) index++
    else break
  }
  return index
}
