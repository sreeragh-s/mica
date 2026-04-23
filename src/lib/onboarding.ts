const ONBOARDING_KEY = "notelab-onboarding-complete"

export function isOnboardingComplete(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === "1"
}

export function setOnboardingComplete(): void {
  localStorage.setItem(ONBOARDING_KEY, "1")
}
