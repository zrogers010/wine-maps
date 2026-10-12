import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { navigate } from '../router'

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  children: ReactNode
}

/**
 * Anchor that navigates client-side. Modified clicks (new tab, download,
 * middle click) keep default browser behavior.
 */
export function Link({ href, children, onClick, ...rest }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      rest.target === '_blank'
    ) {
      return
    }

    event.preventDefault()
    navigate(href)
  }

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  )
}
