export const ROLES = {
  admin:     'admin',
  formateur: 'formateur',
}

const SESSION_KEY = 'pls_session'

const DEMO_USERS = {
  'demo@pennylane.com': {
    password: 'demo2026',
    user: { id: 'demo-admin', email: 'demo@pennylane.com', nom: 'Demo', prenom: 'Admin', role: 'admin' },
  },
  'formateur@demo.com': {
    password: 'demo2026',
    user: { id: 'demo-formateur', email: 'formateur@demo.com', nom: 'Demo', prenom: 'Formateur', role: 'formateur' },
  },
}

export async function login(email, password) {
  const demo = DEMO_USERS[email.toLowerCase()]
  if (demo && demo.password === password) {
    const data = { token: 'demo-token', user: demo.user }
    localStorage.setItem(SESSION_KEY, JSON.stringify(data))
    return demo.user.role
  }
  throw new Error('Email ou mot de passe incorrect.')
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

export function getCurrentUser() {
  return getSession()?.user || null
}

export function isAdmin() {
  return getCurrentUser()?.role === ROLES.admin
}

export function isFormateur() {
  const role = getCurrentUser()?.role
  return role === ROLES.formateur || role === ROLES.admin
}
