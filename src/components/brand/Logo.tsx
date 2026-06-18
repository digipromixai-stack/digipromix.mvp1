import { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type LogoProps = HTMLAttributes<HTMLImageElement>

export function Logo({ className, alt = 'DigiPromix AI', ...props }: LogoProps) {
  return (
    <img
      src="/digipromix-logo.png"
      alt={alt}
      className={cn('object-contain shrink-0', className)}
      {...props}
    />
  )
}
