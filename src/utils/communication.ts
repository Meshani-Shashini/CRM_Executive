type CommunicationChannels = {
  contactPhone?: string;
  whatsapp?: string;
  telegram?: string;
};

export function isValidPhoneNumber(value: string) {
  const phone = value.trim();
  const digitCount = phone.replace(/\D/g, '').length;
  return /^[+()\d\s-]+$/.test(phone) && digitCount >= 7 && digitCount <= 15;
}

export function hasCompleteCommunicationChannels(contact: CommunicationChannels) {
  const phone = contact.contactPhone?.trim() ?? '';
  const whatsapp = contact.whatsapp?.trim() ?? '';
  const telegram = contact.telegram?.trim() ?? '';
  const validTelegram = /^@?[A-Za-z0-9_]{5,32}$/.test(telegram) || isValidPhoneNumber(telegram);
  return isValidPhoneNumber(phone) && isValidPhoneNumber(whatsapp) && validTelegram;
}

export function requiresCommunicationChannels(stageName: string) {
  const stage = stageName.toLowerCase();
  return ['tender', 'quotation', 'quote', 'comparative', 'presentation'].some((term) => stage.includes(term));
}
