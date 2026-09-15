const STORAGE_KEY = 'nhih-operator-code'

let operatorCode = typeof sessionStorage === 'undefined' ? '' : (sessionStorage.getItem(STORAGE_KEY) ?? '')

export function getOperatorCode(): string {
  return operatorCode
}

export function setOperatorCode(code: string): void {
  operatorCode = code
  sessionStorage.setItem(STORAGE_KEY, code)
}

export function clearOperatorCode(): void {
  operatorCode = ''
  sessionStorage.removeItem(STORAGE_KEY)
}

export function isOperatorUnlocked(): boolean {
  return Boolean(operatorCode)
}
