import { ImgHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type LogoProps = ImgHTMLAttributes<HTMLImageElement>

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
