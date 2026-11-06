type CommunicationChannels = {
  contactPhone?: string;
  whatsapp?: string;
  telegram?: string;
};

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidPhoneNumber(value: string) {
  return /^\+960[\s-]?\d{7}$/.test(value.trim());
}

export function isValidTelegramContact(value: string) {
  const telegram = value.trim();
  return /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegram) || isValidPhoneNumber(telegram);
}

export function hasCompleteCommunicationChannels(contact: CommunicationChannels) {
  const phone = contact.contactPhone?.trim() ?? '';
  const whatsapp = contact.whatsapp?.trim() ?? '';
  const telegram = contact.telegram?.trim() ?? '';
  return isValidPhoneNumber(phone) && isValidPhoneNumber(whatsapp) && isValidTelegramContact(telegram);
}

export function requiresCommunicationChannels(stageName: string) {
  const stage = stageName.toLowerCase();
  return ['tender', 'quotation', 'quote', 'comparative', 'presentation'].some((term) => stage.includes(term));
}
