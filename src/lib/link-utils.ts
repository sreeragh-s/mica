const HAS_SCHEME_RE = /^[a-z][a-z\d+.-]*:/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE =
  /^(localhost(?::\d+)?|(?:[\p{L}\p{N}-]+\.)+[\p{L}\p{N}-]{2,})(?:[/?#]\S*)?$/iu;
const PHONE_RE = /^\+?[\d\s().-]{3,}$/;
const WORKSPACE_PATH_RE = /^[^\s?<>|*"][^\s?<>|*"]*$/;

export function normalizeLinkInput(input: string) {
  const value = input.trim();

  if (!value || value.startsWith('/') || value.startsWith('#')) {
    return value;
  }

  if (HAS_SCHEME_RE.test(value)) {
    return value;
  }

  if (EMAIL_RE.test(value)) {
    return `mailto:${value}`;
  }

  if (PHONE_RE.test(value) && /\d{3,}/.test(value)) {
    return `tel:${value}`;
  }

  if (DOMAIN_RE.test(value)) {
    return `https://${value}`;
  }

  return value;
}

export function isLinkInputValid(input: string) {
  const value = input.trim();

  if (!value) {
    return false;
  }

  if (value.startsWith('/') || value.startsWith('#')) {
    return true;
  }

  if (HAS_SCHEME_RE.test(value)) {
    return true;
  }

  if (EMAIL_RE.test(value)) {
    return true;
  }

  if (PHONE_RE.test(value) && /\d{3,}/.test(value)) {
    return true;
  }

  if (DOMAIN_RE.test(value)) {
    return true;
  }

  return WORKSPACE_PATH_RE.test(value) && value.includes('.');
}
