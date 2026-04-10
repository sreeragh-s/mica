import type { JSX } from 'react'
import {
  AlignLeft,
  Calendar,
  Clock,
  CornerDownRight,
  Hash,
  Link,
  MapPin,
  Tag,
  Type,
  User
} from 'lucide-react'

export function PropertyIcon({ propKey }: { propKey: string }): JSX.Element {
  const k = propKey.toLowerCase()
  const cls = 'size-4 shrink-0 text-muted-foreground'
  if (k === 'aliases') return <CornerDownRight className={cls} />
  if (k === 'tags' || k === 'category' || k === 'categories') return <Tag className={cls} />
  if (k.includes('url') || k.includes('link') || k.includes('href') || k === 'source') {
    return <Link className={cls} />
  }
  if (
    k.includes('count') ||
    k.includes('num') ||
    k.includes('rating') ||
    k.includes('order') ||
    k.includes('weight')
  ) {
    return <Hash className={cls} />
  }
  if (
    k.includes('desc') ||
    k.includes('summary') ||
    k.includes('excerpt') ||
    k.includes('abstract')
  ) {
    return <AlignLeft className={cls} />
  }
  if (
    k.includes('author') ||
    k.includes('creator') ||
    k.includes('owner') ||
    k.includes('assign') ||
    k.includes('by')
  ) {
    return <User className={cls} />
  }
  if (
    k.includes('date') ||
    k.includes('created') ||
    k.includes('published') ||
    k.includes('modified') ||
    k.includes('updated')
  ) {
    return <Calendar className={cls} />
  }
  if (k.includes('time') || k.includes('duration') || k.includes('deadline') || k.includes('due')) {
    return <Clock className={cls} />
  }
  if (
    k.includes('location') ||
    k.includes('place') ||
    k.includes('city') ||
    k.includes('country') ||
    k.includes('region')
  ) {
    return <MapPin className={cls} />
  }
  return <Type className={cls} />
}
