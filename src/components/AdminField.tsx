import type { InputHTMLAttributes, ReactNode } from 'react'

type AdminFieldProps = {
  label: string
  children: ReactNode
  className?: string
  hideLabel?: boolean
}

export function AdminField({ label, children, className = '', hideLabel = false }: AdminFieldProps) {
  return (
    <label className={`admin-field ${className}`.trim()}>
      <span className={hideLabel ? 'sr-only' : undefined}>{label}</span>
      {children}
    </label>
  )
}

type FieldInputWrapProps = {
  children: ReactNode
  icon?: ReactNode
  trailing?: ReactNode
  className?: string
}

export function FieldInputWrap({
  children,
  icon,
  trailing,
  className = '',
}: FieldInputWrapProps) {
  return (
    <div className={`field-input-wrap ${className}`.trim()}>
      {icon}
      {children}
      {trailing}
    </div>
  )
}

type FieldInputProps = InputHTMLAttributes<HTMLInputElement>

export function FieldInput(props: FieldInputProps) {
  return (
    <FieldInputWrap>
      <input {...props} />
    </FieldInputWrap>
  )
}
