import { describe, expect, it } from 'vitest'
import * as t from './engine'

const P = {
  title: 'Тест', rounds: 2, break_seconds: 60,
  blocks: [{ title: 'Работа', seconds: 10, color: '#30a46c' }, { title: 'Отдых', seconds: 5, color: '#3e7bfa' }],
  sound_start: 'bell', sound_end: 'gong', auto_continue: true, auto_delay: 5, voice: true,
}
const S = 1000

describe('buildSteps / totalSeconds', () => {
  it('разворачивает блоки по кругам, перерыв — только между кругами', () => {
    const steps = t.buildSteps(P)
    expect(steps.map((s) => s.title)).toEqual(['Работа', 'Отдых', 'Перерыв между кругами', 'Работа', 'Отдых'])
    expect(steps.map((s) => s.round)).toEqual([1, 1, 1, 2, 2])
    expect(t.totalSeconds(P)).toBe(2 * 15 + 60)
  })

  it('стандартный шаблон «Учёба» длится 3:40:00, как в образце', () => {
    const study = t.DEFAULT_PRESETS.find((p) => p.title === 'Учёба')
    expect(t.formatTime(t.totalSeconds(study) * S)).toBe('3:40:00')
  })

  it('быстрый старт без отдыха состоит из одного блока', () => {
    expect(t.quickPreset({ rounds: 8, work: 90, rest: 0 }).blocks).toHaveLength(1)
    expect(t.totalSeconds(t.quickPreset({ rounds: 8, work: 90, rest: 30 }))).toBe(8 * 120)
  })
})

describe('автопродолжение после звукового сигнала', () => {
  it('шаг → пауза auto_delay → следующий шаг', () => {
    let s = t.start(P, 0)
    expect(t.remaining(s, 4 * S)).toBe(6 * S)

    let r = t.tick(s, 10 * S)
    expect(r.state.phase).toBe('transition')
    expect(r.events).toEqual([{ type: 'step-end', step: s.steps[0], last: false }])
    expect(t.remaining(r.state, 12 * S)).toBe(3 * S)

    r = t.tick(r.state, 15 * S)
    expect(r.state.phase).toBe('running')
    expect(r.state.index).toBe(1)
    expect(r.events[0]).toMatchObject({ type: 'step-start', index: 1 })
  })

  it('после долгого отсутствия догоняет время, отсчитывая шаги друг от друга', () => {
    const s = t.start(P, 0)
    // 10 (работа) + 5 (пауза) + 5 (отдых) + 5 (пауза) = 25 с → идёт перерыв между кругами
    const r = t.tick(s, 26 * S)
    expect(r.state.index).toBe(2)
    expect(r.state.phase).toBe('running')
    expect(t.remaining(r.state, 26 * S)).toBe(59 * S)
  })

  it('последний шаг завершает таймер', () => {
    let s = t.start({ ...P, rounds: 1 }, 0)
    s = t.skip(s, 1 * S).state
    const r = t.tick(s, 7 * S)
    expect(r.state.phase).toBe('finished')
    expect(r.events.map((e) => e.type)).toEqual(['step-end', 'finished'])
  })
})

describe('режим «ждать ОК»', () => {
  const manual = { ...P, auto_continue: false }

  it('после сигнала таймер ждёт, сколько бы времени ни прошло', () => {
    const s = t.start(manual, 0)
    const r = t.tick(s, 10 * S)
    expect(r.state.phase).toBe('waiting')
    expect(t.tick(r.state, 3600 * S).state.phase).toBe('waiting')
  })

  it('«ОК» запускает следующий шаг с текущего момента', () => {
    const waiting = t.tick(t.start(manual, 0), 10 * S).state
    const r = t.confirm(waiting, 100 * S)
    expect(r.state).toMatchObject({ phase: 'running', index: 1, endAt: 105 * S })
  })
})

describe('отложить на 10 минут', () => {
  it('после окончания шага — следующий начнётся через 10 минут', () => {
    const waiting = t.tick(t.start({ ...P, auto_continue: false }, 0), 10 * S).state
    const snoozed = t.snooze(waiting, 20 * S)
    expect(snoozed).toMatchObject({ phase: 'snoozed', resumeMs: null, endAt: 20 * S + 10 * 60 * S })
    const r = t.tick(snoozed, 20 * S + 10 * 60 * S)
    expect(r.state).toMatchObject({ phase: 'running', index: 1 })
  })

  it('во время шага — шаг замирает и продолжается с того же места', () => {
    const s = t.start(P, 0)
    const snoozed = t.snooze(s, 4 * S)
    expect(snoozed.resumeMs).toBe(6 * S)
    expect(t.totalRemaining(snoozed, 4 * S)).toBe(t.totalRemaining(s, 4 * S))
    const r = t.tick(snoozed, 4 * S + 10 * 60 * S)
    expect(r.state).toMatchObject({ phase: 'running', index: 0, endAt: 4 * S + 10 * 60 * S + 6 * S })
    expect(r.events[0].type).toBe('resume')
  })

  it('«Продолжить» прерывает откладывание досрочно', () => {
    const snoozed = t.snooze(t.start(P, 0), 4 * S)
    expect(t.confirm(snoozed, 30 * S).state).toMatchObject({ phase: 'running', index: 0, endAt: 36 * S })
  })
})

describe('пауза', () => {
  it('сохраняет остаток и продолжает с него', () => {
    const paused = t.pause(t.start(P, 0), 3 * S)
    expect(paused).toMatchObject({ phase: 'paused', remainingMs: 7 * S })
    expect(t.tick(paused, 999 * S).state.phase).toBe('paused')
    expect(t.resume(paused, 50 * S)).toMatchObject({ phase: 'running', endAt: 57 * S })
  })
})

describe('форматирование и озвучка', () => {
  it('formatTime', () => {
    expect(t.formatTime(0)).toBe('00:00')
    expect(t.formatTime(90 * S)).toBe('01:30')
    expect(t.formatTime(1500)).toBe('00:02') // округление вверх: 1.5 с показываем как 2
    expect(t.formatTime(13205 * S)).toBe('3:40:05')
  })

  it('склонение минут и секунд', () => {
    expect(t.durationWords(60)).toBe('1 минута')
    expect(t.durationWords(45 * 60)).toBe('45 минут')
    expect(t.durationWords(22 * 60 + 3)).toBe('22 минуты 3 секунды')
    expect(t.durationWords(11 * 60)).toBe('11 минут')
  })

  it('номер круга называется на первом блоке круга', () => {
    const s = t.start(P, 0)
    expect(t.announcement(s, 0)).toBe('Круг 1 из 2. Работа, 10 секунд')
    expect(t.announcement(s, 1)).toBe('Отдых, 5 секунд')
    expect(t.announcement(s, 3)).toBe('Круг 2 из 2. Работа, 10 секунд')
  })
})
