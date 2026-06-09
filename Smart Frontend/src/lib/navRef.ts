type NavigateFn = (to: string) => void

let _navigate: NavigateFn = (to) => {
  window.location.href = to
}

export function setNavigate(fn: NavigateFn): void {
  _navigate = fn
}

export function navigateTo(to: string): void {
  _navigate(to)
}
