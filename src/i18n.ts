import { translations, type Lang, type TranslationKey } from './translations'

const STORAGE_KEY = 'murih-lang'
let currentLang: Lang = 'ar'

export function initLang(): void {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'en' || saved === 'ar') currentLang = saved
  applyTranslations()
}

export function setLanguage(lang: Lang): void {
  currentLang = lang
  localStorage.setItem(STORAGE_KEY, lang)
  applyTranslations()
}

export function toggleLanguage(): void {
  setLanguage(currentLang === 'ar' ? 'en' : 'ar')
}

export function t(key: TranslationKey): string {
  return translations[currentLang][key]
}

export function getLang(): Lang {
  return currentLang
}

function applyTranslations(): void {
  const html = document.documentElement
  html.lang = currentLang
  html.dir = currentLang === 'ar' ? 'rtl' : 'ltr'

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n') as TranslationKey
    if (key && translations[currentLang][key]) {
      el.textContent = translations[currentLang][key]
    }
  })

  document.querySelectorAll('select[data-i18n-group]').forEach(select => {
    const group = select.getAttribute('data-i18n-group')
    if (group === 'scale') {
      const options = select.querySelectorAll('option')
      options[0].textContent = t('option15')
      options[1].textContent = t('option2')
      options[2].textContent = t('option3')
      options[3].textContent = t('option4')
    }
  })

  document.title = t('title')

  const toggle = document.getElementById('lang-toggle')
  if (toggle) {
    toggle.textContent = currentLang === 'ar' ? 'EN' : 'AR'
  }
}
