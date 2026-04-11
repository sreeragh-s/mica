import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type JSX
} from 'react'

import { cn } from '@/lib/utils'

export function NoteTitleInput({
  value,
  onChange,
  className
}: {
  value: string
  onChange: (nextValue: string) => void
  className?: string
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    setDraft(value)
    setError(null)
  }, [value])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [draft])

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const nextValue = event.target.value
    setDraft(nextValue)
    if (error && nextValue.trim()) {
      setError(null)
    }
  }

  const commitDraft = (): void => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setError('Title cannot be empty')
      setDraft(value)
      return
    }
    if (trimmed !== value) {
      onChange(trimmed)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
      textareaRef.current?.blur()
    }
  }

  return (
    <div className="shrink-0">
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={handleChange}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        placeholder="Untitled"
        spellCheck={false}
        rows={1}
        className={cn(
          'text-foreground placeholder:text-muted-foreground w-full resize-none overflow-hidden border-0 bg-transparent px-8 pt-8 pb-3 text-3xl font-extrabold tracking-tight whitespace-pre-wrap break-words outline-none',
          'leading-tight focus-visible:ring-0 lg:text-4xl',
          className
        )}
      />
      {error ? <p className="text-destructive px-8 pb-2 text-sm">{error}</p> : null}
    </div>
  )
}
