import { useEffect, useRef, useState } from 'react'

const FLIP_MS = 640

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function FlipDigit({ digit }: { digit: string }) {
  const [current, setCurrent] = useState(digit)
  const [previous, setPrevious] = useState(digit)
  const [flipping, setFlipping] = useState(false)
  const currentRef = useRef(digit)

  useEffect(() => {
    if (digit === currentRef.current) return
    const prev = currentRef.current
    currentRef.current = digit
    if (prefersReducedMotion()) {
      setPrevious(digit)
      setCurrent(digit)
      return
    }
    setPrevious(prev)
    setCurrent(digit)
    setFlipping(true)
    const id = window.setTimeout(() => setFlipping(false), FLIP_MS)
    return () => window.clearTimeout(id)
  }, [digit])

  return (
    <span className={`flip ${flipping ? 'is-flipping' : ''}`} aria-hidden="true">
      <span className="flip-face flip-top">
        <span>{current}</span>
      </span>
      <span className="flip-face flip-bottom">
        <span>{flipping ? previous : current}</span>
      </span>
      {flipping && (
        <>
          <span className="flip-face flip-fold flip-fold-top">
            <span>{previous}</span>
          </span>
          <span className="flip-face flip-fold flip-fold-bottom">
            <span>{current}</span>
          </span>
        </>
      )}
    </span>
  )
}

export function FlipValue({ value }: { value: string }) {
  return (
    <span className="flip-group">
      {value.split('').map((digit, index) => (
        <FlipDigit key={`${index}-${value.length}`} digit={digit} />
      ))}
    </span>
  )
}
