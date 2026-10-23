type CommunicationChannels = {
  contactPhone?: string;
  whatsapp?: string;
  telegram?: string;
};

function isValidPhone(value: string) {
  const phone = value.trim();
  return /^[+()\d\s-]+$/.test(phone) && phone.replace(/\D/g, '').length >= 7;
}

export function hasCompleteCommunicationChannels(contact: CommunicationChannels) {
  const phone = contact.contactPhone?.trim() ?? '';
  const whatsapp = contact.whatsapp?.trim() ?? '';
  const telegram = contact.telegram?.trim() ?? '';
  const validTelegram = /^@?[A-Za-z0-9_]{5,32}$/.test(telegram) || isValidPhone(telegram);
  return isValidPhone(phone) && isValidPhone(whatsapp) && validTelegram;
}

export function requiresCommunicationChannels(stageName: string) {
  const stage = stageName.toLowerCase();
  return ['tender', 'quotation', 'quote', 'comparative', 'presentation'].some((term) => stage.includes(term));
}
