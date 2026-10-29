/** HttpOnly Cookie owns the session; CSRF stays in memory. */
const LOCALE_KEY = 'ais_locale'
const API_LOCALE_KEY = 'ais_api_locale'
let csrfToken = ''
let csrfHeader = ''
export function getCsrfToken(): string {
  return csrfToken
}
export function getCsrfHeader(): string {
  return csrfHeader
}
export function setCsrfToken(token: string, header: string): void {
  csrfToken = token
  csrfHeader = header
}
export function clearCsrf(): void {
  csrfToken = ''
  csrfHeader = ''
}
export function clearSession(): void {
  clearCsrf()
  for (const key of ['ais_token', 'ais_csrf', 'ais_session']) {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  }
}
clearSession()

export function getStoredLocale(): string {
  return localStorage.getItem(LOCALE_KEY) ?? ''
}

export function setStoredLocale(locale: string): void {
  localStorage.setItem(LOCALE_KEY, locale)
}

export function getStoredApiLocale(): string {
  return localStorage.getItem(API_LOCALE_KEY) ?? ''
}

export function setStoredApiLocale(locale: string): void {
  localStorage.setItem(API_LOCALE_KEY, locale)
}
