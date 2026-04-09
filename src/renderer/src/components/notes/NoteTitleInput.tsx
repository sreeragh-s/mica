import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    setDraft(value)
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
    onChange(nextValue)
  }

  return (
    <textarea
      ref={textareaRef}
      value={draft}
      onChange={handleChange}
      placeholder="Untitled"
      spellCheck={false}
      rows={1}
      className={cn(
        'text-foreground placeholder:text-muted-foreground w-full resize-none overflow-hidden border-0 bg-transparent px-8 pt-8 pb-3 text-3xl font-extrabold tracking-tight whitespace-pre-wrap break-words outline-none',
        'leading-tight focus-visible:ring-0 lg:text-4xl',
        className
      )}
    />
  )
}
